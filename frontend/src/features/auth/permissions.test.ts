import { describe, expect, it } from 'vitest';
import {
  selectCanCreateProjects,
  selectCanDeleteProjects,
  selectCanManageUsers,
  selectCanUpdateProjects,
  selectCanViewProjects,
  type AuthState,
} from './authSlice';

function stateWith(overrides: Partial<AuthState['user'] & object> | null): { auth: AuthState } {
  if (overrides === null) {
    return {
      auth: {
        user: null,
        accessToken: null,
        accessTokenExpiresAt: null,
        status: 'out',
        showMdBriefing: false,
      },
    };
  }
  return {
    auth: {
      user: {
        userId: 1,
        username: 'u',
        role: 'Viewer',
        fullName: null,
        canCreateProjects: false,
        canUpdateProjects: false,
        canDeleteProjects: false,
        canViewProjects: false,
        ...overrides,
      },
      accessToken: 'tok',
      accessTokenExpiresAt: '2026-08-01T00:00:00.000Z',
      status: 'in',
      showMdBriefing: false,
    },
  };
}

describe('permission selectors', () => {
  it('unauthenticated user has no permissions', () => {
    const s = stateWith(null);
    expect(selectCanCreateProjects(s)).toBe(false);
    expect(selectCanUpdateProjects(s)).toBe(false);
    expect(selectCanDeleteProjects(s)).toBe(false);
    expect(selectCanManageUsers(s)).toBe(false);
  });

  it('MD bypasses all granular flags', () => {
    const s = stateWith({ role: 'MD' });
    expect(selectCanCreateProjects(s)).toBe(true);
    expect(selectCanUpdateProjects(s)).toBe(true);
    expect(selectCanDeleteProjects(s)).toBe(true);
    expect(selectCanManageUsers(s)).toBe(true);
  });

  it('Admin can manage users but their per-flag CRUD is driven by the flag', () => {
    const s = stateWith({ role: 'Admin' });
    expect(selectCanManageUsers(s)).toBe(true);
    // Admin without granular flags in state would be false — backend backfill sets them
    // TRUE so this matches production. Selector honours whatever the flag says.
    expect(selectCanCreateProjects(s)).toBe(false);
  });

  it('Viewer with granted flag can perform that specific action', () => {
    const s = stateWith({ role: 'Viewer', canCreateProjects: true });
    expect(selectCanCreateProjects(s)).toBe(true);
    expect(selectCanUpdateProjects(s)).toBe(false);
    expect(selectCanDeleteProjects(s)).toBe(false);
    expect(selectCanManageUsers(s)).toBe(false);
  });

  it('Viewer without flags has no project CRUD', () => {
    const s = stateWith({ role: 'Viewer' });
    expect(selectCanCreateProjects(s)).toBe(false);
    expect(selectCanUpdateProjects(s)).toBe(false);
    expect(selectCanDeleteProjects(s)).toBe(false);
    expect(selectCanManageUsers(s)).toBe(false);
  });

  it('"Can view projects" follows the flag for every role except MD (S-03)', () => {
    expect(selectCanViewProjects(stateWith(null))).toBe(false);
    expect(selectCanViewProjects(stateWith({ role: 'MD', canViewProjects: false }))).toBe(true);
    for (const role of ['Admin', 'PD', 'Viewer'] as const) {
      expect(selectCanViewProjects(stateWith({ role, canViewProjects: false })), role).toBe(false);
      expect(selectCanViewProjects(stateWith({ role, canViewProjects: true })), role).toBe(true);
    }
  });
});
