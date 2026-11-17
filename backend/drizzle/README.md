# Database migrations

Hand-written PostgreSQL migrations, applied by `src/db/migrate.ts`:

- every `*.sql` file in this folder runs once, in file-name order;
- each file runs inside its own transaction;
- success is recorded in the `__migrations` table, so re-running is safe.

| Where | Command |
|---|---|
| Development (from `backend/`) | `npm run db:migrate` |
| Production server (built `dist/`, `NODE_ENV=production` and the database settings in the environment) | `npm run db:migrate:prod` |

Take a database backup (`pg_dump`) before applying migrations to any shared or production database.

## Sequence

`0000_baseline.sql` → `0017_cos_eot_division.sql`, then `0019_funds_flow_uc_fields.sql`, `0020_refresh_token_session.sql`, `0021_rate_limit_counter.sql`.

## Migration 0018 is intentionally absent

**Do not recreate or apply a migration numbered 0018 without the project owner's authorisation.**

An experimental `0018_fund_flow.sql` (a transaction-ledger design for Funds Flow & UC, with tables `fund_transaction` and `uc_record`) was written during development on 13 November 2026, then withdrawn before it was ever committed or deployed. It was replaced by the per-project fields in `0019_funds_flow_uc_fields.sql`, because the specification's formulas and the Input Sheet need plain per-project figures that the ledger could not express. The developer kept a copy of the withdrawn file outside the repository.

The gap in numbering is harmless: the migrator does not require consecutive numbers.

What a DBA may see:

| Database | State | Action |
|---|---|---|
| Production / any server that never ran the experimental file | No `0018` row in `__migrations`, no `fund_transaction` / `uc_record` tables | None. `0000`→`0021` apply cleanly. |
| A developer database that ran the experimental file | `__migrations` contains `0018_fund_flow.sql`; tables `fund_transaction` and `uc_record` exist but nothing in the application reads or writes them | Leave them, or drop the two tables after taking a backup and with the owner's approval. Do not delete the `__migrations` row and do not re-add a 0018 file. |

## Recent security migrations (pre-audit remediation, November 2026)

| File | Purpose | Finding |
|---|---|---|
| `0020_refresh_token_session.sql` | Adds `session_id` and `session_started_at` to `refresh_token`, plus a partial index. Access tokens are bound to a live session, so logout, a password reset or the absolute session limit ends access immediately. Additive; existing sessions are adopted on their next refresh. | S-15 |
| `0021_rate_limit_counter.sql` | Creates `rate_limit_counter`, used when `RATE_LIMIT_STORE=postgres` so login limits are shared by all API instances without a third-party service. Additive. | S-14 |

## Marking the production database

The demo-data seeders refuse to write to a database marked as production. A DBA sets the mark once, on the production database only:

```sql
ALTER DATABASE <database_name> SET app.environment = 'production';
```

It takes effect for new connections and needs no schema change. See `src/db/seedGuard.ts`.
