-- Task 2 — the CoS/EoT register shows Division instead of District.
--
-- The view already joins `project`, so the division is one column away; it
-- simply was never selected. Appending it (rather than inserting it beside
-- district_id) is deliberate: CREATE OR REPLACE VIEW may only ADD columns at
-- the end, so this avoids a DROP ... CASCADE that would take dependent
-- objects and grants with it.
--
-- district_id is intentionally retained. The column is dropped from the UI,
-- not from the data: other callers and exports may still want it, and
-- removing it here would be a destructive schema change for a presentation
-- decision.
CREATE OR REPLACE VIEW v_cos_eot_records AS
SELECT
  c.cos_id, c.project_id, p.project_name, p.sector_id, p.district_id,
  c.cos_number, c.cos_date, c.category, c.cos_amount_cr, c.variation_pct,
  c.eot_number, c.eot_days_granted, c.time_linked,
  c.original_end_date, c.new_end_date, c.revised_date,
  p.division_id
FROM cos_eot_item c
JOIN project p ON p.project_id = c.project_id
ORDER BY c.cos_date DESC NULLS LAST;
