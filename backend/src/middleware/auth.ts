import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { userRoles, type UserRole } from '../db/enums.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { getUserById, isDemoLoginBlocked, isSessionActive } from '../services/authService.js';
import { HttpError } from './errorHandler.js';

function extractBearer(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req);
    if (!token) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Missing bearer token');
    }
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid or expired access token');
    }

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Malformed token subject');
    }
    if (typeof payload.sid !== 'string' || payload.sid.length === 0) {
      // Every access token is bound to a session (finding S-15).
      throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid or expired access token');
    }
    // The token says who the user is, but the database decides whether they
    // may still act: a deactivated account, or a session that has ended
    // (logout, password reset, reuse detection, absolute lifetime), is
    // refused on the very next request rather than when the token expires.
    const [user, sessionLive] = await Promise.all([
      getUserById(userId, { divisionId: payload.divisionId }),
      isSessionActive(payload.sid),
    ]);
    if (!user) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'User no longer exists or is inactive');
    }
    if (!sessionLive) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
    }
    if (isDemoLoginBlocked(user.username)) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'User no longer exists or is inactive');
    }
    // Belt-and-braces: PDs must always have a divisionId in their token. If a
    // token was minted before the role changed to PD (or vice-versa), fail
    // fast rather than serving a broken session. A stale divisionId on a
    // non-PD token is ignored: req.user only carries it for PDs (below).
    if (user.role === 'PD' && payload.divisionId === undefined) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'PD session missing division context');
    }
    req.user = {
      userId: user.userId,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
      canCreateProjects: user.canCreateProjects,
      canUpdateProjects: user.canUpdateProjects,
      canDeleteProjects: user.canDeleteProjects,
      canViewProjects: user.canViewProjects,
      ...(user.role === 'PD' && user.divisionId !== undefined
        ? { divisionId: user.divisionId }
        : {}),
    };
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(...roles: readonly UserRole[]): RequestHandler {
  if (roles.length === 0) {
    throw new Error('requireRole must be called with at least one role');
  }
  const allowed = new Set(roles);
  for (const role of roles) {
    if (!userRoles.includes(role)) {
      throw new Error(`Unknown role passed to requireRole: ${role}`);
    }
  }
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }
    if (!allowed.has(req.user.role)) {
      next(
        new HttpError(
          403,
          'FORBIDDEN',
          `Role ${req.user.role} is not permitted for this action`,
        ),
      );
      return;
    }
    next();
  };
}

/**
 * Convenience: full CRUD on projects, CoS/EoT, management actions, MoM,
 * pre-monsoon, geo photos. Matches the RBAC matrix's Admin+MD writers.
 */
export const requireWriter = requireRole('Admin', 'MD');

/** MD-only: deleting sectors/schemes (lookups.ts). Audit reads allow MD + Admin (audit.ts). */
export const requireMd = requireRole('MD');

/**
 * Fine-grained project-permission gates (Phase 6.6).
 *
 * MD always passes (super-user bypass). Admin, PD and Viewer are gated by
 * the matching `can_*_projects` flag, which requireAuth reloads from the
 * database on every request — a change in User Management applies to the
 * very next request, not when the access token expires.
 */

type PermissionKey = 'canCreateProjects' | 'canUpdateProjects' | 'canDeleteProjects' | 'canViewProjects';

function makeProjectPermissionGate(
  key: PermissionKey,
  code: string,
  verb: string,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }
    if (req.user.role === 'MD') {
      // MD always bypasses granular flags.
      next();
      return;
    }
    if (req.user[key]) {
      next();
      return;
    }
    next(
      new HttpError(
        403,
        code,
        `Your account does not have permission to ${verb} projects. Ask an MD or Admin to grant it.`,
      ),
    );
  };
}

export const requireProjectCreate = makeProjectPermissionGate(
  'canCreateProjects',
  'FORBIDDEN_CREATE',
  'create',
);
export const requireProjectUpdate = makeProjectPermissionGate(
  'canUpdateProjects',
  'FORBIDDEN_UPDATE',
  'update',
);
export const requireProjectDelete = makeProjectPermissionGate(
  'canDeleteProjects',
  'FORBIDDEN_DELETE',
  'delete',
);
/**
 * "Can view projects" (finding S-03). Applied router-wide to every API that
 * returns project information — projects and their sub-resources, dashboard
 * KPIs, Funds & UC, MoM, pre-monsoon, photo uploads and the audit trail —
 * so an account without the flag cannot read that data through any
 * endpoint, whatever the frontend shows. Writes are behind it too: a user
 * who may not see projects cannot change them either.
 */
export const requireProjectView = makeProjectPermissionGate(
  'canViewProjects',
  'FORBIDDEN_VIEW',
  'view',
);

/** requireAuth then requireProjectView — the guard for project-data routers. */
export const requireProjectReader: RequestHandler[] = [requireAuth, requireProjectView];
