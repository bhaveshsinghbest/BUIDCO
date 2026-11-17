/**
 * Rate limiting for the authentication endpoints (finding S-14).
 *
 * Where the counters live is chosen with RATE_LIMIT_STORE (see env.ts):
 *
 *   postgres  A counter table in the application database (migration 0021).
 *             Shared by every API instance, survives restarts, and keeps the
 *             data on the government server: no third-party service. This is
 *             the recommended store for government hosting.
 *   upstash   Upstash Redis over REST: shared and durable, but a third-party
 *             (possibly overseas) service holding usernames and IP addresses.
 *   memory    Held in this process. Honest limits: per instance (N instances
 *             = N times the budget) and reset by a restart. Acceptable only
 *             for a single-instance deployment.
 *   off       No limiting. Development and tests only; env.ts refuses it in
 *             production.
 *
 * Unset: upstash when its variables are present, otherwise memory in
 * production (the old fallback) and off elsewhere — the end-to-end suite
 * signs in as the same demo account far more often than any production
 * budget allows.
 *
 * History: a deployment without Upstash used to get "always allow" — a
 * startup warning, but no throttling at all. Production can no longer end up
 * unthrottled.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { env, type Env } from '../env.js';
import { logger } from './logger.js';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export type Limiter = (key: string) => Promise<RateLimitResult>;

export type RateLimitStore = 'upstash' | 'postgres' | 'memory' | 'off';

export function resolveStore(
  e: Pick<Env, 'RATE_LIMIT_STORE' | 'UPSTASH_REDIS_REST_URL' | 'UPSTASH_REDIS_REST_TOKEN' | 'NODE_ENV'>,
): RateLimitStore {
  if (e.RATE_LIMIT_STORE) return e.RATE_LIMIT_STORE;
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) return 'upstash';
  return e.NODE_ENV === 'production' ? 'memory' : 'off';
}

export const rateLimitStore: RateLimitStore = resolveStore(env);

if (rateLimitStore === 'memory' && env.NODE_ENV === 'production') {
  logger.warn('config.rate_limit_store', {
    store: 'memory',
    effect:
      'limits are per instance and reset on restart; set RATE_LIMIT_STORE=postgres when running more than one instance',
  });
} else if (rateLimitStore === 'off') {
  logger.warn('config.rate_limit_store', { store: 'off', effect: 'rate limiting disabled (not production)' });
} else {
  logger.info('config.rate_limit_store', { store: rateLimitStore });
}

const redis =
  rateLimitStore === 'upstash' && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
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

/** Executes the counter statement; injectable so it can be tested without a database. */
export type CounterQuery = (
  bucketKey: string,
  windowSeconds: number,
) => Promise<{ hits: number; windowStartedMs: number }>;

const postgresCounter: CounterQuery = async (bucketKey, windowSeconds) => {
  // One atomic statement: insert the bucket, or count one more hit in it,
  // restarting the window once it has elapsed. Concurrent requests for the
  // same key serialise on the row, so none is lost and none double-counted.
  const result = await db.execute<{ hits: number; window_started_ms: string }>(sql`
    INSERT INTO rate_limit_counter AS c (bucket_key, hits, window_started_at)
    VALUES (${bucketKey}, 1, now())
    ON CONFLICT (bucket_key) DO UPDATE SET
      hits = CASE
        WHEN c.window_started_at <= now() - make_interval(secs => ${windowSeconds}) THEN 1
        ELSE c.hits + 1
      END,
      window_started_at = CASE
        WHEN c.window_started_at <= now() - make_interval(secs => ${windowSeconds}) THEN now()
        ELSE c.window_started_at
      END
    RETURNING c.hits, floor(extract(epoch FROM c.window_started_at) * 1000)::bigint AS window_started_ms
  `);
  const row = result.rows[0];
  if (!row) throw new Error('rate_limit_counter upsert returned no row');
  return { hits: Number(row.hits), windowStartedMs: Number(row.window_started_ms) };
};

