/**
 * KPI query layer — every dashboard aggregate reads through here.
 *
 * Rule: NO inline SQL or aggregation in Express handlers or React
 * components. Every function here maps 1:1 to a `v_*` view declared
 * in drizzle/0000_baseline.sql (MD/Admin path), OR to an equivalent
 * inline SQL when a Project Director (PD) is the actor — the inline
 * variant adds `WHERE p.division_id = $div` and re-aggregates, since
 * the pre-baked views have already collapsed rows across divisions.
 *
 * Drizzle numeric columns arrive as strings; every function coerces to
 * number|null at the boundary via `toNumberOrNull` so the frontend
 * never has to parse them.
 *
 * Phase C2 division-scoping contract:
 *   - Every public function accepts optional `divisionId: number | null`.
 *     `null` (default) = portfolio-wide (MD/Admin behaviour, unchanged).
 *     A number  = compute over projects whose division_id = that number.
 *   - The router pulls `sessionDivisionId(req)` from the JWT and passes
 *     it in on every call. Guarantee: PDs cannot broaden scope even if
 *     they call the endpoint directly.
 */

import { desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { toNumberOrNull } from './numbers.js';
import {
  vCosEotRecords,
  vDistrictSummary,
  vDivisionSummary,
  vFinancialSecurities,
  vManagementActionSummary,
  vMilestoneHistory,
  vOmExpiryAlerts,
  vOmStatus,
  vOutstandingGaps,
  vOverviewKpis,
  vPbgExpiryAlerts,
  vProjectDelayStatus,
  vProjectPhysicalHistory,
  vRegionSummary,
  vScheduleVsActual,
  vSchemeChart,
  vSchemeKpiSummary,
  vSchemeSummary,
  vSectorSummary,
  vStageBuckets,
  vStatusDonut,
  vWorkTypeCounts,
} from '../db/views.js';

/** Result-row helper — `db.execute` returns `QueryResult` from node-postgres. */
type Rows<T> = { rows: T[] };

/* ============================================================
 * PORTFOLIO KPIs
 * ============================================================ */

export interface OverviewKpis {
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  onHold: number;
  notStarted: number;
  totalAaCr: number | null;
  totalAgreementCr: number | null;
  totalFinancialCr: number | null;
  avgPhysicalPct: number | null;
  avgFinancialPct: number | null;
  financialUtilisationPct: number | null;
}

export async function getOverviewKpis(divisionId: number | null = null): Promise<OverviewKpis> {
  if (divisionId === null) {
    const [row] = await db.select().from(vOverviewKpis);
    return {
      total: row?.total ?? 0,
      completed: row?.completed ?? 0,
      inProgress: row?.inProgress ?? 0,
      delayed: row?.delayed ?? 0,
      onHold: row?.onHold ?? 0,
      notStarted: row?.notStarted ?? 0,
      totalAaCr: toNumberOrNull(row?.totalAaCr),
      totalAgreementCr: toNumberOrNull(row?.totalAgreementCr),
      totalFinancialCr: toNumberOrNull(row?.totalFinancialCr),
      avgPhysicalPct: toNumberOrNull(row?.avgPhysicalPct),
      avgFinancialPct: toNumberOrNull(row?.avgFinancialPct),
      financialUtilisationPct: toNumberOrNull(row?.financialUtilisationPct),
    };
  }
  const result = await db.execute<{
    total: number; completed: number; in_progress: number; delayed: number;
    on_hold: number; not_started: number;
    total_aa_cr: string | null; total_agreement_cr: string | null; total_financial_cr: string | null;
    avg_physical_pct: string | null; avg_financial_pct: string | null; financial_utilisation_pct: string | null;
  }>(sql`
    SELECT
      COUNT(*)                                                                  AS total,
      COUNT(*) FILTER (WHERE p.status = 'Completed')                            AS completed,
      COUNT(*) FILTER (WHERE p.status = 'In Progress')                          AS in_progress,
      COUNT(*) FILTER (WHERE p.status = 'Delayed')                              AS delayed,
      COUNT(*) FILTER (WHERE p.status = 'On Hold')                              AS on_hold,
      COUNT(*) FILTER (WHERE p.status = 'Not Started')                          AS not_started,
      ROUND(SUM(COALESCE(p.aa_amount_cr,0)), 2)                                 AS total_aa_cr,
      ROUND(SUM(COALESCE(p.agreement_amount_cr,0)), 2)                          AS total_agreement_cr,
      ROUND(SUM(COALESCE(p.financial_progress_cr,0)), 2)                        AS total_financial_cr,
      ROUND(SUM(ep.physical_progress_pct) / NULLIF(COUNT(*),0), 1)              AS avg_physical_pct,
      ROUND(SUM(COALESCE(p.financial_progress_pct,0)) / NULLIF(COUNT(*),0), 1)  AS avg_financial_pct,
      ROUND(
        SUM(COALESCE(p.financial_progress_cr,0)) / NULLIF(SUM(COALESCE(p.aa_amount_cr,0)),0) * 100
      , 1)                                                                       AS financial_utilisation_pct
    FROM project p
    JOIN v_project_effective_physical ep ON ep.project_id = p.project_id
    WHERE p.division_id = ${divisionId}
  `) as unknown as Rows<{
    total: number; completed: number; in_progress: number; delayed: number;
    on_hold: number; not_started: number;
    total_aa_cr: string | null; total_agreement_cr: string | null; total_financial_cr: string | null;
    avg_physical_pct: string | null; avg_financial_pct: string | null; financial_utilisation_pct: string | null;
  }>;
  const r = result.rows[0];
  return {
    total: Number(r?.total ?? 0),
    completed: Number(r?.completed ?? 0),
    inProgress: Number(r?.in_progress ?? 0),
    delayed: Number(r?.delayed ?? 0),
    onHold: Number(r?.on_hold ?? 0),
    notStarted: Number(r?.not_started ?? 0),
    totalAaCr: toNumberOrNull(r?.total_aa_cr ?? null),
    totalAgreementCr: toNumberOrNull(r?.total_agreement_cr ?? null),
    totalFinancialCr: toNumberOrNull(r?.total_financial_cr ?? null),
    avgPhysicalPct: toNumberOrNull(r?.avg_physical_pct ?? null),
    avgFinancialPct: toNumberOrNull(r?.avg_financial_pct ?? null),
    financialUtilisationPct: toNumberOrNull(r?.financial_utilisation_pct ?? null),
  };
}

export interface ScheduleVsActual {
  avgActualPct: number | null;
  avgScheduledPctRaw: number | null;
  projectsWithSchedule: number;
  avgScheduledPctEffective: number | null;
}

export async function getScheduleVsActual(
  divisionId: number | null = null,
): Promise<ScheduleVsActual> {
  if (divisionId === null) {
    const [row] = await db.select().from(vScheduleVsActual);
    return {
      avgActualPct: toNumberOrNull(row?.avgActualPct),
      avgScheduledPctRaw: toNumberOrNull(row?.avgScheduledPctRaw),
      projectsWithSchedule: row?.projectsWithSchedule ?? 0,
      avgScheduledPctEffective: toNumberOrNull(row?.avgScheduledPctEffective),
    };
  }
  const overview = await getOverviewKpis(divisionId);
  const result = await db.execute(sql`
    SELECT
      ROUND(AVG(scheduled_progress_pct) FILTER (WHERE scheduled_progress_pct > 0), 1) AS avg_scheduled_pct_raw,
      COUNT(*) FILTER (WHERE scheduled_progress_pct > 0)                                AS projects_with_schedule
    FROM project
    WHERE division_id = ${divisionId}
  `) as unknown as Rows<{ avg_scheduled_pct_raw: string | null; projects_with_schedule: number }>;
  const r = result.rows[0];
  const rawScheduled = toNumberOrNull(r?.avg_scheduled_pct_raw ?? null);
  return {
    avgActualPct: overview.avgPhysicalPct,
    avgScheduledPctRaw: rawScheduled,
    projectsWithSchedule: Number(r?.projects_with_schedule ?? 0),
    avgScheduledPctEffective: rawScheduled ?? overview.avgPhysicalPct,
  };
}

export interface StageBucket {
  stage: string;
  projectCount: number;
  totalAaCr: number | null;
}

export async function getStageBuckets(divisionId: number | null = null): Promise<StageBucket[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vStageBuckets);
    return rows.map((r) => ({
      stage: r.stage ?? '',
      projectCount: r.projectCount ?? 0,
      totalAaCr: toNumberOrNull(r.totalAaCr),
    }));
  }
  // Same shape as v_stage_buckets (see drizzle/0014), with a division filter.
  // Kept in lockstep with that view deliberately: when this grouped on the
  // deprecated `project_stage` it under-counted the pipeline the same way,
  // so a PD saw an even emptier board than an MD did.
  const result = await db.execute(sql`
    SELECT COALESCE(project_stage_v2, 'Other')::text  AS stage,
           COUNT(*)                                    AS project_count,
           ROUND(SUM(COALESCE(aa_amount_cr, 0)), 2)    AS total_aa_cr
    FROM project
    WHERE division_id = ${divisionId}
    GROUP BY COALESCE(project_stage_v2, 'Other')::text
  `) as unknown as Rows<{ stage: string; project_count: number; total_aa_cr: string | null }>;
  return result.rows.map((r) => ({
    stage: r.stage ?? '',
    projectCount: Number(r.project_count ?? 0),
    totalAaCr: toNumberOrNull(r.total_aa_cr),
  }));
}

