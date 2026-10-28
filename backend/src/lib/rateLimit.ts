/**
 * Upstash-backed rate limiter, with an in-process fallback.
 *
 * Upstash is the right implementation: a sliding window in Redis is shared
 * by every instance and survives restarts. When it is configured, nothing
 * here changes.
 *
 * When it is NOT configured, this used to return `{ success: true }` for
 * every check — which meant a deployment missing the env vars silently ran
 * with no brute-force protection at all. That is exactly what was found on
 * the live deployment: 26 consecutive failed logins against a configured
 * budget of 20 per 15 minutes, and not one 429. The startup line said
 * "FATAL", but nothing actually failed, so it scrolled past unnoticed.
 *
 * So in PRODUCTION the fallback is now a real sliding-window limiter held
 * in memory. Its limits are the honest ones:
 *
 *   - It is per-process. With more than one instance each gets its own
 *     budget, so the effective limit multiplies by the instance count.
 *   - It resets on restart or redeploy.
 *
 * Neither is good enough to call this a replacement for Upstash, and the
 * startup warning says so. But "imperfect and per-instance" stops a
 * credential-stuffing run; "always allow" does not.
 *
 * Outside production the fallback stays a no-op, deliberately. The login
 * budget is keyed by username (see loginKey in routes/auth.ts), and the
 * end-to-end suite signs in as the same demo account far more than 20
 * times in a 15-minute run — throttling that would break the test suite
 * and local development while fixing nothing, because the exposure being
 * closed here only exists on a deployed environment.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env, isProduction } from '../env.js';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export type Limiter = (key: string) => Promise<RateLimitResult>;

const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

if (!hasUpstash) {
  const msg = isProduction
    ? 'FATAL: UPSTASH_REDIS_REST_URL/TOKEN missing in production — falling back to a per-instance in-memory rate limiter. Limits are NOT shared across instances and reset on restart. Configure Upstash.'
    : 'warn: UPSTASH_REDIS_REST_URL/TOKEN missing — rate limiting disabled (dev only).';
  process.stderr.write(`${msg}\n`);
}

const redis =
  hasUpstash && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

/**
 * Sliding-window counter kept in this process.
 *
 * Timestamps per key, trimmed to the window on each call. Keys are bounded
 * by a sweep so a long-running process cannot accumulate one entry per
 * attacker IP forever.
 */
export function createInMemoryLimiter(limit: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  let lastSweep = Date.now();

  const sweep = (now: number): void => {
    // Cheap amortised cleanup — at most once per window.
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [k, times] of hits) {
      const kept = times.filter((t) => t > now - windowMs);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }
  };

  return async (key: string): Promise<RateLimitResult> => {
    const now = Date.now();
    sweep(now);
    const cutoff = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
    recent.push(now);
    hits.set(key, recent);

    const success = recent.length <= limit;
    const oldest = recent[0] ?? now;
    return {
      success,
      remaining: Math.max(0, limit - recent.length),
      reset: oldest + windowMs,
    };
  };
}

/**
 * Builds a limiter from a budget expressed as "limit per windowMs".
 *
 * Taking the numbers rather than a prebuilt Upstash limiter is what lets
 * the in-memory fallback honour the same budget instead of inventing one.
 */
function build(prefix: string, limit: number, windowMs: number): Limiter {
  if (!redis) {
    // Production without Upstash still gets real throttling; everywhere
    // else stays unthrottled so local runs and the e2e suite behave as
    // they always have.
    return isProduction
      ? createInMemoryLimiter(limit, windowMs)
      : async () => ({ success: true, remaining: Number.POSITIVE_INFINITY, reset: Date.now() });
  }

  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${Math.round(windowMs / 1000)} s`),
    prefix,
    analytics: false,
  });
  return async (key: string) => {
    const { success, remaining, reset } = await rl.limit(key);
    return { success, remaining, reset };
  };
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * 20 attempts per 15 minutes, per IP.
 *
 * Chosen with the PD two-step login in mind — each PD sign-in makes two
 * POSTs to /auth/login (credentials → then divisionId), so the old 5/15min
 * budget only allowed 2.5 PD sessions per window. 20/15min still blocks
 * credential brute-force (average ~1.3/min sustained) but doesn't lock out
 * a real MD/Admin/PD who typos their password once or logs in a few times
 * during the day. Increase further if legitimate lockouts happen in prod.
 */
export const loginLimiter = build('rl:auth:login', 20, 15 * MINUTE);

/** 20 refresh calls per minute, per IP. */
export const refreshLimiter = build('rl:auth:refresh', 20, 1 * MINUTE);

/** 20 uploads per minute, per user. Wired in Phase 4 when uploads land. */
export const uploadLimiter = build('rl:upload', 20, 1 * MINUTE);

/**
 * Forgot-password rate limits. Keyed by username (not IP) except the
 * lookup step, same reasoning as loginLimiter — one account's budget
 * shouldn't lock out others on the same network.
 */

/** 10 identity lookups per 15 min, per IP — bounds /request-password-reset spam. */
export const passwordResetLookupLimiter = build('rl:auth:pwreset-lookup', 10, 15 * MINUTE);

/** 1 OTP send per 45s, per user+channel — the "resend cooldown". */
export const otpSendCooldownLimiter = build('rl:auth:otp-cooldown', 1, 45 * SECOND);

/** 5 OTP sends per 15 min, per user — bounds OTP-generation abuse. */
export const otpSendLimiter = build('rl:auth:otp-send', 5, 15 * MINUTE);

/** 10 verify attempts per 15 min, per user — defense in depth on top of the per-OTP attempts counter. */
export const otpVerifyLimiter = build('rl:auth:otp-verify', 10, 15 * MINUTE);

/** 3 password-reset requests per hour, per user — bounds request-spam/approver-email-flooding. */
export const passwordResetRequestLimiter = build('rl:auth:pwreset-request', 3, 1 * HOUR);
