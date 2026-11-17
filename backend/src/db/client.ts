import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { logger } from '../lib/logger.js';
import { connectionConfig } from './connection.js';
import * as schema from './schema.js';
import * as views from './views.js';

const { Pool } = pg;

export const pool = new Pool({
  // TLS is decided in connection.ts (DB_SSL), never by the URL alone.
  ...connectionConfig(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // The message only: pg errors never carry the password, and the
  // connection string itself is never logged.
  logger.error('db.pool_error', { errorMessage: err.message });
});

export const db = drizzle(pool, { schema: { ...schema, ...views } });

export type Db = typeof db;
