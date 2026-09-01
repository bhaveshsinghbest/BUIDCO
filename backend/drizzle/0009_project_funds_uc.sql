-- Funds & UC (bhaveshTask.md) — GFR 12-A style fund ledger per project.
-- One row per project: opening balance, grant received, expenditure
-- incurred (closing balance and UC status are derived, not stored).

CREATE TABLE project_funds_uc (
  funds_uc_id              SERIAL PRIMARY KEY,
  project_id               TEXT NOT NULL UNIQUE REFERENCES project(project_id) ON DELETE CASCADE,
  funding_source           VARCHAR(30) NOT NULL
    CHECK (funding_source IN ('Central - EAP', 'Central - Non-EAP', 'Central - State Share', 'State Funded')),
  opening_balance_cr       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  grant_received_cr        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  expenditure_incurred_cr  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sanction_no              VARCHAR(80),
  uc_submitted_date        DATE,
  remarks                  TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated             TIMESTAMPTZ
);

CREATE INDEX idx_funds_uc_funding_source ON project_funds_uc(funding_source);
