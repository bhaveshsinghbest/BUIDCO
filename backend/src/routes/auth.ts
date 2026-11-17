import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../lib/cookies.js';
import { logger } from '../lib/logger.js';
import {
  loginIpLimiter,
  loginLimiter,
  otpSendCooldownLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  passwordResetLookupLimiter,
  passwordResetRequestLimiter,
  refreshLimiter,
} from '../lib/rateLimit.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as authService from '../services/authService.js';
import * as passwordResetRequestService from '../services/passwordResetRequestService.js';
import * as passwordResetService from '../services/passwordResetService.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
  /** Required only for PDs; step 2 of the 2-step PD login. */
  divisionId: z.number().int().positive().optional(),
});

function ipKey(req: Request): string {
  return `ip:${req.ip ?? 'unknown'}`;
}

/**
 * Per-account login key: the submitted username (case-folded). Each account
 * has its own budget, so one PD's typos can't lock out MDs sharing the same
 * office network. Falls back to IP if the body is missing/malformed so a
 * flood of empty POSTs still gets throttled.
 *
 * Paired with a per-IP budget (loginIpLimiter, finding S-14): keyed by
 * username alone, one address could try a common password against every
 * account without ever being throttled.
 */
function loginKey(req: Request): string {
  const body = req.body as { username?: unknown } | undefined;
  if (body && typeof body.username === 'string') {
    const u = body.username.trim().toLowerCase();
    if (u.length > 0) return `user:${u}`;
  }
  return ipKey(req);
}

/** The attempted username for the security log: trimmed and bounded. */
function attemptedUsername(req: Request): string | null {
  const body = req.body as { username?: unknown } | undefined;
  if (!body || typeof body.username !== 'string') return null;
  return body.username.trim().slice(0, 60);
}

function clientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 200) ?? null };
}

function setSuccessResponse(
  res: Response,
  result: {
    user: authService.AuthenticatedUser;
    access: { token: string; expiresAt: Date };
    refresh: { cookieValue: string; expiresAt: Date };
  },
): void {
  // The cookie lives exactly as long as the token inside it: the idle
  // timeout, or less when the session's absolute lifetime ends first (S-15).
  const options = refreshCookieOptions();
  options.maxAge = Math.max(0, result.refresh.expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, result.refresh.cookieValue, options);
  res.json({
    user: result.user,
    accessToken: result.access.token,
    accessTokenExpiresAt: result.access.expiresAt.toISOString(),
  });
}

const rateLimit = (
  name: string,
  limiter: (key: string) => Promise<{ success: boolean; reset: number }>,
  keyFn: (req: Request) => string,
): RequestHandler =>
  async (req, res, next) => {
    try {
      const { success, reset } = await limiter(keyFn(req));
      if (!success) {
        logger.warn('security.rate_limited', {
          limiter: name,
          path: req.baseUrl + req.path,
          ip: req.ip ?? null,
          username: attemptedUsername(req),
        });
        res.setHeader('Retry-After', Math.max(0, Math.ceil((reset - Date.now()) / 1000)));
        throw new HttpError(429, 'RATE_LIMITED', 'Too many requests');
      }
      next();
    } catch (err) {
      next(err);
    }
  };

const requireJsonContentType: RequestHandler = (req, _res, next) => {
  const ct = req.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('application/json')) {
    next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
    return;
  }
  next();
};

authRouter.post(
  '/login',
  // Per-IP first (S-14), then per-account; both spend budget on every attempt.
  rateLimit('login-ip', loginIpLimiter, ipKey),
  rateLimit('login-user', loginLimiter, loginKey),
  async (req, res, next) => {
    try {
      const parsed = loginSchema.parse(req.body);
      const outcome = await authService.login(
        parsed.username,
        parsed.password,
        req,
        parsed.divisionId,
      );
      if (outcome.kind === 'needsDivision') {
        // Step 1 of PD login: credentials verified but division not yet
        // picked. Return the available divisions; client re-POSTs with the
        // chosen divisionId. No refresh cookie set until step 2.
        logger.info('auth.login.division_required', {
          username: parsed.username.slice(0, 60),
          ...clientInfo(req),
        });
        res.json({ needsDivision: true, divisions: outcome.divisions });
        return;
      }
      logger.info('auth.login.success', {
        userId: outcome.user.userId,
        username: outcome.user.username,
        role: outcome.user.role,
        divisionId: outcome.user.divisionId ?? null,
        ...clientInfo(req),
      });
      setSuccessResponse(res, outcome);
    } catch (err) {
      // Failed sign-ins (S-11). The password is never logged; the attempted
      // username is, so password-spraying across accounts is visible.
      if (err instanceof HttpError) {
        logger.warn('auth.login.failure', {
          username: attemptedUsername(req),
          reason: err.code,
          status: err.status,
          ...clientInfo(req),
        });
      }
      next(err);
    }
  },
);

