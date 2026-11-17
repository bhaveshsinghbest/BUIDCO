import { describe, expect, it } from 'vitest';
import {
  parseRefreshCookie,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshSecret,
} from './tokens.js';

describe('access tokens', () => {
  it('round-trips a payload, including the session id', () => {
    const { token, expiresAt } = signAccessToken({
      sub: '42',
      role: 'Admin',
      name: 'Test User',
      sid: 'session-1',
    });
    expect(token.split('.').length).toBe(3);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('42');
    expect(decoded.role).toBe('Admin');
    expect(decoded.name).toBe('Test User');
    expect(decoded.sid).toBe('session-1');
  });

  it('rejects tampered tokens', () => {
    const { token } = signAccessToken({ sub: '1', role: 'Viewer', name: 'x', sid: 's' });
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

describe('refresh tokens', () => {
  it('produces a cookie value + separate hash', async () => {
    const t = await signRefreshToken(7);
    expect(t.cookieValue).toContain('.');
    expect(t.tokenId).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.tokenHash).toMatch(/^\$2[aby]?\$/);
    expect(t.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('parses back to the same jti + a secret that matches the hash', async () => {
    const t = await signRefreshToken(7);
    const parsed = parseRefreshCookie(t.cookieValue);
    expect(parsed.payload.jti).toBe(t.tokenId);
    expect(parsed.payload.sub).toBe('7');
    await expect(verifyRefreshSecret(parsed.rawSecret, t.tokenHash)).resolves.toBe(true);
  });

  it('honours a shorter lifetime when the session ends sooner (S-15)', async () => {
    const t = await signRefreshToken(7, 60);
    const msLeft = t.expiresAt.getTime() - Date.now();
    expect(msLeft).toBeGreaterThan(55_000);
    expect(msLeft).toBeLessThanOrEqual(60_000);
  });

  it('rejects a random secret against the stored hash', async () => {
    const t = await signRefreshToken(7);
    await expect(verifyRefreshSecret('not-the-real-secret', t.tokenHash)).resolves.toBe(false);
  });

  it('throws on a malformed cookie', () => {
    expect(() => parseRefreshCookie('no-dot-here')).toThrow(/Malformed/);
    expect(() => parseRefreshCookie('bad.jwt.value')).toThrow();
  });
});
