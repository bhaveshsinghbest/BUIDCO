/**
 * Typed declarations for the 22 `v_*` views defined in
 * drizzle/0000_baseline.sql. Each is `.existing()` — Drizzle will NOT
 * emit a CREATE VIEW statement; it just provides typed selection so
 * KPI/list queries in Phase 4 can read them via the query builder.
 */

import {
  boolean,
  date,
  integer,
  numeric,
  pgView,
  text,
  varchar,
} from 'drizzle-orm/pg-core';

/* Milestone / physical progress views */

export const vMilestoneHistory = pgView('v_milestone_history', {
  projectId: text('project_id').notNull(),
  milestoneId: integer('milestone_id').notNull(),
  milestoneName: varchar('milestone_name', { length: 200 }).notNull(),
  weightPct: numeric('weight_pct', { precision: 5, scale: 2 }).notNull(),
  snapMonth: date('snap_month').notNull(),
  progressPct: numeric('progress_pct', { precision: 5, scale: 2 }).notNull(),
  weightedContribution: numeric('weighted_contribution', { precision: 6, scale: 3 }),
}).existing();

export const vProjectPhysicalHistory = pgView('v_project_physical_history', {
  projectId: text('project_id').notNull(),
  snapMonth: date('snap_month').notNull(),
  weightedPhysicalPct: numeric('weighted_physical_pct', { precision: 6, scale: 2 }),
}).existing();

export const vProjectPhysicalRollup = pgView('v_project_physical_rollup', {
  projectId: text('project_id').notNull(),
  latestMonth: date('latest_month'),
  weightedPhysicalPct: numeric('weighted_physical_pct', { precision: 6, scale: 2 }),
}).existing();

export const vProjectEffectivePhysical = pgView('v_project_effective_physical', {
  projectId: text('project_id').notNull(),
  physicalProgressPct: numeric('physical_progress_pct', { precision: 6, scale: 2 }),
  isMilestoneWeighted: boolean('is_milestone_weighted'),
  latestMonth: date('latest_month'),
}).existing();

/* Portfolio KPI views */

export const vOverviewKpis = pgView('v_overview_kpis', {
  total: integer('total'),
  completed: integer('completed'),
  inProgress: integer('in_progress'),
  delayed: integer('delayed'),
  onHold: integer('on_hold'),
  notStarted: integer('not_started'),
  totalAaCr: numeric('total_aa_cr', { precision: 14, scale: 2 }),
  totalAgreementCr: numeric('total_agreement_cr', { precision: 14, scale: 2 }),
  totalFinancialCr: numeric('total_financial_cr', { precision: 14, scale: 2 }),
  avgPhysicalPct: numeric('avg_physical_pct', { precision: 6, scale: 1 }),
  avgFinancialPct: numeric('avg_financial_pct', { precision: 6, scale: 1 }),
  financialUtilisationPct: numeric('financial_utilisation_pct', { precision: 6, scale: 1 }),
}).existing();

export const vScheduleVsActual = pgView('v_schedule_vs_actual', {
  avgActualPct: numeric('avg_actual_pct', { precision: 6, scale: 1 }),
  avgScheduledPctRaw: numeric('avg_scheduled_pct_raw', { precision: 6, scale: 1 }),
  projectsWithSchedule: integer('projects_with_schedule'),
  avgScheduledPctEffective: numeric('avg_scheduled_pct_effective', { precision: 6, scale: 1 }),
}).existing();

export const vStageBuckets = pgView('v_stage_buckets', {
  stage: text('stage'),
  projectCount: integer('project_count'),
  totalAaCr: numeric('total_aa_cr', { precision: 14, scale: 2 }),
}).existing();

export const vWorkTypeCounts = pgView('v_work_type_counts', {
  tenderWorks: integer('tender_works'),
  tenderServices: integer('tender_services'),
  preMonsoon: integer('pre_monsoon'),
  preMonsoonCritical: integer('pre_monsoon_critical'),
}).existing();