let lastCleanup = 0;
const CLEANUP_EVERY_MS = 10 * 60 * 1000;

/** Drops buckets whose window ended long ago; at most every 10 minutes per process. */
function cleanupPostgresBuckets(now: number): void {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  db.execute(sql`DELETE FROM rate_limit_counter WHERE window_started_at < now() - interval '1 day'`).catch(
    (err: unknown) => {
      logger.warn('rate_limit.cleanup_failed', { errorMessage: err instanceof Error ? err.message : String(err) });
    },
  );
}

/**
 * Fixed-window counter in PostgreSQL. Simpler than the sliding windows of
 * the other stores; the cost is that a client can use up to twice the
 * budget across a window boundary, which still bounds brute force.
 */
export function createPostgresLimiter(
  prefix: string,
  limit: number,
  windowMs: number,
  counter: CounterQuery = postgresCounter,
  cleanup: (now: number) => void = cleanupPostgresBuckets,
): Limiter {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  return async (key: string): Promise<RateLimitResult> => {
    cleanup(Date.now());
    const { hits, windowStartedMs } = await counter(`${prefix}:${key}`, windowSeconds);
    return {
      success: hits <= limit,
      remaining: Math.max(0, limit - hits),
      reset: windowStartedMs + windowSeconds * 1000,
    };
  };
}

/**
 * Fails fast at startup when the postgres store is selected but migration
 * 0021 has not been applied, instead of failing every sign-in later.
 */
export async function verifyRateLimitStore(): Promise<void> {
  if (rateLimitStore !== 'postgres') return;
  const result = await db.execute<{ present: boolean }>(
    sql`SELECT to_regclass('public.rate_limit_counter') IS NOT NULL AS present`,
  );
  if (!result.rows[0]?.present) {
    throw new Error(
      'RATE_LIMIT_STORE=postgres but table rate_limit_counter does not exist — run the database migrations (0021) first.',
    );
  }
}

const allowAll: Limiter = async () => ({
  success: true,
  remaining: Number.POSITIVE_INFINITY,
  reset: Date.now(),
});

/**
 * Builds a limiter from a budget expressed as "limit per windowMs", so every
 * store honours the same numbers.
 */
function build(prefix: string, limit: number, windowMs: number): Limiter {
  switch (rateLimitStore) {
    case 'off':
      return allowAll;
    case 'memory':
      return createInMemoryLimiter(limit, windowMs);
    case 'postgres':
      return createPostgresLimiter(prefix, limit, windowMs);
    case 'upstash': {
      if (!redis) return createInMemoryLimiter(limit, windowMs); // unreachable: env.ts checks the variables
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
  }
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const LOGIN_WINDOW_MS = env.LOGIN_RATE_LIMIT_WINDOW_SECONDS * SECOND;

/**
 * Login attempts per account (default 20 per 15 minutes).
 *
 * Chosen with the PD two-step login in mind — each PD sign-in makes two
 * POSTs to /auth/login (credentials → then divisionId). 20/15min still blocks
 * credential brute force but doesn't lock out a real MD/Admin/PD who typos
 * their password once or signs in a few times during the day.
 */
export const loginLimiter = build('rl:auth:login', env.LOGIN_RATE_LIMIT_PER_USER, LOGIN_WINDOW_MS);

/**
 * Login attempts per source IP across all accounts (default 100 per 15
 * minutes), finding S-14. Stops one address from trying a common password
 * against every account. Generous because a government office signs in from
 * behind one NAT address; tune LOGIN_RATE_LIMIT_PER_IP to the largest office.
 */
export const loginIpLimiter = build('rl:auth:login-ip', env.LOGIN_RATE_LIMIT_PER_IP, LOGIN_WINDOW_MS);

/** 20 refresh calls per minute, per IP. */
export const refreshLimiter = build('rl:auth:refresh', 20, 1 * MINUTE);

/** 20 uploads per minute, per user. */
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
