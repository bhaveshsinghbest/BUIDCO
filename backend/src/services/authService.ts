import { and, eq, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db/client.js';
import type { UserRole } from '../db/enums.js';
import { appUser, division, refreshToken, userDivision } from '../db/schema.js';
import { HttpError } from '../middleware/errorHandler.js';
import { verifyPassword } from '../lib/passwords.js';
import {
  parseRefreshCookie,
  signAccessToken,
  signRefreshToken,
  verifyRefreshSecret,
  type SignedAccessToken,
  type SignedRefreshToken,
} from '../lib/tokens.js';

export interface AuthenticatedUser {
  userId: number;
  username: string;
  role: UserRole;
  fullName: string | null;
  canCreateProjects: boolean;
  canUpdateProjects: boolean;
  canDeleteProjects: boolean;
  canViewProjects: boolean;
  /** PD's chosen division for this session; undefined for other roles. */
  divisionId?: number;
}

export interface LoginComplete {
  kind: 'complete';
  user: AuthenticatedUser;
  access: SignedAccessToken;
  refresh: SignedRefreshToken;
}

export interface LoginNeedsDivision {
  kind: 'needsDivision';
  /** Divisions this PD is assigned to — client shows a picker; user re-POSTs. */
  divisions: Array<{ divisionId: number; divisionName: string }>;
}

export type LoginOutcome = LoginComplete | LoginNeedsDivision;

function requestFingerprint(req: Request): { userAgent: string | null; ip: string | null } {
  const ua = req.get('user-agent') ?? null;
  const ip = req.ip ?? null;
  return { userAgent: ua, ip };
}

async function persistRefreshToken(
  userId: number,
  refresh: SignedRefreshToken,
  req: Request,
  selectedDivisionId: number | null,
): Promise<void> {
  const { userAgent, ip } = requestFingerprint(req);
  await db.insert(refreshToken).values({
    tokenId: refresh.tokenId,
    userId,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    userAgent,
    ipAddress: ip,
    selectedDivisionId,
  });
}

async function fetchAssignedDivisions(
  userId: number,
): Promise<Array<{ divisionId: number; divisionName: string }>> {
  return db
    .select({
      divisionId: division.divisionId,
      divisionName: division.divisionName,
    })
    .from(userDivision)
    .innerJoin(division, eq(division.divisionId, userDivision.divisionId))
    .where(eq(userDivision.userId, userId))
    .orderBy(division.divisionName);
}

export async function login(
  username: string,
  password: string,
  req: Request,
  divisionId: number | undefined,
): Promise<LoginOutcome> {
  const [row] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.username, username))
    .limit(1);

  if (!row || !row.isActive) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  const role = row.role as UserRole;
  let sessionDivisionId: number | null = null;

  if (role === 'PD') {
    const assigned = await fetchAssignedDivisions(row.userId);
    if (assigned.length === 0) {
      throw new HttpError(
        403,
        'PD_NO_DIVISIONS',
        'This Project Director has no divisions assigned. Ask an Admin to assign one.',
      );
    }
    if (divisionId === undefined) {
      // First step of the 2-step PD login — client shows the picker, then
      // re-POSTs with the chosen divisionId. No JWT issued yet.
      return { kind: 'needsDivision', divisions: assigned };
    }
    const match = assigned.find((d) => d.divisionId === divisionId);
    if (!match) {
      throw new HttpError(
        403,
        'DIVISION_NOT_ASSIGNED',
        'The selected division is not assigned to this account.',
      );
    }
    sessionDivisionId = divisionId;
  }
  // For non-PD roles, divisionId (if provided) is silently ignored.

  await db.update(appUser).set({ lastLogin: new Date() }).where(eq(appUser.userId, row.userId));

  const user: AuthenticatedUser = {
    userId: row.userId,
    username: row.username,
    role,
    fullName: row.fullName,
    canCreateProjects: row.canCreateProjects,
    canUpdateProjects: row.canUpdateProjects,
    canDeleteProjects: row.canDeleteProjects,
    canViewProjects: row.canViewProjects,
    ...(sessionDivisionId !== null ? { divisionId: sessionDivisionId } : {}),
  };

  const access = signAccessToken({
    sub: String(user.userId),
    role: user.role,
    name: user.fullName ?? user.username,
    ...(sessionDivisionId !== null ? { divisionId: sessionDivisionId } : {}),
  });
  const refresh = await signRefreshToken(user.userId);
  await persistRefreshToken(user.userId, refresh, req, sessionDivisionId);

  return { kind: 'complete', user, access, refresh };
}

export interface RefreshResult {
  user: AuthenticatedUser;
  access: SignedAccessToken;
  refresh: SignedRefreshToken;
}

/** Callers pass just the sub identifier; getUserById is the source of truth. */
export interface GetUserOptions {
  divisionId?: number | undefined;
}

type RefreshTokenRow = typeof refreshToken.$inferSelect;

/**
 * A hard page reload re-triggers the silent refresh flow from scratch. If
 * one reload's refresh request is still in flight (server has rotated the
 * token, but its Set-Cookie response hasn't reached the browser yet) when
 * the NEXT reload fires its own refresh using the same now-stale cookie,
 * that second request looks identical to an attacker replaying a stolen
 * token. Tolerating reuse for a few seconds — but only by fast-forwarding
 * to whatever the chain has already rotated to, never by accepting a token
 * whose secret doesn't check out — keeps the "reuse = revoke everything"
 * protection for genuine theft while not punishing this benign race.
 */
