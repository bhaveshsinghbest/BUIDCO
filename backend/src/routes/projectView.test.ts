/**
 * S-03 — "Can view projects" is enforced by the API on every router that
 * returns project information, not only hidden in the UI.
 *
 * The gate runs before any service code, so these requests never reach the
 * database; authService is mocked to decide who is signed in.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { signAccessToken } from '../lib/tokens.js';

vi.mock('../services/authService.js', () => ({
  getUserById: vi.fn(),
  isSessionActive: vi.fn(async () => true),
  isDemoLoginBlocked: vi.fn(() => false),
}));

import * as authService from '../services/authService.js';

const mockedGetUserById = vi.mocked(authService.getUserById);

const app = createApp();

const PROJECT = '11111111-1111-4111-8111-111111111111';

/** One representative read on each project-data router (and a write). */
const PROJECT_DATA_ENDPOINTS: Array<[method: 'get' | 'post', path: string]> = [
  ['get', '/api/projects'],
  ['get', `/api/projects/${PROJECT}`],
  ['get', `/api/projects/${PROJECT}/cos-eot`],
  ['get', `/api/projects/${PROJECT}/milestones`],
  ['get', `/api/projects/${PROJECT}/geo-photos`],
  ['get', `/api/projects/${PROJECT}/management-actions`],
  ['get', '/api/kpis/overview'],
  ['get', '/api/kpis/district-summary'],
  ['get', '/api/funds-uc'],
  ['get', '/api/mom'],
  ['get', '/api/pre-monsoon'],
  ['get', '/api/audit'],
  ['post', '/api/projects'],
];

function bearerFor(role: 'MD' | 'Admin' | 'PD' | 'Viewer'): string {
  const { token } = signAccessToken({
    sub: '42',
    role,
    name: 'x',
    sid: 'test-session',
    ...(role === 'PD' ? { divisionId: 1 } : {}),
  });
  return `Bearer ${token}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(['Viewer', 'PD', 'Admin'] as const)('%s without "Can view projects"', (role) => {
  beforeEach(() => {
    mockedGetUserById.mockResolvedValue({
      userId: 42,
      username: 'no_view',
      fullName: 'No View',
      role,
      canCreateProjects: true,
      canUpdateProjects: true,
      canDeleteProjects: true,
      canViewProjects: false,
      ...(role === 'PD' ? { divisionId: 1 } : {}),
    });
  });

  it.each(PROJECT_DATA_ENDPOINTS)('%s %s → 403 FORBIDDEN_VIEW', async (method, path) => {
    const res = await request(app)[method](path)
      .set('Authorization', bearerFor(role))
      .set('Content-Type', 'application/json')
      .send(method === 'post' ? {} : undefined);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_VIEW');
  });
});

describe('without a session at all', () => {
  it.each(PROJECT_DATA_ENDPOINTS)('%s %s → 401', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});
