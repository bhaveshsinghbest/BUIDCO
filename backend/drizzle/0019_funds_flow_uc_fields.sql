-- Funds Flow & UC Tracker (bhaveshTask.md T-03).
--
-- Follows public money along Sanctioning Agency → UDHD → BUIDCo →
-- Contractors / Payees, and the UC back from BUIDCo to the department.
-- project_funds_uc already holds the BUIDCo-level GFR 12-A figures
-- (opening balance, received, paid, sanction no., UC date, remarks); these
-- columns add the upstream stages and the UC detail.
--
-- Additive only: every new column is nullable, no existing value changes.
-- NULL in fund_released_to_udhd_cr means "not entered" (the tracker then
-- assumes it equals the amount received by BUIDCo); 0 is a real figure.

ALTER TABLE project_funds_uc
  ADD COLUMN fund_sanction_agency VARCHAR(40)
    CHECK (fund_sanction_agency IS NULL OR fund_sanction_agency IN (
      'MoHUA – Govt. of India', 'NMCG – Govt. of India', 'Other Central Ministry',
      'UDHD – Govt. of Bihar', 'Other State Dept.'
    )),
  ADD COLUMN fund_sanctioned_amount_cr NUMERIC(12, 2)
    CHECK (fund_sanctioned_amount_cr IS NULL OR fund_sanctioned_amount_cr >= 0),
  ADD COLUMN sanction_date DATE,
  ADD COLUMN fund_released_to_udhd_cr NUMERIC(12, 2)
    CHECK (fund_released_to_udhd_cr IS NULL OR fund_released_to_udhd_cr >= 0),
  ADD COLUMN uc_amount_certified_cr NUMERIC(12, 2)
    CHECK (uc_amount_certified_cr IS NULL OR uc_amount_certified_cr >= 0),
  ADD COLUMN uc_sent_to VARCHAR(40)
    CHECK (uc_sent_to IS NULL OR uc_sent_to IN ('UDHD, Govt. of Bihar', 'NMCG', 'MoHUA / SPMG', 'Other')),
  ADD COLUMN uc_status_override VARCHAR(20)
    CHECK (uc_status_override IS NULL OR uc_status_override IN (
      'Not Due', 'Pending', 'Submitted', 'Acknowledged', 'Overdue'
    ));

-- The Sanctioning-Agency table groups by agency.
CREATE INDEX idx_funds_uc_sanction_agency ON project_funds_uc(fund_sanction_agency);
