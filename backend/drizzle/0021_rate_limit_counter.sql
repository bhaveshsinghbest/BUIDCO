-- 0021: rate-limit counters in PostgreSQL (security finding S-14).
--
-- Used when RATE_LIMIT_STORE=postgres: every API instance shares these
-- counters, they survive restarts, and the data (usernames, client IP
-- addresses) stays on the government database instead of a third-party
-- Redis service. One row per limiter + key; lib/rateLimit.ts updates it with
-- a single atomic upsert and deletes rows older than a day.
--
-- Additive: nothing else reads or writes this table.

CREATE TABLE IF NOT EXISTS rate_limit_counter (
  bucket_key        TEXT        PRIMARY KEY,
  hits              INTEGER     NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counter_window
  ON rate_limit_counter (window_started_at);
