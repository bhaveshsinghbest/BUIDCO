/**
 * Configuration rules that make an insecure deployment fail at startup
 * instead of running quietly (findings S-05, S-10, S-14, S-15, S-21, S-26).
 */
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const BASE = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://app@localhost:5432/buidco',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  CORS_ALLOWED_ORIGINS: 'https://dashboard.example.gov.in',
};

describe('environment validation', () => {
  it('accepts a minimal production configuration with secure defaults', () => {
    const env = parseEnv(BASE);
    expect(env.REFRESH_TOKEN_TTL_SECONDS).toBe(7200);
    expect(env.SESSION_MAX_AGE_SECONDS).toBe(43200);
    expect(env.ALLOW_DEMO_ACCOUNTS).toBe('false');
    expect(env.SEARCH_TRANSLATION).toBe('off');
    expect(env.LOGIN_RATE_LIMIT_PER_IP).toBe(100);
  });

  it('refuses to start without NODE_ENV — there is no default any more (S-05)', () => {
    const withoutNodeEnv: Record<string, string | undefined> = { ...BASE };
    delete withoutNodeEnv.NODE_ENV;
    expect(() => parseEnv(withoutNodeEnv)).toThrow(/NODE_ENV is required/);
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('treats empty assignments copied from .env.example as unset', () => {
    const env = parseEnv({ ...BASE, DB_SSL: '', RATE_LIMIT_STORE: '', PHOTO_STORAGE: '', TRUST_PROXY: '' });
    expect(env.DB_SSL).toBeUndefined();
    expect(env.RATE_LIMIT_STORE).toBeUndefined();
    expect(env.PHOTO_STORAGE).toBeUndefined();
    expect(env.TRUST_PROXY).toBeUndefined();
  });

  it('refuses unverified database TLS in production, allows it in development (S-10)', () => {
    expect(() => parseEnv({ ...BASE, DB_SSL: 'no-verify' })).toThrow(/DB_SSL/);
    expect(parseEnv({ ...BASE, NODE_ENV: 'development', DB_SSL: 'no-verify' }).DB_SSL).toBe('no-verify');
  });

  it('refuses switching rate limiting off in production (S-14)', () => {
    expect(() => parseEnv({ ...BASE, RATE_LIMIT_STORE: 'off' })).toThrow(/RATE_LIMIT_STORE/);
    expect(() => parseEnv({ ...BASE, RATE_LIMIT_STORE: 'upstash' })).toThrow(/UPSTASH/);
    expect(parseEnv({ ...BASE, RATE_LIMIT_STORE: 'postgres' }).RATE_LIMIT_STORE).toBe('postgres');
  });

  it('requires the idle timeout to outlast the access token (S-15)', () => {
    expect(() => parseEnv({ ...BASE, REFRESH_TOKEN_TTL_SECONDS: '600' })).toThrow(/REFRESH_TOKEN_TTL_SECONDS/);
  });

  it('local photo storage needs an absolute directory (S-21)', () => {
    expect(() => parseEnv({ ...BASE, PHOTO_STORAGE: 'local' })).toThrow(/PHOTO_STORAGE_DIR/);
    expect(() => parseEnv({ ...BASE, PHOTO_STORAGE: 'local', PHOTO_STORAGE_DIR: 'photos' })).toThrow(
      /PHOTO_STORAGE_DIR/,
    );
    expect(() => parseEnv({ ...BASE, PHOTO_STORAGE: 'uploadthing' })).toThrow(/UPLOADTHING_TOKEN/);
  });

  it('in production only Bhashini may receive search text, and only when switched on (S-26)', () => {
    expect(() =>
      parseEnv({ ...BASE, SEARCH_TRANSLATION: 'on', SEARCH_TRANSLATION_PROVIDER: 'google' }),
    ).toThrow(/bhashini/);
    expect(
      parseEnv({ ...BASE, SEARCH_TRANSLATION: 'on', SEARCH_TRANSLATION_PROVIDER: 'bhashini' }).SEARCH_TRANSLATION,
    ).toBe('on');
  });
});