export const vFinancialSecurities = pgView('v_financial_securities', {
  totalMobAdvanceCr: numeric('total_mob_advance_cr', { precision: 14, scale: 2 }),
  totalAdvanceOutstandingCr: numeric('total_advance_outstanding_cr', { precision: 14, scale: 2 }),
  totalRetentionCr: numeric('total_retention_cr', { precision: 14, scale: 2 }),
  totalPbgCr: numeric('total_pbg_cr', { precision: 14, scale: 2 }),
  totalEmdCr: numeric('total_emd_cr', { precision: 14, scale: 2 }),
  pbgExpiredCount: integer('pbg_expired_count'),
}).existing();

/* Alert / list views */

export const vPbgExpiryAlerts = pgView('v_pbg_expiry_alerts', {
  projectId: text('project_id').notNull(),
  projectName: varchar('project_name', { length: 300 }),
  districtId: integer('district_id'),
  city: varchar('city', { length: 100 }),
  pbgExpiryDate: date('pbg_expiry_date'),
  daysLeft: integer('days_left'),
}).existing();

export const vOmStatus = pgView('v_om_status', {
  projectId: text('project_id').notNull(),
  projectName: varchar('project_name', { length: 300 }),
  omAgency: varchar('om_agency', { length: 150 }),
  startDate: date('start_date'),
  endDate: date('end_date'),
  totalDays: integer('total_days'),
  elapsedDays: integer('elapsed_days'),
  daysLeft: integer('days_left'),
  pctElapsed: numeric('pct_elapsed', { precision: 6, scale: 2 }),
  status: varchar('status', { length: 20 }),
}).existing();

export const vOmExpiryAlerts = pgView('v_om_expiry_alerts', {
  projectId: text('project_id').notNull(),
  projectName: varchar('project_name', { length: 300 }),
  omAgency: varchar('om_agency', { length: 150 }),
  startDate: date('start_date'),
  endDate: date('end_date'),
  totalDays: integer('total_days'),
  elapsedDays: integer('elapsed_days'),
  daysLeft: integer('days_left'),
  pctElapsed: numeric('pct_elapsed', { precision: 6, scale: 2 }),
  status: varchar('status', { length: 20 }),
}).existing();

/* Scheme / sector / district charts */

export const vSchemeChart = pgView('v_scheme_chart', {
  schemeId: integer('scheme_id').notNull(),
  schemeName: varchar('scheme_name', { length: 60 }).notNull(),
  projectCount: integer('project_count'),
  avgPhysicalPct: numeric('avg_physical_pct', { precision: 6, scale: 1 }),
  avgFinancialPct: numeric('avg_financial_pct', { precision: 6, scale: 1 }),
  totalAgreementCr: numeric('total_agreement_cr', { precision: 14, scale: 2 }),
  totalFinancialCr: numeric('total_financial_cr', { precision: 14, scale: 2 }),
}).existing();

export const vStatusDonut = pgView('v_status_donut', {
  status: varchar('status', { length: 20 }).notNull(),
  projectCount: integer('project_count'),
}).existing();

export const vSchemeSummary = pgView('v_scheme_summary', {
  schemeId: integer('scheme_id').notNull(),
  schemeName: varchar('scheme_name', { length: 60 }).notNull(),
  total: integer('total'),
  completed: integer('completed'),
  inProgress: integer('in_progress'),
  delayed: integer('delayed'),
}).existing();

export const vSchemeKpiSummary = pgView('v_scheme_kpi_summary', {
  schemeId: integer('scheme_id').notNull(),
  schemeName: varchar('scheme_name', { length: 60 }).notNull(),
  total: integer('total'),
  completed: integer('completed'),
  inProgress: integer('in_progress'),
  delayed: integer('delayed'),
  onHold: integer('on_hold'),
  notStarted: integer('not_started'),
  avgPhysicalPct: numeric('avg_physical_pct', { precision: 6, scale: 1 }),
  avgFinancialPct: numeric('avg_financial_pct', { precision: 6, scale: 1 }),
  totalAaCr: numeric('total_aa_cr', { precision: 14, scale: 2 }),
  totalFinancialCr: numeric('total_financial_cr', { precision: 14, scale: 2 }),
  financialUtilisationPct: numeric('financial_utilisation_pct', { precision: 6, scale: 1 }),
}).existing();

export const vSectorSummary = pgView('v_sector_summary', {
  sectorId: integer('sector_id').notNull(),
  sectorName: varchar('sector_name', { length: 40 }).notNull(),
  total: integer('total'),
  completed: integer('completed'),
  inProgress: integer('in_progress'),
  delayed: integer('delayed'),
}).existing();

