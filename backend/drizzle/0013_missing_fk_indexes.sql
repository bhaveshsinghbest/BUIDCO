-- Missing indexes on foreign-key columns that the services filter by on
-- every request. Found during the end-to-end audit: each of these produced
-- a Seq Scan under EXPLAIN.
--
--   audit_log_change.audit_id  — auditService.listAudit() fans out with
--     `inArray(auditLogChange.auditId, auditIds)` for every audit page
--     load. This is the urgent one: audit_log_change is the fastest-growing
--     table in the schema (already ~9x audit_log) and is append-only, so
--     the scan cost rises monotonically and never comes back down.
--
--   geo_photo.project_id       — geoPhotosService filters by project on
--     list and on both the update and delete ownership checks.
--
--   mom_action_point.mom_id    — momService filters by MoM on list, and on
--     the update/delete ownership checks.
--
-- All three are plain (non-CONCURRENT) creates: the migrator wraps each
-- file in a transaction and CREATE INDEX CONCURRENTLY cannot run inside
-- one. These tables are small enough today that the brief write lock is
-- not a concern; if that ever changes, run the CONCURRENTLY form by hand
-- first and this migration will no-op on IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_audit_log_change_audit
  ON audit_log_change (audit_id);

CREATE INDEX IF NOT EXISTS idx_geo_photo_project
  ON geo_photo (project_id);

CREATE INDEX IF NOT EXISTS idx_mom_action_point_mom
  ON mom_action_point (mom_id);
