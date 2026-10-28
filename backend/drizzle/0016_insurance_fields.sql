-- Insurance validity tracking (bhaveshTask.md Tasks 3-4; RFP Clause 5(b)(iv),
-- which names "performance security and insurance validity alerts" together).
--
-- PBG was already implemented end to end; insurance had no field at all. This
-- mirrors the PBG shape exactly so the two behave identically:
--
--   pbg_number         varchar(80)     ->  insurance_policy_no  varchar(80)
--   pbg_issuing_bank   varchar(120)    ->  insurer              varchar(120)
--   pbg_amount_cr      numeric(12,2)   ->  insured_amount_cr    numeric(12,2)
--   pbg_expiry_date    date            ->  insurance_expiry_date date
--                                      +   insurance_start_date  date
--
-- Additive and nullable throughout: every existing row keeps its data and
-- reads NULL for the new columns, which the UI renders as "no policy on
-- record" rather than an alert.

ALTER TABLE project
  ADD COLUMN insurance_policy_no   VARCHAR(80),
  ADD COLUMN insurer               VARCHAR(120),
  ADD COLUMN insured_amount_cr     NUMERIC(12, 2),
  ADD COLUMN insurance_start_date  DATE,
  ADD COLUMN insurance_expiry_date DATE;

-- A policy cannot expire before it starts. Written as a CHECK that passes
-- when either side is NULL, so partially-filled records stay valid — the
-- same tolerance the rest of the project table shows for optional fields.
ALTER TABLE project
  ADD CONSTRAINT project_insurance_dates_check
  CHECK (
    insurance_start_date IS NULL
    OR insurance_expiry_date IS NULL
    OR insurance_expiry_date >= insurance_start_date
  );

-- Insured amount is a money figure; negative makes no sense.
ALTER TABLE project
  ADD CONSTRAINT project_insured_amount_cr_check
  CHECK (insured_amount_cr IS NULL OR insured_amount_cr >= 0);

-- Expiry alerts view — a field-for-field copy of v_pbg_expiry_alerts.
--
-- Same window (0..30 days inclusive), same ORDER BY, same columns. Rows with
-- no expiry date drop out via the IS NOT NULL guard exactly as they do for
-- PBG, so "no policy recorded" never surfaces as an alert.
--
-- Note the shared consequence: a policy that expired yesterday has
-- days_left < 0 and therefore does NOT appear here. That matches PBG rather
-- than improving on it — deliberately, because this task is about parity.
-- Expired policies are surfaced in the table column instead.
CREATE OR REPLACE VIEW v_insurance_expiry_alerts AS
SELECT project_id, project_name, district_id, city, insurance_expiry_date,
       (insurance_expiry_date - CURRENT_DATE) AS days_left
FROM project
WHERE insurance_expiry_date IS NOT NULL
  AND (insurance_expiry_date - CURRENT_DATE) BETWEEN 0 AND 30
ORDER BY days_left;

-- Mirrors idx on pbg lookups: the view scans project on this column.
CREATE INDEX IF NOT EXISTS idx_project_insurance_expiry
  ON project (insurance_expiry_date)
  WHERE insurance_expiry_date IS NOT NULL;