export const vDistrictSummary = pgView('v_district_summary', {
  districtId: integer('district_id').notNull(),
  districtName: varchar('district_name', { length: 60 }).notNull(),
  total: integer('total'),
  completed: integer('completed'),
  delayed: integer('delayed'),
  completionRatePct: numeric('completion_rate_pct', { precision: 5, scale: 0 }),
}).existing();

export const vDivisionSummary = pgView('v_division_summary', {
  divisionId: integer('division_id').notNull(),
  divisionName: varchar('division_name', { length: 80 }).notNull(),
  regionId: integer('region_id').notNull(),
  regionName: varchar('region_name', { length: 60 }).notNull(),
  total: integer('total'),
  completed: integer('completed'),
  inProgress: integer('in_progress'),
  delayed: integer('delayed'),
  completionRatePct: numeric('completion_rate_pct', { precision: 5, scale: 0 }),
  // Appended by drizzle/0015 — CREATE OR REPLACE VIEW can only add columns
  // at the end, so these sit after completion_rate_pct rather than beside
  // the other status counts.
  notStarted: integer('not_started'),
  onHold: integer('on_hold'),
}).existing();

export const vRegionSummary = pgView('v_region_summary', {
  regionId: integer('region_id').notNull(),
  regionName: varchar('region_name', { length: 60 }).notNull(),
  divisionCount: integer('division_count'),
  total: integer('total'),
  completed: integer('completed'),
  inProgress: integer('in_progress'),
  delayed: integer('delayed'),
  notStarted: integer('not_started'),
  onHold: integer('on_hold'),
}).existing();

/* CoS/EoT + delay + management action + outstanding gap views */

export const vCosEotRecords = pgView('v_cos_eot_records', {
  cosId: integer('cos_id').notNull(),
  projectId: text('project_id').notNull(),
  projectName: varchar('project_name', { length: 300 }),
  sectorId: integer('sector_id'),
  districtId: integer('district_id'),
  cosNumber: varchar('cos_number', { length: 20 }),
  cosDate: date('cos_date'),
  category: varchar('category', { length: 30 }),
  cosAmountCr: numeric('cos_amount_cr', { precision: 12, scale: 2 }),
  variationPct: numeric('variation_pct', { precision: 6, scale: 2 }),
  eotNumber: varchar('eot_number', { length: 20 }),
  eotDaysGranted: integer('eot_days_granted'),
  timeLinked: boolean('time_linked'),
  originalEndDate: date('original_end_date'),
  newEndDate: date('new_end_date'),
  revisedDate: date('revised_date'),
}).existing();

export const vProjectCosEotRollup = pgView('v_project_cos_eot_rollup', {
  projectId: text('project_id').notNull(),
  cosCount: integer('cos_count'),
  totalEotDays: integer('total_eot_days'),
  latestRevisedEndDate: date('latest_revised_end_date'),
  hasCosEot: boolean('has_cos_eot'),
}).existing();

export const vProjectDelayStatus = pgView('v_project_delay_status', {
  projectId: text('project_id').notNull(),
  projectName: varchar('project_name', { length: 300 }),
  status: varchar('status', { length: 20 }),
  plannedEndDate: date('planned_end_date'),
  effectiveRevisedEndDate: date('effective_revised_end_date'),
  totalDelayDays: integer('total_delay_days'),
  coveredByEotDays: integer('covered_by_eot_days'),
  uncoveredDelayDays: integer('uncovered_delay_days'),
}).existing();

export const vOutstandingGaps = pgView('v_outstanding_gaps', {
  projectId: text('project_id').notNull(),
  projectName: varchar('project_name', { length: 300 }),
  sectorId: integer('sector_id'),
  districtId: integer('district_id'),
  priority: varchar('priority', { length: 6 }),
  remark: text('remark'),
  status: varchar('status', { length: 20 }),
}).existing();

export const vManagementActionSummary = pgView('v_management_action_summary', {
  projectId: text('project_id').notNull(),
  projectName: varchar('project_name', { length: 300 }),
  totalItems: integer('total_items'),
  openItems: integer('open_items'),
  closedItems: integer('closed_items'),
}).existing();
