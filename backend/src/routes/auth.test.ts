/**
 * Integration tests for /api/auth/* — the HTTP layer.
 *
 * Strategy: mock authService so we exercise routing, zod validation, error
 * mapping, rate-limit response codes, cookie flags, and content-type
 * enforcement — WITHOUT touching a real database.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { HttpError } from '../middleware/errorHandler.js';

vi.mock('../services/authService.js', () => ({
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getUserById: vi.fn(),
  isSessionActive: vi.fn(async () => true),
  isDemoLoginBlocked: vi.fn(() => false),
}));

const limiters = vi.hoisted(() => {
  const allow = async () => ({ success: true, remaining: Infinity, reset: Date.now() });
  return { allow, loginIp: vi.fn(allow), loginUser: vi.fn(allow) };
});

vi.mock('../lib/rateLimit.js', async () => {
  // Deterministic limiters; the two login ones can be told to refuse.
  return {
    loginLimiter: limiters.loginUser,
    loginIpLimiter: limiters.loginIp,
    refreshLimiter: limiters.allow,
    uploadLimiter: limiters.allow,
    passwordResetLookupLimiter: limiters.allow,
    passwordResetRequestLimiter: limiters.allow,
    otpSendCooldownLimiter: limiters.allow,
    otpSendLimiter: limiters.allow,
    otpVerifyLimiter: limiters.allow,
  };
});

import * as authService from '../services/authService.js';

const mockedLogin = vi.mocked(authService.login);
const mockedRefresh = vi.mocked(authService.refresh);
const mockedLogout = vi.mocked(authService.logout);

const app = createApp();

const validUser = {
  userId: 1,
  username: 'shri',
  role: 'MD' as const,
  fullName: 'Shri',
  canCreateProjects: true,
  canUpdateProjects: true,
  canDeleteProjects: true,
  canViewProjects: true,
};

const successOutcome = {
  kind: 'complete' as const,
  user: validUser,
  access: { token: 'access.jwt.token', expiresAt: new Date(Date.now() + 900_000) },
  refresh: {
    cookieValue: 'refresh.jwt.token.rawsecret',
    tokenId: 'tid-1',
    tokenHash: 'hashvalue',
    expiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  limiters.loginIp.mockImplementation(limiters.allow);
  limiters.loginUser.mockImplementation(limiters.allow);
});

describe('POST /api/auth/login', () => {
  it('returns 400 VALIDATION_ERROR when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ password: 'x' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when password is empty', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'shri', password: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 INVALID_CREDENTIALS on wrong password', async () => {
    mockedLogin.mockRejectedValueOnce(
      new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password'),
    );
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'shri', password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 200 + sets refresh cookie on success', async () => {
    mockedLogin.mockResolvedValueOnce(successOutcome);
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'shri', password: 'correct-password' })
      .expect(200);

    expect(res.body.user).toEqual(validUser);
    expect(res.body.accessToken).toBe('access.jwt.token');
    expect(typeof res.body.accessTokenExpiresAt).toBe('string');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const refreshCookie = setCookie.find((c) => c.startsWith('buidco_refresh='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');
    expect(refreshCookie).toContain('Path=/api/auth');
  });

  it('returns 200 with { needsDivision, divisions } for PD step 1', async () => {
    mockedLogin.mockResolvedValueOnce({
      kind: 'needsDivision',
      divisions: [
        { divisionId: 1, divisionName: 'Patna Municipal' },
        { divisionId: 2, divisionName: 'Gaya' },
      ],
    });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'pd_user', password: 'pd_password' })
      .expect(200);

    expect(res.body.needsDivision).toBe(true);
    expect(res.body.divisions).toHaveLength(2);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('refresh cookie expires with the token inside it (S-15)', async () => {
    const twoHours = 2 * 3600_000;
    mockedLogin.mockResolvedValueOnce({
      ...successOutcome,
      refresh: { ...successOutcome.refresh, expiresAt: new Date(Date.now() + twoHours) },
    });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'shri', password: 'correct-password' })
      .expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('buidco_refresh='),
    );
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie ?? '')?.[1]);
    expect(maxAge).toBeGreaterThan(2 * 3600 - 10);
    expect(maxAge).toBeLessThanOrEqual(2 * 3600);
  });

  it('429 from the per-IP budget before the account is even looked up (S-14)', async () => {
    limiters.loginIp.mockResolvedValueOnce({ success: false, remaining: 0, reset: Date.now() + 60_000 });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'any-account', password: 'x' })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
    expect(limiters.loginUser).not.toHaveBeenCalled();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it('per-IP and per-account budgets are keyed differently', async () => {
    mockedLogin.mockResolvedValueOnce(successOutcome);
    await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'Shri', password: 'correct-password' })
      .expect(200);
    expect(limiters.loginIp).toHaveBeenCalledWith(expect.stringMatching(/^ip:/));
    expect(limiters.loginUser).toHaveBeenCalledWith('user:shri');
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 415 UNSUPPORTED_MEDIA_TYPE when Content-Type is not JSON', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Content-Type', 'text/plain')
      .send('anything')
      .expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it('returns 401 NO_REFRESH_COOKIE when the cookie is missing', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(401);
    expect(res.body.error.code).toBe('NO_REFRESH_COOKIE');
  });

  it('returns 401 INVALID_REFRESH when the service rejects the token', async () => {
    mockedRefresh.mockRejectedValueOnce(
      new HttpError(401, 'INVALID_REFRESH', 'Refresh token invalid'),
    );
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', 'buidco_refresh=malformed.value')
      .send({})
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH');
  });

  it('rotates the cookie + returns a fresh access token on success', async () => {
    mockedRefresh.mockResolvedValueOnce({
      user: validUser,
      access: successOutcome.access,
      refresh: {
        ...successOutcome.refresh,
        cookieValue: 'rotated.jwt.rawsecret',
      },
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', 'buidco_refresh=old.valid.cookie')
      .send({})
      .expect(200);

    expect(res.body.accessToken).toBe('access.jwt.token');
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((c) => c.includes('buidco_refresh=rotated.jwt.rawsecret'))).toBe(true);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 204 and clears the cookie, even without a session', async () => {
    mockedLogout.mockResolvedValueOnce({ userId: null });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(204);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    // Express clearCookie sets Expires in the past
    expect(setCookie.some((c) => c.startsWith('buidco_refresh='))).toBe(true);
  });

  it('passes the cookie to the service so the whole session is revoked', async () => {
    mockedLogout.mockResolvedValueOnce({ userId: 7 });
    await request(app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json')
      .set('Cookie', 'buidco_refresh=some.cookie.value')
      .send({})
      .expect(204);
    expect(mockedLogout).toHaveBeenCalledWith('some.cookie.value');
  });

  it('415 for a non-JSON request, e.g. a cross-site form post (S-28)', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Cookie', 'buidco_refresh=some.cookie.value')
      .send('a=1')
      .expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(mockedLogout).not.toHaveBeenCalled();
  });

  it('415 when no Content-Type is sent at all', async () => {
    await request(app).post('/api/auth/logout').expect(415);
    expect(mockedLogout).not.toHaveBeenCalled();
  });
});

describe('password-reset code delivery (S-04)', () => {
  it('refuses the mobile channel — no SMS gateway is approved', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .set('Content-Type', 'application/json')
      .send({ username: 'shri', channel: 'mobile' })
      .expect(400);
    expect(res.body.error.code).toBe('CHANNEL_UNAVAILABLE');
  });

  it('refuses a mobile password-reset request before anything is stored', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset-requests')
      .set('Content-Type', 'application/json')
      .send({ username: 'some_pd', channel: 'mobile' })
      .expect(400);
    expect(res.body.error.code).toBe('CHANNEL_UNAVAILABLE');
  });

  it('answers 503 for e-mail when SMTP is not configured, instead of logging the code', async () => {
    // The test environment has no SMTP_* variables.
    const res = await request(app)
      .post('/api/auth/send-otp')
      .set('Content-Type', 'application/json')
      .send({ username: 'whoever', channel: 'email' })
      .expect(503);
    expect(res.body.error.code).toBe('OTP_DELIVERY_UNAVAILABLE');
  });
});
