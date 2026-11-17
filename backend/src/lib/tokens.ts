/**
 * JWT + refresh-token cryptography.
 *
 * Access token  — HS256, `env.JWT_ACCESS_SECRET`, TTL from env, carries
 *                 { sub, role, name, sid }. `sid` is the session id; the
 *                 auth middleware accepts the token only while that session
 *                 is live in refresh_token (finding S-15), so a forged token
 *                 also needs a live session id, not just the signing key.
 * Refresh token — HS256, `env.JWT_REFRESH_SECRET`, TTL from env, carries
 *                 { sub, jti } where jti is the refresh_token PK. The token
 *                 must also match the bcrypt hash stored on that row — the
 *                 signed JWT alone is not sufficient (so a leaked secret
 *                 does not immediately grant refresh, and revocation is
 *                 authoritative at the DB level).
 */

import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../env.js';
import type { UserRole } from '../db/enums.js';

const REFRESH_HASH_ROUNDS = 10;

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  name: string;
  /** Session id (refresh_token.session_id) this access token belongs to. */
  sid: string;
  /**
   * PD's selected division for the session. Present only when `role === 'PD'`.
   * Server-side division filtering will use this on every request (Phase C2).
   */
  divisionId?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface SignedRefreshToken {
  /** The cookie value: `<jti>.<random-secret>` */
  cookieValue: string;
  /** UUIDv4 row id in refresh_token */
  tokenId: string;
  /** bcrypt hash of the raw secret half — store this on the row. */
  tokenHash: string;
  /** JWT expiry as a Date. */
  expiresAt: Date;
}

function signHs256(secret: string, payload: object, ttlSeconds: number): { token: string; expiresAt: Date } {
  const options: SignOptions = { algorithm: 'HS256', expiresIn: ttlSeconds };
  const token = jwt.sign(payload, secret, options);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  return { token, expiresAt };
}

export function signAccessToken(payload: AccessTokenPayload): SignedAccessToken {
  return signHs256(env.JWT_ACCESS_SECRET, payload, env.ACCESS_TOKEN_TTL_SECONDS);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string') {
    throw new Error('Access token payload was a string, expected an object');
  }
  return decoded as AccessTokenPayload & JwtPayload;
}

/**
 * `ttlSeconds` defaults to the idle timeout; callers pass less when the
 * session's absolute lifetime ends sooner (see authService).
 */
export async function signRefreshToken(
  userId: number,
  ttlSeconds: number = env.REFRESH_TOKEN_TTL_SECONDS,
): Promise<SignedRefreshToken> {
  const tokenId = randomUUID();
  const rawSecret = randomBytes(32).toString('base64url');

  const jwtPayload: RefreshTokenPayload = { sub: String(userId), jti: tokenId };
  const { token: jwtToken, expiresAt } = signHs256(
    env.JWT_REFRESH_SECRET,
    jwtPayload,
    Math.max(1, Math.floor(ttlSeconds)),
  );

  const cookieValue = `${jwtToken}.${rawSecret}`;
  const tokenHash = await bcrypt.hash(rawSecret, REFRESH_HASH_ROUNDS);

  return { cookieValue, tokenId, tokenHash, expiresAt };
}

export interface ParsedRefreshCookie {
  payload: RefreshTokenPayload;
  rawSecret: string;
}

export function parseRefreshCookie(cookieValue: string): ParsedRefreshCookie {
  const lastDot = cookieValue.lastIndexOf('.');
  if (lastDot === -1) {
    throw new Error('Malformed refresh cookie');
  }
  const jwtToken = cookieValue.slice(0, lastDot);
  const rawSecret = cookieValue.slice(lastDot + 1);
  if (!jwtToken || !rawSecret) {
    throw new Error('Malformed refresh cookie');
  }

  const decoded = jwt.verify(jwtToken, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || typeof decoded.jti !== 'string' || typeof decoded.sub !== 'string') {
    throw new Error('Refresh token payload malformed');
  }
  return {
    payload: { sub: decoded.sub, jti: decoded.jti },
    rawSecret,
  };
}

export function verifyRefreshSecret(rawSecret: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(rawSecret, storedHash);
}