export interface WorkTypeCounts {
  tenderWorks: number;
  tenderServices: number;
  preMonsoon: number;
  preMonsoonCritical: number;
}

export async function getWorkTypeCounts(
  divisionId: number | null = null,
): Promise<WorkTypeCounts> {
  if (divisionId === null) {
    const [row] = await db.select().from(vWorkTypeCounts);
    return {
      tenderWorks: row?.tenderWorks ?? 0,
      tenderServices: row?.tenderServices ?? 0,
      preMonsoon: row?.preMonsoon ?? 0,
      preMonsoonCritical: row?.preMonsoonCritical ?? 0,
    };
  }
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE work_type = 'Tender Work')                            AS tender_works,
      COUNT(*) FILTER (WHERE work_type = 'Tender Service')                         AS tender_services,
      COUNT(*) FILTER (WHERE work_type = 'Pre-Monsoon')                            AS pre_monsoon,
      COUNT(*) FILTER (WHERE work_type = 'Pre-Monsoon' AND priority = 'High')      AS pre_monsoon_critical
    FROM project
    WHERE division_id = ${divisionId}
  `) as unknown as Rows<{
    tender_works: number; tender_services: number; pre_monsoon: number; pre_monsoon_critical: number;
  }>;
  const r = result.rows[0];
  return {
    tenderWorks: Number(r?.tender_works ?? 0),
    tenderServices: Number(r?.tender_services ?? 0),
    preMonsoon: Number(r?.pre_monsoon ?? 0),
    preMonsoonCritical: Number(r?.pre_monsoon_critical ?? 0),
  };
}

export interface FinancialSecurities {
  totalMobAdvanceCr: number | null;
  totalAdvanceOutstandingCr: number | null;
  totalRetentionCr: number | null;
  totalPbgCr: number | null;
  totalEmdCr: number | null;
  pbgExpiredCount: number;
}

export async function getFinancialSecurities(
  divisionId: number | null = null,
): Promise<FinancialSecurities> {
  if (divisionId === null) {
    const [row] = await db.select().from(vFinancialSecurities);
    return {
      totalMobAdvanceCr: toNumberOrNull(row?.totalMobAdvanceCr),
      totalAdvanceOutstandingCr: toNumberOrNull(row?.totalAdvanceOutstandingCr),
      totalRetentionCr: toNumberOrNull(row?.totalRetentionCr),
      totalPbgCr: toNumberOrNull(row?.totalPbgCr),
      totalEmdCr: toNumberOrNull(row?.totalEmdCr),
      pbgExpiredCount: row?.pbgExpiredCount ?? 0,
    };
  }
  const result = await db.execute(sql`
    SELECT
      ROUND(SUM(COALESCE(mob_advance_issued_cr,0)), 2)      AS total_mob_advance_cr,
      ROUND(SUM(COALESCE(advance_outstanding_cr,0)), 2)     AS total_advance_outstanding_cr,
      ROUND(SUM(COALESCE(retention_money_held_cr,0)), 2)    AS total_retention_cr,
      ROUND(SUM(COALESCE(pbg_amount_cr,0)), 2)              AS total_pbg_cr,
      ROUND(SUM(COALESCE(emd_amount_cr,0)), 2)              AS total_emd_cr,
      COUNT(*) FILTER (WHERE pbg_expiry_date IS NOT NULL AND pbg_expiry_date < CURRENT_DATE) AS pbg_expired_count
    FROM project
    WHERE division_id = ${divisionId}
  `) as unknown as Rows<{
    total_mob_advance_cr: string | null; total_advance_outstanding_cr: string | null;
    total_retention_cr: string | null; total_pbg_cr: string | null; total_emd_cr: string | null;
    pbg_expired_count: number;
  }>;
  const r = result.rows[0];
  return {
    totalMobAdvanceCr: toNumberOrNull(r?.total_mob_advance_cr ?? null),
    totalAdvanceOutstandingCr: toNumberOrNull(r?.total_advance_outstanding_cr ?? null),
    totalRetentionCr: toNumberOrNull(r?.total_retention_cr ?? null),
    totalPbgCr: toNumberOrNull(r?.total_pbg_cr ?? null),
    totalEmdCr: toNumberOrNull(r?.total_emd_cr ?? null),
    pbgExpiredCount: Number(r?.pbg_expired_count ?? 0),
  };
}

/* ============================================================
 * ALERT LISTS
 * ============================================================ */

export interface PbgExpiryAlert {
  projectId: string;
  projectName: string | null;
  districtId: number | null;
  city: string | null;
  pbgExpiryDate: string | null;
  daysLeft: number | null;
}

export async function getPbgExpiryAlerts(
  divisionId: number | null = null,
): Promise<PbgExpiryAlert[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vPbgExpiryAlerts);
    return rows.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName ?? null,
      districtId: r.districtId ?? null,
      city: r.city ?? null,
      pbgExpiryDate: r.pbgExpiryDate ?? null,
      daysLeft: r.daysLeft ?? null,
    }));
  }
  const result = await db.execute(sql`
    SELECT project_id, project_name, district_id, city, pbg_expiry_date,
           (pbg_expiry_date - CURRENT_DATE) AS days_left
    FROM project
    WHERE pbg_expiry_date IS NOT NULL
      AND (pbg_expiry_date - CURRENT_DATE) BETWEEN 0 AND 30
      AND division_id = ${divisionId}
    ORDER BY days_left
  `) as unknown as Rows<{
    project_id: string; project_name: string | null; district_id: number | null;
    city: string | null; pbg_expiry_date: string | null; days_left: number | null;
  }>;
  return result.rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    districtId: r.district_id,
    city: r.city,
    pbgExpiryDate: r.pbg_expiry_date,
    daysLeft: r.days_left,
  }));
}

export interface OmStatusRow {
  projectId: string;
  projectName: string | null;
  omAgency: string | null;
  startDate: string | null;
  endDate: string | null;
  totalDays: number | null;
  elapsedDays: number | null;
  daysLeft: number | null;
  pctElapsed: number | null;
  status: string | null;
}

function toOmRow(r: {
  projectId: string;
  projectName: string | null;
  omAgency: string | null;
  startDate: string | null;
  endDate: string | null;
  totalDays: number | null;
  elapsedDays: number | null;
  daysLeft: number | null;
  pctElapsed: string | null;
  status: string | null;
}): OmStatusRow {
  return {
    projectId: r.projectId,
    projectName: r.projectName,
    omAgency: r.omAgency,
    startDate: r.startDate,
    endDate: r.endDate,
    totalDays: r.totalDays,
    elapsedDays: r.elapsedDays,
    daysLeft: r.daysLeft,
    pctElapsed: toNumberOrNull(r.pctElapsed),
    status: r.status,
  };
}

/**
 * O&M rows filtered by division. The parent view is complex (heavy CASE
 * logic); rather than duplicate it, we join through project.project_id to
 * inherit the view's computed columns.
 */
async function fetchOmRowsScoped(
  divisionId: number,
  onlyExpiringSoon: boolean,
): Promise<OmStatusRow[]> {
  const result = await db.execute(sql`
    SELECT o.*
    FROM v_om_status o
    JOIN project p ON p.project_id = o.project_id
    WHERE p.division_id = ${divisionId}
    ${onlyExpiringSoon ? sql`AND o.status = 'Expiring Soon'` : sql``}
    ${onlyExpiringSoon ? sql`ORDER BY o.days_left` : sql``}
  `) as unknown as Rows<{
    project_id: string; project_name: string | null; om_agency: string | null;
    start_date: string | null; end_date: string | null;
    total_days: number | null; elapsed_days: number | null; days_left: number | null;
    pct_elapsed: string | null; status: string | null;
  }>;
  return result.rows.map((r) => toOmRow({
    projectId: r.project_id,
    projectName: r.project_name,
    omAgency: r.om_agency,
    startDate: r.start_date,
    endDate: r.end_date,
    totalDays: r.total_days,
    elapsedDays: r.elapsed_days,
    daysLeft: r.days_left,
    pctElapsed: r.pct_elapsed,
    status: r.status,
  }));
}

export async function getOmStatus(divisionId: number | null = null): Promise<OmStatusRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vOmStatus);
    return rows.map(toOmRow);
  }
  return fetchOmRowsScoped(divisionId, false);
}

export async function getOmExpiryAlerts(
  divisionId: number | null = null,
): Promise<OmStatusRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vOmExpiryAlerts);
    return rows.map(toOmRow);
  }
  return fetchOmRowsScoped(divisionId, true);
}

/* ============================================================
 * CHART SUMMARIES (small, bounded — return everything)
 * ============================================================ */

export interface SchemeChartRow {
  schemeId: number;
  schemeName: string;
  projectCount: number;
  avgPhysicalPct: number | null;
  avgFinancialPct: number | null;
  totalAgreementCr: number | null;
  totalFinancialCr: number | null;
}

export async function getSchemeChart(
  divisionId: number | null = null,
): Promise<SchemeChartRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vSchemeChart);
    return rows.map((r) => ({
      schemeId: r.schemeId,
      schemeName: r.schemeName,
      projectCount: r.projectCount ?? 0,
      avgPhysicalPct: toNumberOrNull(r.avgPhysicalPct),
      avgFinancialPct: toNumberOrNull(r.avgFinancialPct),
      totalAgreementCr: toNumberOrNull(r.totalAgreementCr),
      totalFinancialCr: toNumberOrNull(r.totalFinancialCr),
    }));
  }
  const result = await db.execute(sql`
    SELECT
      s.scheme_id, s.scheme_name,
      COUNT(ps.project_id) FILTER (WHERE p.division_id = ${divisionId})                       AS project_count,
      COALESCE(ROUND(AVG(ep.physical_progress_pct) FILTER (WHERE p.division_id = ${divisionId}), 1), 0)  AS avg_physical_pct,
      COALESCE(ROUND(AVG(p.financial_progress_pct) FILTER (WHERE p.division_id = ${divisionId}), 1), 0)  AS avg_financial_pct,
      COALESCE(SUM(p.agreement_amount_cr)  FILTER (WHERE p.division_id = ${divisionId}), 0) :: NUMERIC(14, 2)   AS total_agreement_cr,
      COALESCE(SUM(p.financial_progress_cr) FILTER (WHERE p.division_id = ${divisionId}), 0) :: NUMERIC(14, 2)  AS total_financial_cr
    FROM scheme s
    LEFT JOIN project_scheme ps ON ps.scheme_id = s.scheme_id
    LEFT JOIN project p ON p.project_id = ps.project_id
    LEFT JOIN v_project_effective_physical ep ON ep.project_id = p.project_id
    GROUP BY s.scheme_id, s.scheme_name
    HAVING COUNT(ps.project_id) FILTER (WHERE p.division_id = ${divisionId}) > 0
  `) as unknown as Rows<{
    scheme_id: number; scheme_name: string; project_count: number;
    avg_physical_pct: string | null; avg_financial_pct: string | null;
    total_agreement_cr: string | null; total_financial_cr: string | null;
  }>;
  return result.rows.map((r) => ({
    schemeId: r.scheme_id,
    schemeName: r.scheme_name,
    projectCount: Number(r.project_count ?? 0),
    avgPhysicalPct: toNumberOrNull(r.avg_physical_pct),
    avgFinancialPct: toNumberOrNull(r.avg_financial_pct),
    totalAgreementCr: toNumberOrNull(r.total_agreement_cr),
    totalFinancialCr: toNumberOrNull(r.total_financial_cr),
  }));
}

export interface StatusDonutRow {
  status: string;
  projectCount: number;
}

export async function getStatusDonut(
  divisionId: number | null = null,
): Promise<StatusDonutRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vStatusDonut);
    return rows.map((r) => ({ status: r.status, projectCount: r.projectCount ?? 0 }));
  }
  const result = await db.execute(sql`
    SELECT status, COUNT(*) AS project_count
    FROM project
    WHERE division_id = ${divisionId}
    GROUP BY status
  `) as unknown as Rows<{ status: string; project_count: number }>;
  return result.rows.map((r) => ({
    status: r.status,
    projectCount: Number(r.project_count ?? 0),
  }));
}

export interface SchemeSummaryRow {
  schemeId: number;
  schemeName: string;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
}

export async function getSchemeSummary(
  divisionId: number | null = null,
): Promise<SchemeSummaryRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vSchemeSummary);
    return rows.map((r) => ({
      schemeId: r.schemeId,
      schemeName: r.schemeName,
      total: r.total ?? 0,
      completed: r.completed ?? 0,
      inProgress: r.inProgress ?? 0,
      delayed: r.delayed ?? 0,
    }));
  }
  const result = await db.execute(sql`
    SELECT s.scheme_id, s.scheme_name,
           COUNT(ps.project_id) FILTER (WHERE p.division_id = ${divisionId})                    AS total,
           COUNT(*) FILTER (WHERE p.status = 'Completed'   AND p.division_id = ${divisionId})    AS completed,
           COUNT(*) FILTER (WHERE p.status = 'In Progress' AND p.division_id = ${divisionId})    AS in_progress,
           COUNT(*) FILTER (WHERE p.status = 'Delayed'     AND p.division_id = ${divisionId})    AS delayed
    FROM scheme s
    LEFT JOIN project_scheme ps ON ps.scheme_id = s.scheme_id
    LEFT JOIN project p ON p.project_id = ps.project_id
    GROUP BY s.scheme_id, s.scheme_name
    HAVING COUNT(ps.project_id) FILTER (WHERE p.division_id = ${divisionId}) > 0
  `) as unknown as Rows<{
    scheme_id: number; scheme_name: string;
    total: number; completed: number; in_progress: number; delayed: number;
  }>;
  return result.rows.map((r) => ({
    schemeId: r.scheme_id,
    schemeName: r.scheme_name,
    total: Number(r.total ?? 0),
    completed: Number(r.completed ?? 0),
    inProgress: Number(r.in_progress ?? 0),
    delayed: Number(r.delayed ?? 0),
  }));
}

export interface SchemeKpiSummaryRow {
  schemeId: number;
  schemeName: string;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  onHold: number;
  notStarted: number;
  avgPhysicalPct: number | null;
  avgFinancialPct: number | null;
  totalAaCr: number | null;
  totalFinancialCr: number | null;
  financialUtilisationPct: number | null;
}

export async function getSchemeKpiSummary(
  divisionId: number | null = null,
): Promise<SchemeKpiSummaryRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vSchemeKpiSummary);
    return rows.map((r) => ({
      schemeId: r.schemeId,
      schemeName: r.schemeName,
      total: r.total ?? 0,
      completed: r.completed ?? 0,
      inProgress: r.inProgress ?? 0,
      delayed: r.delayed ?? 0,
      onHold: r.onHold ?? 0,
      notStarted: r.notStarted ?? 0,
      avgPhysicalPct: toNumberOrNull(r.avgPhysicalPct),
      avgFinancialPct: toNumberOrNull(r.avgFinancialPct),
      totalAaCr: toNumberOrNull(r.totalAaCr),
      totalFinancialCr: toNumberOrNull(r.totalFinancialCr),
      financialUtilisationPct: toNumberOrNull(r.financialUtilisationPct),
    }));
  }
  const result = await db.execute(sql`
    SELECT
      s.scheme_id, s.scheme_name,
      COUNT(ps.project_id) FILTER (WHERE p.division_id = ${divisionId})                                     AS total,
      COUNT(*) FILTER (WHERE p.status = 'Completed'   AND p.division_id = ${divisionId})                     AS completed,
      COUNT(*) FILTER (WHERE p.status = 'In Progress' AND p.division_id = ${divisionId})                     AS in_progress,
      COUNT(*) FILTER (WHERE p.status = 'Delayed'     AND p.division_id = ${divisionId})                     AS delayed,
      COUNT(*) FILTER (WHERE p.status = 'On Hold'     AND p.division_id = ${divisionId})                     AS on_hold,
      COUNT(*) FILTER (WHERE p.status = 'Not Started' AND p.division_id = ${divisionId})                     AS not_started,
      COALESCE(ROUND(AVG(ep.physical_progress_pct) FILTER (WHERE p.division_id = ${divisionId}), 1), 0)      AS avg_physical_pct,
      COALESCE(ROUND(AVG(p.financial_progress_pct) FILTER (WHERE p.division_id = ${divisionId}), 1), 0)      AS avg_financial_pct,
      COALESCE(SUM(p.aa_amount_cr)          FILTER (WHERE p.division_id = ${divisionId}), 0) :: NUMERIC(14, 2)  AS total_aa_cr,
      COALESCE(SUM(p.financial_progress_cr) FILTER (WHERE p.division_id = ${divisionId}), 0) :: NUMERIC(14, 2)  AS total_financial_cr,
      COALESCE(ROUND(
        SUM(COALESCE(p.financial_progress_cr,0)) FILTER (WHERE p.division_id = ${divisionId})
        / NULLIF(SUM(COALESCE(p.aa_amount_cr,0)) FILTER (WHERE p.division_id = ${divisionId}), 0) * 100
      , 1), 0)                                                                                                AS financial_utilisation_pct
    FROM scheme s
    LEFT JOIN project_scheme ps                ON ps.scheme_id = s.scheme_id
    LEFT JOIN project p                        ON p.project_id  = ps.project_id
    LEFT JOIN v_project_effective_physical ep  ON ep.project_id = p.project_id
    GROUP BY s.scheme_id, s.scheme_name
  `) as unknown as Rows<{
    scheme_id: number; scheme_name: string;
    total: number; completed: number; in_progress: number; delayed: number;
    on_hold: number; not_started: number;
    avg_physical_pct: string | null; avg_financial_pct: string | null;
    total_aa_cr: string | null; total_financial_cr: string | null; financial_utilisation_pct: string | null;
  }>;
  return result.rows.map((r) => ({
    schemeId: r.scheme_id,
    schemeName: r.scheme_name,
    total: Number(r.total ?? 0),
    completed: Number(r.completed ?? 0),
    inProgress: Number(r.in_progress ?? 0),
    delayed: Number(r.delayed ?? 0),
    onHold: Number(r.on_hold ?? 0),
    notStarted: Number(r.not_started ?? 0),
    avgPhysicalPct: toNumberOrNull(r.avg_physical_pct),
    avgFinancialPct: toNumberOrNull(r.avg_financial_pct),
    totalAaCr: toNumberOrNull(r.total_aa_cr),
    totalFinancialCr: toNumberOrNull(r.total_financial_cr),
    financialUtilisationPct: toNumberOrNull(r.financial_utilisation_pct),
  }));
}

export interface SectorSummaryRow {
  sectorId: number;
  sectorName: string;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
}

export async function getSectorSummary(
  divisionId: number | null = null,
): Promise<SectorSummaryRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vSectorSummary);
    return rows.map((r) => ({
      sectorId: r.sectorId,
      sectorName: r.sectorName,
      total: r.total ?? 0,
      completed: r.completed ?? 0,
      inProgress: r.inProgress ?? 0,
      delayed: r.delayed ?? 0,
    }));
  }
  const result = await db.execute(sql`
    SELECT sec.sector_id, sec.sector_name,
           COUNT(p.project_id) FILTER (WHERE p.division_id = ${divisionId})                        AS total,
           COUNT(*) FILTER (WHERE p.status = 'Completed'   AND p.division_id = ${divisionId})       AS completed,
           COUNT(*) FILTER (WHERE p.status = 'In Progress' AND p.division_id = ${divisionId})       AS in_progress,
           COUNT(*) FILTER (WHERE p.status = 'Delayed'     AND p.division_id = ${divisionId})       AS delayed
    FROM sector sec
    LEFT JOIN project p ON p.sector_id = sec.sector_id
    GROUP BY sec.sector_id, sec.sector_name
    HAVING COUNT(p.project_id) FILTER (WHERE p.division_id = ${divisionId}) > 0
  `) as unknown as Rows<{
    sector_id: number; sector_name: string;
    total: number; completed: number; in_progress: number; delayed: number;
  }>;
  return result.rows.map((r) => ({
    sectorId: r.sector_id,
    sectorName: r.sector_name,
    total: Number(r.total ?? 0),
    completed: Number(r.completed ?? 0),
    inProgress: Number(r.in_progress ?? 0),
    delayed: Number(r.delayed ?? 0),
  }));
}

export interface DistrictSummaryRow {
  districtId: number;
  districtName: string;
  total: number;
  completed: number;
  delayed: number;
  completionRatePct: number | null;
}

export async function getDistrictSummary(
  divisionId: number | null = null,
): Promise<DistrictSummaryRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vDistrictSummary);
    return rows.map((r) => ({
      districtId: r.districtId,
      districtName: r.districtName,
      total: r.total ?? 0,
      completed: r.completed ?? 0,
      delayed: r.delayed ?? 0,
      completionRatePct: toNumberOrNull(r.completionRatePct),
    }));
  }
  // PD path — same shape but scoped to their division. Even though the UI
  // hides the Districts nav item for PDs, filter anyway for defence-in-depth
  // against direct API access.
  const result = await db.execute(sql`
    SELECT d.district_id, d.district_name,
           COUNT(p.project_id) FILTER (WHERE p.division_id = ${divisionId})                        AS total,
           COUNT(*) FILTER (WHERE p.status = 'Completed' AND p.division_id = ${divisionId})         AS completed,
           COUNT(*) FILTER (WHERE p.status = 'Delayed'   AND p.division_id = ${divisionId})         AS delayed,
           ROUND(COUNT(*) FILTER (WHERE p.status = 'Completed' AND p.division_id = ${divisionId})::NUMERIC
                 / NULLIF(COUNT(p.project_id) FILTER (WHERE p.division_id = ${divisionId}), 0) * 100, 0) AS completion_rate_pct
    FROM district d
    LEFT JOIN project p ON p.district_id = d.district_id
    GROUP BY d.district_id, d.district_name
    HAVING COUNT(p.project_id) FILTER (WHERE p.division_id = ${divisionId}) > 0
    ORDER BY total DESC
  `) as unknown as Rows<{
    district_id: number; district_name: string;
    total: number; completed: number; delayed: number;
    completion_rate_pct: string | null;
  }>;
  return result.rows.map((r) => ({
    districtId: r.district_id,
    districtName: r.district_name,
    total: Number(r.total ?? 0),
    completed: Number(r.completed ?? 0),
    delayed: Number(r.delayed ?? 0),
    completionRatePct: toNumberOrNull(r.completion_rate_pct),
  }));
}

export interface DivisionSummaryRow {
  divisionId: number;
  divisionName: string;
  regionId: number;
  regionName: string;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  notStarted: number;
  onHold: number;
  completionRatePct: number | null;
}

export async function getDivisionSummary(
  divisionId: number | null = null,
): Promise<DivisionSummaryRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vDivisionSummary);
    return rows.map((r) => ({
      divisionId: r.divisionId,
      divisionName: r.divisionName,
      regionId: r.regionId,
      regionName: r.regionName,
      total: r.total ?? 0,
      completed: r.completed ?? 0,
      inProgress: r.inProgress ?? 0,
      delayed: r.delayed ?? 0,
      notStarted: r.notStarted ?? 0,
      onHold: r.onHold ?? 0,
      completionRatePct: toNumberOrNull(r.completionRatePct),
    }));
  }
  // PDs see only their own division as a single row (defence-in-depth even
  // though the UI hides this page from them).
  const rows = await db
    .select()
    .from(vDivisionSummary)
    .where(sql`${vDivisionSummary.divisionId} = ${divisionId}`);
  return rows.map((r) => ({
    divisionId: r.divisionId,
    divisionName: r.divisionName,
    regionId: r.regionId,
    regionName: r.regionName,
    total: r.total ?? 0,
    completed: r.completed ?? 0,
    inProgress: r.inProgress ?? 0,
    delayed: r.delayed ?? 0,
    notStarted: r.notStarted ?? 0,
    onHold: r.onHold ?? 0,
    completionRatePct: toNumberOrNull(r.completionRatePct),
  }));
}

export interface RegionSummaryRow {
  regionId: number;
  regionName: string;
  divisionCount: number;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  notStarted: number;
  onHold: number;
}

export async function getRegionSummary(
  divisionId: number | null = null,
): Promise<RegionSummaryRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vRegionSummary);
    return rows.map((r) => ({
      regionId: r.regionId,
      regionName: r.regionName,
      divisionCount: r.divisionCount ?? 0,
      total: r.total ?? 0,
      completed: r.completed ?? 0,
      inProgress: r.inProgress ?? 0,
      delayed: r.delayed ?? 0,
      notStarted: r.notStarted ?? 0,
      onHold: r.onHold ?? 0,
    }));
  }
  // PDs see only the region that contains their assigned division, with
  // counts scoped to their division only (defence-in-depth).
  const result = await db.execute(sql`
    SELECT
      r.region_id,
      r.region_name,
      1                                                                          AS division_count,
      COUNT(p.project_id)                                                        AS total,
      COUNT(*) FILTER (WHERE p.status = 'Completed')                             AS completed,
      COUNT(*) FILTER (WHERE p.status = 'In Progress')                           AS in_progress,
      COUNT(*) FILTER (WHERE p.status = 'Delayed')                               AS delayed,
      COUNT(*) FILTER (WHERE p.status = 'Not Started')                           AS not_started,
      COUNT(*) FILTER (WHERE p.status = 'On Hold')                               AS on_hold
    FROM region r
    JOIN division dv ON dv.region_id = r.region_id
    LEFT JOIN project p ON p.division_id = dv.division_id AND p.division_id = ${divisionId}
    WHERE dv.division_id = ${divisionId}
    GROUP BY r.region_id, r.region_name
  `) as unknown as Rows<{
    region_id: number; region_name: string; division_count: number;
    total: number; completed: number; in_progress: number; delayed: number;
    not_started: number; on_hold: number;
  }>;
  return result.rows.map((r) => ({
    regionId: r.region_id,
    regionName: r.region_name,
    divisionCount: Number(r.division_count ?? 0),
    total: Number(r.total ?? 0),
    completed: Number(r.completed ?? 0),
    inProgress: Number(r.in_progress ?? 0),
    delayed: Number(r.delayed ?? 0),
    notStarted: Number(r.not_started ?? 0),
    onHold: Number(r.on_hold ?? 0),
  }));
}

/* ============================================================
 * DELAY / OUTSTANDING GAP / MANAGEMENT ACTION
 * ============================================================ */

export interface DelayStatusRow {
  projectId: string;
  projectName: string | null;
  status: string | null;
  plannedEndDate: string | null;
  effectiveRevisedEndDate: string | null;
  totalDelayDays: number | null;
  coveredByEotDays: number | null;
  uncoveredDelayDays: number | null;
}

export async function getDelayStatus(
  divisionId: number | null = null,
): Promise<DelayStatusRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vProjectDelayStatus);
    return rows.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName,
      status: r.status,
      plannedEndDate: r.plannedEndDate,
      effectiveRevisedEndDate: r.effectiveRevisedEndDate,
      totalDelayDays: r.totalDelayDays,
      coveredByEotDays: r.coveredByEotDays,
      uncoveredDelayDays: r.uncoveredDelayDays,
    }));
  }
  // Filter the existing view by joining project to inherit division_id.
  const rows = await db
    .select()
    .from(vProjectDelayStatus)
    .where(sql`${vProjectDelayStatus.projectId} IN (
      SELECT project_id FROM project WHERE division_id = ${divisionId}
    )`);
  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    status: r.status,
    plannedEndDate: r.plannedEndDate,
    effectiveRevisedEndDate: r.effectiveRevisedEndDate,
    totalDelayDays: r.totalDelayDays,
    coveredByEotDays: r.coveredByEotDays,
    uncoveredDelayDays: r.uncoveredDelayDays,
  }));
}

export interface OutstandingGapRow {
  projectId: string;
  projectName: string | null;
  sectorId: number | null;
  districtId: number | null;
  priority: string | null;
  remark: string | null;
  status: string | null;
}

export async function getOutstandingGaps(
  divisionId: number | null = null,
): Promise<OutstandingGapRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vOutstandingGaps);
    return rows.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName,
      sectorId: r.sectorId,
      districtId: r.districtId,
      priority: r.priority,
      remark: r.remark,
      status: r.status,
    }));
  }
  const rows = await db
    .select()
    .from(vOutstandingGaps)
    .where(sql`${vOutstandingGaps.projectId} IN (
      SELECT project_id FROM project WHERE division_id = ${divisionId}
    )`);
  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    sectorId: r.sectorId,
    districtId: r.districtId,
    priority: r.priority,
    remark: r.remark,
    status: r.status,
  }));
}

export interface ManagementActionSummaryRow {
  projectId: string;
  projectName: string | null;
  totalItems: number;
  openItems: number;
  closedItems: number;
}

export async function getManagementActionSummary(
  divisionId: number | null = null,
): Promise<ManagementActionSummaryRow[]> {
  if (divisionId === null) {
    const rows = await db.select().from(vManagementActionSummary);
    return rows.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName,
      totalItems: r.totalItems ?? 0,
      openItems: r.openItems ?? 0,
      closedItems: r.closedItems ?? 0,
    }));
  }
  const rows = await db
    .select()
    .from(vManagementActionSummary)
    .where(sql`${vManagementActionSummary.projectId} IN (
      SELECT project_id FROM project WHERE division_id = ${divisionId}
    )`);
  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    totalItems: r.totalItems ?? 0,
    openItems: r.openItems ?? 0,
    closedItems: r.closedItems ?? 0,
  }));
}

/* ============================================================
 * COS/EOT LISTING (paginated)
 * ============================================================ */

export interface CosEotRecord {
  cosId: number;
  projectId: string;
  projectName: string | null;
  sectorId: number | null;
  districtId: number | null;
  cosNumber: string | null;
  cosDate: string | null;
  category: string | null;
  cosAmountCr: number | null;
  variationPct: number | null;
  eotNumber: string | null;
  eotDaysGranted: number | null;
  timeLinked: boolean | null;
  originalEndDate: string | null;
  newEndDate: string | null;
  revisedDate: string | null;
}

export async function listCosEotRecords(
  limit: number,
  offset: number,
  divisionId: number | null = null,
): Promise<CosEotRecord[]> {
  const baseQuery = db
    .select()
    .from(vCosEotRecords)
    .orderBy(desc(vCosEotRecords.cosDate), desc(vCosEotRecords.cosId))
    .limit(limit)
    .offset(offset);
  const rows = divisionId === null
    ? await baseQuery
    : await db
        .select()
        .from(vCosEotRecords)
        .where(sql`${vCosEotRecords.projectId} IN (
          SELECT project_id FROM project WHERE division_id = ${divisionId}
        )`)
        .orderBy(desc(vCosEotRecords.cosDate), desc(vCosEotRecords.cosId))
        .limit(limit)
        .offset(offset);
  return rows.map((r) => ({
    cosId: r.cosId,
    projectId: r.projectId,
    projectName: r.projectName,
    sectorId: r.sectorId,
    districtId: r.districtId,
    cosNumber: r.cosNumber,
    cosDate: r.cosDate,
    category: r.category,
    cosAmountCr: toNumberOrNull(r.cosAmountCr),
    variationPct: toNumberOrNull(r.variationPct),
    eotNumber: r.eotNumber,
    eotDaysGranted: r.eotDaysGranted,
    timeLinked: r.timeLinked,
    originalEndDate: r.originalEndDate,
    newEndDate: r.newEndDate,
    revisedDate: r.revisedDate,
  }));
}

/* ============================================================
 * PER-PROJECT MILESTONE / PHYSICAL PROGRESS HISTORY
 *
 * Per-project routes are gated by pdProjectGuard middleware, so no need
 * to re-check division here.
 * ============================================================ */

export interface PhysicalHistoryPoint {
  snapMonth: string;
  weightedPhysicalPct: number | null;
}

export async function getProjectPhysicalHistory(
  projectId: string,
): Promise<PhysicalHistoryPoint[]> {
  const rows = await db
    .select()
    .from(vProjectPhysicalHistory)
    .where(sql`${vProjectPhysicalHistory.projectId} = ${projectId}`);
  return rows.map((r) => ({
    snapMonth: r.snapMonth,
    weightedPhysicalPct: toNumberOrNull(r.weightedPhysicalPct),
  }));
}

export interface MilestoneHistoryPoint {
  milestoneId: number;
  milestoneName: string;
  weightPct: number | null;
  snapMonth: string;
  progressPct: number | null;
  weightedContribution: number | null;
}

export async function getProjectMilestoneHistory(
  projectId: string,
): Promise<MilestoneHistoryPoint[]> {
  const rows = await db
    .select()
    .from(vMilestoneHistory)
    .where(sql`${vMilestoneHistory.projectId} = ${projectId}`);
  return rows.map((r) => ({
    milestoneId: r.milestoneId,
    milestoneName: r.milestoneName,
    weightPct: toNumberOrNull(r.weightPct),
    snapMonth: r.snapMonth,
    progressPct: toNumberOrNull(r.progressPct),
    weightedContribution: toNumberOrNull(r.weightedContribution),
  }));
}
