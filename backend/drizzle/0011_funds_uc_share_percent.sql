-- Central Share / State Share become percentages, not Crore amounts
-- (bhaveshTask.md). These columns were added last round with essentially no
-- real production data yet (only test/demo rows), so this is a straight
-- rename + range constraint rather than a value-converting migration.

ALTER TABLE project_funds_uc RENAME COLUMN central_share_cr TO central_share_pct;
ALTER TABLE project_funds_uc RENAME COLUMN state_share_cr TO state_share_pct;

ALTER TABLE project_funds_uc
  ADD CONSTRAINT project_funds_uc_central_share_pct_check CHECK (central_share_pct IS NULL OR (central_share_pct >= 0 AND central_share_pct <= 100)),
  ADD CONSTRAINT project_funds_uc_state_share_pct_check CHECK (state_share_pct IS NULL OR (state_share_pct >= 0 AND state_share_pct <= 100));
