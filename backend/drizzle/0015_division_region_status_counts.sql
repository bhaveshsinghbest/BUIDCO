-- Add Not Started / On Hold counts to the division and region summaries
-- (bhaveshTask.md Task 2).
--
-- Both views already broke projects down by Completed / In Progress /
-- Delayed, but the status enum has five values — 'Not Started' and
-- 'On Hold' had nowhere to appear, so the Division page could only show
-- three of the six blocks the task asks for.
--
-- New columns are APPENDED rather than slotted next to the other status
-- counts: CREATE OR REPLACE VIEW may add columns at the end but cannot
-- reorder or retype existing ones, and dropping the views would cascade.
--
-- `COUNT(*) FILTER (...)` is the same construct the existing counts use and
-- stays correct under the LEFT JOIN: a division with no projects joins to a
-- single all-NULL row, which no status filter matches.

CREATE OR REPLACE VIEW v_division_summary AS
SELECT
  dv.division_id,
  dv.division_name,
  dv.region_id,
  r.region_name,
  COUNT(p.project_id)                                                       AS total,
  COUNT(*) FILTER (WHERE p.status = 'Completed')                            AS completed,
  COUNT(*) FILTER (WHERE p.status = 'In Progress')                          AS in_progress,
  COUNT(*) FILTER (WHERE p.status = 'Delayed')                              AS delayed,
  ROUND(
    COUNT(*) FILTER (WHERE p.status = 'Completed')::NUMERIC
    / NULLIF(COUNT(p.project_id), 0) * 100, 0
  )                                                                          AS completion_rate_pct,
  COUNT(*) FILTER (WHERE p.status = 'Not Started')                          AS not_started,
  COUNT(*) FILTER (WHERE p.status = 'On Hold')                              AS on_hold
FROM division dv
JOIN region r ON r.region_id = dv.region_id
LEFT JOIN project p ON p.division_id = dv.division_id
GROUP BY dv.division_id, dv.division_name, dv.region_id, r.region_name
ORDER BY r.region_name, dv.division_name;

CREATE OR REPLACE VIEW v_region_summary AS
SELECT
  r.region_id,
  r.region_name,
  COUNT(DISTINCT dv.division_id)                                            AS division_count,
  COUNT(p.project_id)                                                       AS total,
  COUNT(*) FILTER (WHERE p.status = 'Completed')                            AS completed,
  COUNT(*) FILTER (WHERE p.status = 'In Progress')                          AS in_progress,
  COUNT(*) FILTER (WHERE p.status = 'Delayed')                              AS delayed,
  COUNT(*) FILTER (WHERE p.status = 'Not Started')                          AS not_started,
  COUNT(*) FILTER (WHERE p.status = 'On Hold')                              AS on_hold
FROM region r
LEFT JOIN division dv ON dv.region_id = r.region_id
LEFT JOIN project p ON p.division_id = dv.division_id
GROUP BY r.region_id, r.region_name
ORDER BY r.region_name;
