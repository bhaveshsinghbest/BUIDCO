-- Central Share / State Share (bhaveshTask.md) — only meaningful when
-- funding_source = 'Central - State Share'; nullable, additive-only.

ALTER TABLE project_funds_uc
  ADD COLUMN central_share_cr NUMERIC(12, 2),
  ADD COLUMN state_share_cr   NUMERIC(12, 2);
