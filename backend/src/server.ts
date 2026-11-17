import type { Server } from 'node:http';
import { sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { db } from './db/client.js';
import { resolveSslMode } from './db/connection.js';
import { env, isProduction } from './env.js';
import { startKeepAlive } from './lib/keepAlive.js';
import { describeError, logger } from './lib/logger.js';
import { verifyPhotoStorage } from './lib/photoStorage.js';
import { verifyRateLimitStore } from './lib/rateLimit.js';

/**
 * Facts an operator or auditor needs to confirm the deployment is configured
 * as intended (findings S-02, S-10, S-22). Each is logged once at startup;
 * none of them stops the server.
 */
async function reportStartupChecks(): Promise<void> {
  if (isProduction && env.TRUST_PROXY === undefined) {
    logger.warn('config.trust_proxy_default', {
      value: 1,
      effect: 'set TRUST_PROXY to the proxy address(es) in front of the API, e.g. "loopback" for Nginx on this server',
    });
  }

  try {
    // Whether THIS connection is encrypted, as PostgreSQL itself reports it.
    const tls = await db.execute<{ ssl: boolean | null; version: string | null }>(
      sql`SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()`,
    );
    const row = tls.rows[0];
    logger.info('db.connection', {
      sslMode: resolveSslMode(env),
      encrypted: row?.ssl ?? null,
      tlsVersion: row?.version ?? null,
    });
  } catch (err) {
    logger.warn('db.connection_check_failed', describeError(err));
  }

  if (isProduction) {
    try {
      // The demo_* accounts share a published password (S-02).
      const demo = await db.execute<{ active: number; total: number }>(sql`
        SELECT count(*) FILTER (WHERE is_active)::int AS active, count(*)::int AS total
        FROM app_user WHERE username ILIKE 'demo\\_%'
      `);
      const counts = demo.rows[0];
      if (counts && counts.total > 0) {
        logger.warn('security.demo_accounts_present', {
          active: counts.active,
          total: counts.total,
          signInAllowed: env.ALLOW_DEMO_ACCOUNTS === 'true',
          action: 'deactivate or delete the demo_* accounts on this database',
        });
      }
    } catch (err) {
      logger.warn('security.demo_account_check_failed', describeError(err));
    }
  }
}

async function start(): Promise<void> {
  // Refuse to start rather than fail every sign-in or upload later.
  await verifyRateLimitStore();
  await verifyPhotoStorage();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info('server.started', { port: env.PORT, nodeEnv: env.NODE_ENV });
  });

  // Stops the free-tier instance idling itself to sleep. No-op off Render.
  const keepAlive = startKeepAlive();
  if (keepAlive) {
    logger.info('server.keep_alive', { intervalMinutes: 10 });
  }

  void reportStartupChecks();

  function shutdown(signal: NodeJS.Signals): void {
    logger.info('server.shutdown', { signal });
    keepAlive?.stop();
    server.close((err) => {
      if (err) {
        logger.error('server.shutdown_failed', describeError(err));
        process.exit(1);
      }
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err: unknown) => {
  logger.error('server.startup_failed', describeError(err));
  process.exit(1);
});
