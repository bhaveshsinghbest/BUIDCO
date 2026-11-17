/**
 * Minimal file-based SQL migrator.
 *
 * Applies every `*.sql` file in ./drizzle in lexical order, wrapping each
 * in a transaction and recording success in `__migrations`. Idempotent —
 * re-running skips migrations already recorded.
 *
 * Usage:  npm run db:migrate
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { connectionConfig } from './connection.js';

const { Client } = pg;

async function run(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(here, '..', '..', 'drizzle');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    process.stdout.write('No migrations found in ./drizzle\n');
    return;
  }

  // Same TLS policy as the API pool (connection.ts, finding S-10).
  const client = new Client(connectionConfig());
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS __migrations (
        id         SERIAL PRIMARY KEY,
        name       TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM __migrations')).rows.map((r) => r.name),
    );

    for (const file of files) {
      if (applied.has(file)) {
        process.stdout.write(`skip  ${file} (already applied)\n`);
        continue;
      }

      const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
      process.stdout.write(`apply ${file}\n`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO __migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        process.stdout.write(`  ok  ${file}\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${file} failed: ${message}`);
      }
    }

    process.stdout.write('All migrations applied.\n');
  } finally {
    await client.end();
  }
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