authRouter.post(
  '/refresh',
  requireJsonContentType,
  // Refresh has no username in body — stays IP-keyed.
  rateLimit('refresh', refreshLimiter, ipKey),
  async (req, res, next) => {
    try {
      const cookieValue = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
      if (!cookieValue) {
        throw new HttpError(401, 'NO_REFRESH_COOKIE', 'Refresh cookie missing');
      }
      const result = await authService.refresh(cookieValue, req);
      setSuccessResponse(res, result);
    } catch (err) {
      // A missing cookie is the normal "not signed in" page load; anything
      // else (expired, revoked, reused) is worth a line.
      if (err instanceof HttpError && err.code !== 'NO_REFRESH_COOKIE') {
        logger.warn('auth.refresh.failure', { reason: err.code, ...clientInfo(req) });
      }
      next(err);
    }
  },
);

/**
 * Same JSON content-type requirement as /refresh (finding S-28): a
 * cross-site HTML form can only send form encodings, so it can no longer
 * sign a user out. The session is revoked server-side whether or not the
 * cookie is still valid, and the cookie is always cleared.
 */
authRouter.post('/logout', requireJsonContentType, async (req, res, next) => {
  try {
    const cookieValue = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
    const { userId } = await authService.logout(cookieValue);
    if (userId !== null) {
      logger.info('auth.logout', { userId, ...clientInfo(req) });
    }
    const clear = refreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE_NAME, {
      ...(clear.domain !== undefined ? { domain: clear.domain } : {}),
      path: clear.path,
      httpOnly: clear.httpOnly,
      secure: clear.secure,
      sameSite: clear.sameSite,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = req.user;
  if (!user) {
    // requireAuth guarantees this, but the type system doesn't know.
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    return;
  }
  res.json({ user });
});

/* ============================================================
 * FORGOT PASSWORD (OTP)
 *
 * All four endpoints are public (no requireAuth — a locked-out user by
 * definition can't authenticate yet), rate-limited by username so one
 * account's abuse budget doesn't affect others, and never reveal whether
 * a username exists via response shape (Task 10).
 * ============================================================ */

const usernameSchema = z.object({ username: z.string().min(1).max(60) });
const channelSchema = z.enum(['email', 'mobile']);

function usernameKey(req: Request): string {
  const body = req.body as { username?: unknown } | undefined;
  if (body && typeof body.username === 'string') {
    const u = body.username.trim().toLowerCase();
    if (u.length > 0) return `user:${u}`;
  }
  return ipKey(req);
}

function usernameChannelKey(req: Request): string {
  const body = req.body as { username?: unknown; channel?: unknown } | undefined;
  if (body && typeof body.username === 'string' && typeof body.channel === 'string') {
    const u = body.username.trim().toLowerCase();
    if (u.length > 0) return `user:${u}:${body.channel}`;
  }
  return ipKey(req);
}

authRouter.post(
  '/request-password-reset',
  rateLimit('pwreset-lookup', passwordResetLookupLimiter, ipKey),
  async (req, res, next) => {
    try {
      const { username } = usernameSchema.parse(req.body);
      const result = await passwordResetService.requestPasswordReset(username);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

const sendOtpSchema = z.object({ username: z.string().min(1).max(60), channel: channelSchema });

authRouter.post(
  '/send-otp',
  rateLimit('otp-cooldown', otpSendCooldownLimiter, usernameChannelKey),
  rateLimit('otp-send', otpSendLimiter, usernameKey),
  async (req, res, next) => {
    try {
      const { username, channel } = sendOtpSchema.parse(req.body);
      // e-mail only, and only when SMTP is configured (S-04).
      passwordResetService.assertOtpDeliveryPossible(channel);
      await passwordResetService.sendOtp(username, channel, req);
      res.json({ sent: true });
    } catch (err) {
      next(err);
    }
  },
);

const verifyOtpSchema = z.object({
  username: z.string().min(1).max(60),
  channel: channelSchema,
  otp: z.string().length(6),
});

authRouter.post(
  '/verify-otp',
  rateLimit('otp-verify', otpVerifyLimiter, usernameKey),
  async (req, res, next) => {
    try {
      const { username, channel, otp } = verifyOtpSchema.parse(req.body);
      const result = await passwordResetService.verifyOtp(username, channel, otp);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

const resetPasswordSchema = z
  .object({
    resetToken: z.string().min(1),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  });

authRouter.post(
  '/reset-password',
  rateLimit('pwreset-lookup', passwordResetLookupLimiter, ipKey),
  async (req, res, next) => {
    try {
      const { resetToken, password, confirmPassword } = resetPasswordSchema.parse(req.body);
      await passwordResetService.resetPassword(resetToken, password, confirmPassword);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Submitted pre-login by a locked-out Admin/PD/Viewer (MD self-serves via
 * send-otp directly and never hits this). There is no separate approval
 * action anywhere: if an eligible approver has contact info on file, the
 * request resolves immediately and this same call fires the OTP straight
 * to them (reusing sendOtp) — the code itself, relayed by the approver
 * out of band, is the approval.
 */
authRouter.post(
  '/password-reset-requests',
  rateLimit('pwreset-request', passwordResetRequestLimiter, usernameKey),
  async (req, res, next) => {
    try {
      const { username, channel } = sendOtpSchema.parse(req.body);
      // Checked before the request row is created (S-04).
      passwordResetService.assertOtpDeliveryPossible(channel);
      const { otpSent } = await passwordResetRequestService.createRequest(username, channel, req);
      if (otpSent) {
        await passwordResetService.sendOtp(username, channel, req);
      }
      res.status(201).json({ submitted: true, otpSent });
    } catch (err) {
      next(err);
    }
  },
);
