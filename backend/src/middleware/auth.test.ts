/**
 * Middleware tests for requireAuth, requireRole, and requireProject* gates.
 *
 * Strategy: build a minimal Express app that mounts each middleware on a
 * dummy route, mock authService.getUserById, sign real JWTs with the test
 * secrets, and assert status/error-code across roles.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../lib/tokens.js';
import { errorHandler } from './errorHandler.js';
import {
  requireAuth,
  requireMd,
  requireProjectCreate,
  requireProjectDelete,
  requireProjectReader,
  requireProjectView,
  requireRole,
  requireWriter,
} from './auth.js';

vi.mock('../services/authService.js', () => ({
  getUserById: vi.fn(),
  isSessionActive: vi.fn(),
  isDemoLoginBlocked: vi.fn(),
}));

import * as authService from '../services/authService.js';

const mockedGetUserById = vi.mocked(authService.getUserById);
const mockedIsSessionActive = vi.mocked(authService.isSessionActive);
const mockedIsDemoLoginBlocked = vi.mocked(authService.isDemoLoginBlocked);

const baseUser = {
  userId: 42,
  username: 'demo',
  fullName: 'Demo User',
  canCreateProjects: false,
  canUpdateProjects: false,
  canDeleteProjects: false,
  canViewProjects: true,
};

function buildApp(middlewareChain: express.RequestHandler[]): express.Express {
  const app = express();
  app.get('/gated', ...middlewareChain, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

function bearer(userId: number, role: 'MD' | 'Admin' | 'PD' | 'Viewer', extra: Record<string, unknown> = {}): string {
  const { token } = signAccessToken({
    sub: String(userId),
    role,
    name: 'x',
    sid: 'session-under-test',
    ...extra,
  });
  return `Bearer ${token}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a live session that is not a blocked demo account.
  mockedIsSessionActive.mockResolvedValue(true);
  mockedIsDemoLoginBlocked.mockReturnValue(false);
});

describe('requireAuth', () => {
  const app = buildApp([requireAuth]);

  it('401 UNAUTHENTICATED when Authorization header is missing', async () => {
    const res = await request(app).get('/gated').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toContain('Missing bearer token');
  });

  it('401 UNAUTHENTICATED when the token is malformed', async () => {
    const res = await request(app)
      .get('/gated')
      .set('Authorization', 'Bearer not.a.jwt')
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toContain('Invalid or expired');
  });

  it('401 UNAUTHENTICATED when the token is valid but the user is gone/inactive', async () => {
    mockedGetUserById.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'Viewer'))
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('200 with req.user populated when token + DB check pass', async () => {
    mockedGetUserById.mockResolvedValueOnce({
      ...baseUser,
      role: 'Viewer',
    });
    const res = await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'Viewer'))
      .expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('401 UNAUTHENTICATED for PD token missing divisionId claim', async () => {
    mockedGetUserById.mockResolvedValueOnce({
      ...baseUser,
      role: 'PD',
    });
    // Token intentionally has no divisionId claim.
    const res = await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'PD'))
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toContain('PD session');
  });
});

describe('requireRole / requireWriter / requireMd', () => {
  it('403 FORBIDDEN when a Viewer hits a Writer-only route', async () => {
    const app = buildApp([requireAuth, requireWriter]);
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'Viewer' });
    const res = await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'Viewer'))
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('200 when an Admin hits a Writer-only route', async () => {
    const app = buildApp([requireAuth, requireWriter]);
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'Admin' });
    await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'Admin'))
      .expect(200);
  });

  it('403 when an Admin hits an MD-only route', async () => {
    const app = buildApp([requireAuth, requireMd]);
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'Admin' });
    await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'Admin'))
      .expect(403);
  });

  it('200 when an MD hits an MD-only route', async () => {
    const app = buildApp([requireAuth, requireMd]);
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'MD' });
    await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'MD'))
      .expect(200);
  });

  it('requireRole throws when constructed with zero roles', () => {
    expect(() => requireRole()).toThrow(/at least one role/);
  });
});

describe('requireProjectCreate / requireProjectDelete gates', () => {
  it('MD bypasses granular flags even when canCreateProjects is false', async () => {
    const app = buildApp([requireAuth, requireProjectCreate]);
    mockedGetUserById.mockResolvedValueOnce({
      ...baseUser,
      role: 'MD',
      canCreateProjects: false,
    });
    await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'MD'))
      .expect(200);
  });

  it('Viewer with canCreateProjects=true passes create gate', async () => {
    const app = buildApp([requireAuth, requireProjectCreate]);
    mockedGetUserById.mockResolvedValueOnce({
      ...baseUser,
      role: 'Viewer',
      canCreateProjects: true,
    });
    await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'Viewer'))
      .expect(200);
  });

  it('Viewer with canCreateProjects=false is blocked at create gate', async () => {
    const app = buildApp([requireAuth, requireProjectCreate]);
    mockedGetUserById.mockResolvedValueOnce({
      ...baseUser,
      role: 'Viewer',
      canCreateProjects: false,
    });
    const res = await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'Viewer'))
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN_CREATE');
  });

  it('Viewer with canDeleteProjects=false is blocked at delete gate', async () => {
    const app = buildApp([requireAuth, requireProjectDelete]);
    mockedGetUserById.mockResolvedValueOnce({
      ...baseUser,
      role: 'Viewer',
      canDeleteProjects: false,
    });
    const res = await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'Viewer'))
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN_DELETE');
  });
});

describe('requireAuth — session binding (S-15)', () => {
  const app = buildApp([requireAuth]);

  it('401 for an access token that carries no session id', async () => {
    // Rejected before any database lookup, so no getUserById value is queued.
    const { token } = signAccessToken({ sub: '42', role: 'Viewer', name: 'x' } as never);
    const res = await request(app).get('/gated').set('Authorization', `Bearer ${token}`).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(mockedIsSessionActive).not.toHaveBeenCalled();
    expect(mockedGetUserById).not.toHaveBeenCalled();
  });

  it('401 once the session has ended (logout / reset / expiry), even with an unexpired token', async () => {
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'Viewer' });
    mockedIsSessionActive.mockResolvedValueOnce(false);
    const res = await request(app).get('/gated').set('Authorization', bearer(42, 'Viewer')).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toContain('session has ended');
    expect(mockedIsSessionActive).toHaveBeenCalledWith('session-under-test');
  });

  it('401 for a demo account where demo sign-in is blocked (S-02)', async () => {
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, username: 'demo_md', role: 'MD' });
    mockedIsDemoLoginBlocked.mockReturnValueOnce(true);
    await request(app).get('/gated').set('Authorization', bearer(42, 'MD')).expect(401);
  });
});

describe('requireProjectView — "Can view projects" (S-03)', () => {
  it('403 FORBIDDEN_VIEW for a Viewer without the flag', async () => {
    const app = buildApp([requireAuth, requireProjectView]);
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'Viewer', canViewProjects: false });
    const res = await request(app).get('/gated').set('Authorization', bearer(42, 'Viewer')).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN_VIEW');
  });

  it('403 for an Admin without the flag — Admins are not exempt', async () => {
    const app = buildApp([...requireProjectReader]);
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'Admin', canViewProjects: false });
    const res = await request(app).get('/gated').set('Authorization', bearer(42, 'Admin')).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN_VIEW');
  });

  it('403 for a PD without the flag', async () => {
    const app = buildApp([...requireProjectReader]);
    mockedGetUserById.mockResolvedValueOnce({
      ...baseUser,
      role: 'PD',
      canViewProjects: false,
      divisionId: 3,
    });
    await request(app)
      .get('/gated')
      .set('Authorization', bearer(42, 'PD', { divisionId: 3 }))
      .expect(403);
  });

  it('MD passes even with the flag off (super-user bypass)', async () => {
    const app = buildApp([...requireProjectReader]);
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'MD', canViewProjects: false });
    await request(app).get('/gated').set('Authorization', bearer(42, 'MD')).expect(200);
  });

  it('a Viewer with the flag on passes', async () => {
    const app = buildApp([...requireProjectReader]);
    mockedGetUserById.mockResolvedValueOnce({ ...baseUser, role: 'Viewer', canViewProjects: true });
    await request(app).get('/gated').set('Authorization', bearer(42, 'Viewer')).expect(200);
  });
});
