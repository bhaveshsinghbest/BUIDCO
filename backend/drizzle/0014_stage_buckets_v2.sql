-- Rebuild v_stage_buckets on project_stage_v2 (bhaveshTask.md Task 6).
--
-- The baseline view grouped on `project_stage`, which Phase A (0006)
-- superseded with `project_stage_v2`. That column is now NULL for 41 of the
-- 50 projects, so "Active Projects — Current Stage" was counting 9 and
-- presenting it as the whole pipeline.
--
-- Two further faults in the old definition, both fixed by grouping instead
-- of UNION-ing:
--
--   * Double counting. The Tender arm matched
--     `project_stage = 'Tender' OR work_type IN ('Tender Work','Tender Service')`,
--     so a project marked Construction that also carried a tender work_type
--     was counted in both buckets and inflated the total.
--
--   * Missing stages. project_stage_v2 adds 'Design' and 'Other', and spells
--     it 'Conceptualisation' (-s-), so those projects had no bucket to land
--     in at all.
--
-- Grouping directly on the column means every project is counted exactly
-- once, and the bucket totals now sum to the true project count.
--
-- The `::text` casts keep the output types identical to the baseline view so
-- CREATE OR REPLACE is accepted (project_stage_v2 is a varchar).

CREATE OR REPLACE VIEW v_stage_buckets AS
SELECT COALESCE(project_stage_v2, 'Other')::text  AS stage,
       COUNT(*)                                    AS project_count,
       ROUND(SUM(COALESCE(aa_amount_cr, 0)), 2)    AS total_aa_cr
FROM project
GROUP BY COALESCE(project_stage_v2, 'Other')::text;
