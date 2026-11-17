/**
 * Safety guard for the demo / dummy-data seeders (findings S-02, S-20, S-30).
 *
 * The seeders write fictitious projects, funds, MoMs and demo accounts. On a
 * production database that would put fake records into the official project
 * register, and the demo accounts share a published password. Every seeder
 * (except seedAdmin, the first-MD bootstrap) calls assertDemoSeedingAllowed()
 * before touching the database, and it refuses when:
 *
 *   1. NODE_ENV is "production"; or
 *   2. the target database is marked as production. The DBA marks the
 *      production database once, with a setting that needs no schema change:
 *
 *        ALTER DATABASE <database_name> SET app.environment = 'production';
 *
 *      This catches the dangerous case the first check cannot: a developer
 *      machine (NODE_ENV=development) whose DATABASE_URL points at the
 *      production server.
 *
 * The seeders are also excluded from the production build
 * (tsconfig.build.json), so they do not exist on a production server.
 */
import { env } from '../env.js';
import { pool } from './client.js';

export async function assertDemoSeedingAllowed(script: string): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error(`${script}: refusing to write demo data — NODE_ENV is production.`);
  }
  const result = await pool.query<{ marker: string | null }>(
    "SELECT current_setting('app.environment', true) AS marker",
  );
  const marker = result.rows[0]?.marker?.trim().toLowerCase() ?? '';
  if (marker === 'production') {
    throw new Error(
      `${script}: refusing to write demo data — this database is marked app.environment = 'production'.`,
    );
  }
}

/**
 * Password for the demo_* accounts (S-02). Taken from the environment only,
 * never from source code: the previous fixed value was published in the
 * repository and in test files.
 */
export function demoAccountPassword(): string {
  const value = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!value || value.length < 12) {
    throw new Error(
      'Set DEMO_ACCOUNT_PASSWORD (at least 12 characters) in the environment before seeding demo accounts. ' +
        'Use a value unique to this development database.',
    );
  }
  return value;
}
