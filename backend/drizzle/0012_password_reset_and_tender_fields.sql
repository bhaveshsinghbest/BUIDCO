-- Catch-up migration. These pieces already exist on the local dev database
-- (added directly at some point, never captured as a committed migration —
-- their intended filenames, 0009_password_reset.sql / 0010_password_reset_requests.sql
-- / 0009_tender_sub_stage.sql, are referenced in schema.ts comments but the
-- numbers were later reused by 0009_project_funds_uc.sql and
-- 0010_funds_uc_central_state_share.sql). Every statement is written to be
-- safe on a database that already has some or all of this (local) as well
-- as one that has none of it (a fresh database, e.g. a new Neon project).

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS email VARCHAR(120),
  ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(15);

ALTER TABLE project
  ADD COLUMN IF NOT EXISTS tender_sub_stage VARCHAR(30),
  ADD COLUMN IF NOT EXISTS nit_number VARCHAR(80),
  ADD COLUMN IF NOT EXISTS nit_date DATE;

DO $$ BEGIN
  ALTER TABLE project ADD CONSTRAINT project_tender_sub_stage_check
    CHECK (tender_sub_stage = ANY (ARRAY[
      'NIT Published', 'Bid Submission (Open)', 'Technical Evaluation',
      'Financial Evaluation', 'Approval Process', 'LoA Issued',
      'Agreement Signing', 'Work Order Issued'
    ]::varchar[]));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE project ADD CONSTRAINT project_tender_sub_stage_coupling
    CHECK (
      (project_stage_v2 = 'Tender' AND tender_sub_stage IS NOT NULL)
      OR (project_stage_v2 IS DISTINCT FROM 'Tender' AND tender_sub_stage IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS password_reset_otp (
  otp_id                   SERIAL PRIMARY KEY,
  user_id                  INTEGER NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  channel                  VARCHAR(10) NOT NULL,
  otp_hash                 TEXT NOT NULL,
  expires_at               TIMESTAMPTZ NOT NULL,
  attempts                 INTEGER NOT NULL DEFAULT 0,
  consumed_at              TIMESTAMPTZ,
  reset_token_hash         TEXT,
  reset_token_expires_at   TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent               TEXT,
  ip_address               INET
);
CREATE INDEX IF NOT EXISTS idx_password_reset_otp_user ON password_reset_otp(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_otp_active ON password_reset_otp(user_id, channel) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_request (
  request_id       SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  role             VARCHAR(10) NOT NULL,
  channel          VARCHAR(10) NOT NULL,
  status           VARCHAR(10) NOT NULL DEFAULT 'Pending',
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  approver_id      INTEGER REFERENCES app_user(user_id),
  approver_role    VARCHAR(10),
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,
  fulfilled_at     TIMESTAMPTZ,
  user_agent       TEXT,
  ip_address       INET
);
CREATE INDEX IF NOT EXISTS idx_password_reset_request_user ON password_reset_request(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_request_role_status ON password_reset_request(role, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_request_active ON password_reset_request(user_id)
  WHERE status = ANY (ARRAY['Pending', 'Approved']::varchar[]);
