/**
 * PostgreSQL connection settings shared by the API pool and the migrator,
 * with TLS handled explicitly (finding S-10).
 *
 * Before: the pool asked for TLS with `rejectUnauthorized: false` (no
 * certificate check) whenever the URL contained `sslmode=require` in
 * production. The pg driver (8.x) happens to let the URL's own `sslmode`
 * override that option, so certificates were in fact verified, but only by
 * accident: `sslmode=no-verify`, `uselibpqcompat=true`, or a future driver
 * that follows libpq's meaning of "require" (encrypt, don't verify) would
 * have silently turned verification off.
 *
 * Now the TLS decision is made here, from DB_SSL (or, when unset, from the
 * URL's sslmode), and the TLS parameters are removed from the URL so the
 * driver cannot override it:
 *   off        plain TCP — a database on localhost or a private network
 *   verify     TLS, certificate chain AND host name verified; the CA comes
 *              from DB_SSL_CA_FILE, else the system trust store
 *   no-verify  TLS without verification — development only; env.ts
 *              refuses it when NODE_ENV=production
 */
import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import type { ClientConfig } from 'pg';
import { env, type Env } from '../env.js';

export type DbSslMode = 'off' | 'verify' | 'no-verify';

/** Query parameters through which a connection string can change TLS. */
const TLS_URL_PARAMS = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'];

export function sslModeFromUrl(url: string): DbSslMode {
  const match = /[?&]sslmode=([^&]+)/i.exec(url);
  const mode = match?.[1]?.toLowerCase();
  switch (mode) {
    case 'require':
    case 'prefer':
    case 'verify-ca':
    case 'verify-full':
      return 'verify';
    case 'no-verify':
      return 'no-verify';
    case 'disable':
      return 'off';
    default:
      // The driver also honours ssl=true / ssl=1 without an sslmode.
      return /[?&]ssl=(true|1)(&|$)/i.test(url) ? 'verify' : 'off';
  }
}

/** The connection string without its TLS parameters. */
export function stripTlsParams(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const base = url.slice(0, q);
  const kept = url
    .slice(q + 1)
    .split('&')
    .filter((pair) => {
      const name = decodeURIComponent(pair.split('=')[0] ?? '').toLowerCase();
      return pair.length > 0 && !TLS_URL_PARAMS.includes(name);
    });
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
}

export function resolveSslMode(e: Pick<Env, 'DB_SSL' | 'DATABASE_URL'>): DbSslMode {
  return e.DB_SSL ?? sslModeFromUrl(e.DATABASE_URL);
}

export function buildSslOption(
  mode: DbSslMode,
  caFile: string | undefined,
  readFile: (path: string) => string = (p) => readFileSync(p, 'utf8'),
): false | ConnectionOptions {
  switch (mode) {
    case 'off':
      return false;
    case 'no-verify':
      return { rejectUnauthorized: false };
    case 'verify':
      // rejectUnauthorized also enables Node's default host-name check.
      return caFile ? { rejectUnauthorized: true, ca: readFile(caFile) } : { rejectUnauthorized: true };
  }
}

export function connectionConfig(e: Env = env): Pick<ClientConfig, 'connectionString' | 'ssl'> {
  const mode = resolveSslMode(e);
  return {
    connectionString: stripTlsParams(e.DATABASE_URL),
    ssl: buildSslOption(mode, e.DB_SSL_CA_FILE),
  };
}