const REUSE_GRACE_MS = 5_000;

async function findLiveDescendantWithinGrace(row: RefreshTokenRow): Promise<RefreshTokenRow | null> {
  let current = row;
  for (let hops = 0; hops < 5; hops++) {
    if (!current.revokedAt || Date.now() - current.revokedAt.getTime() > REUSE_GRACE_MS) {
      return null;
    }
    if (!current.replacedBy) return null;
    const [next] = await db
      .select()
      .from(refreshToken)
      .where(eq(refreshToken.tokenId, current.replacedBy))
      .limit(1);
    if (!next) return null;
    if (!next.revokedAt) return next; // live end of the chain, still within grace throughout
    current = next;
  }
  return null;
}

async function finishRefresh(row: RefreshTokenRow, req: Request): Promise<RefreshResult> {
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token expired');
  }

  const [userRow] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.userId, row.userId))
    .limit(1);

  if (!userRow || !userRow.isActive) {
    throw new HttpError(401, 'USER_INACTIVE', 'User account is inactive');
  }

  // PD sessions carry over the selected division so refreshes don't drop it.
  const preservedDivisionId = row.selectedDivisionId ?? null;
  const nextRefresh = await signRefreshToken(userRow.userId);

  await db.transaction(async (tx) => {
    await tx.insert(refreshToken).values({
      tokenId: nextRefresh.tokenId,
      userId: userRow.userId,
      tokenHash: nextRefresh.tokenHash,
      expiresAt: nextRefresh.expiresAt,
      userAgent: req.get('user-agent') ?? null,
      ipAddress: req.ip ?? null,
      selectedDivisionId: preservedDivisionId,
    });
    await tx
      .update(refreshToken)
      .set({ revokedAt: new Date(), replacedBy: nextRefresh.tokenId })
      .where(eq(refreshToken.tokenId, row.tokenId));
  });

  const user: AuthenticatedUser = {
    userId: userRow.userId,
    username: userRow.username,
    role: userRow.role as UserRole,
    fullName: userRow.fullName,
    canCreateProjects: userRow.canCreateProjects,
    canUpdateProjects: userRow.canUpdateProjects,
    canDeleteProjects: userRow.canDeleteProjects,
    canViewProjects: userRow.canViewProjects,
    ...(preservedDivisionId !== null ? { divisionId: preservedDivisionId } : {}),
  };

  const access = signAccessToken({
    sub: String(user.userId),
    role: user.role,
    name: user.fullName ?? user.username,
    ...(preservedDivisionId !== null ? { divisionId: preservedDivisionId } : {}),
  });

  return { user, access, refresh: nextRefresh };
}

export async function refresh(cookieValue: string, req: Request): Promise<RefreshResult> {
  let parsed;
  try {
    parsed = parseRefreshCookie(cookieValue);
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token invalid');
  }

  const [row] = await db
    .select()
    .from(refreshToken)
    .where(eq(refreshToken.tokenId, parsed.payload.jti))
    .limit(1);

  if (!row) {
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token invalid');
  }
  if (row.revokedAt) {
    // The presented secret must still check out against the token this
    // reuse actually belongs to — a grace period isn't a way to skip proving
    // possession of a genuinely-issued token.
    const secretOk = await verifyRefreshSecret(parsed.rawSecret, row.tokenHash);
    const liveDescendant = secretOk ? await findLiveDescendantWithinGrace(row) : null;
    if (liveDescendant) {
      return finishRefresh(liveDescendant, req);
    }
    // Outside the grace window (or the secret didn't match at all) — reuse
    // of a rotated/revoked token is a red flag — nuke every active session
    // for the user so an attacker holding an old copy can't proceed.
    await db
      .update(refreshToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshToken.userId, row.userId), isNull(refreshToken.revokedAt)));
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token reuse detected');
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token expired');
  }

  const secretOk = await verifyRefreshSecret(parsed.rawSecret, row.tokenHash);
  if (!secretOk) {
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token invalid');
  }

  return finishRefresh(row, req);
}

export async function logout(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return;
  let parsed;
  try {
    parsed = parseRefreshCookie(cookieValue);
  } catch {
    return;
  }
  await db
    .update(refreshToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshToken.tokenId, parsed.payload.jti), isNull(refreshToken.revokedAt)));
}

export async function getUserById(
  userId: number,
  opts: GetUserOptions = {},
): Promise<AuthenticatedUser | null> {
  const [row] = await db.select().from(appUser).where(eq(appUser.userId, userId)).limit(1);
  if (!row || !row.isActive) return null;
  return {
    userId: row.userId,
    username: row.username,
    role: row.role as UserRole,
    fullName: row.fullName,
    canCreateProjects: row.canCreateProjects,
    canUpdateProjects: row.canUpdateProjects,
    canDeleteProjects: row.canDeleteProjects,
    canViewProjects: row.canViewProjects,
    ...(opts.divisionId !== undefined ? { divisionId: opts.divisionId } : {}),
  };
}
