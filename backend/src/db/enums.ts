/**
 * CHECK-constrained value sets from the SQL schema, mirrored here as
 * const arrays. Import these into Zod input schemas so the wire format
 * cannot drift from what Postgres will accept.
 */

export const projectStatuses = [
  'Not Started',
  'In Progress',
  'Completed',
  'On Hold',
  'Delayed',
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

/**
 * @deprecated Soft-removed from the UI in the Phase A customization
 * (see drizzle/0006). Column and enum remain so existing values still
 * round-trip through the API on edit; new writes should not populate it.
 */
export const projectStages = [
  'Conceptualization',
  'Pre-Tender',
  'Tender',
  'Construction',
  'O&M',
] as const;
export type ProjectStage = (typeof projectStages)[number];

/**
 * @deprecated Soft-removed from the UI in Phase A (see drizzle/0006).
 * Column and enum remain for legacy round-trip; no new writes.
 */
export const workTypes = [
  'Tender Work',
  'Tender Service',
  'Pre-Monsoon',
  'Construction',
  'Others',
] as const;
export type WorkType = (typeof workTypes)[number];

/**
 * @deprecated Soft-removed from the UI in Phase A (see drizzle/0006).
 * Existing values have been backfilled into project_stage_v2 with
 * spelling normalisation. Column kept for legacy round-trip.
 */
export const currentPhases = [
  'Conceptualization',
  'Design',
  'Pre-Tender',
  'Tender',
  'Construction',
  'O&M',
  'Completed',
] as const;
export type CurrentPhase = (typeof currentPhases)[number];

/** New Project Stage field added in Phase A (§3.2). Replaces both the
 *  soft-removed `project_stage` and `current_phase` from the UI. */
export const projectStageV2Values = [
  'Conceptualisation',
  'Design',
  'Pre-Tender',
  'Tender',
  'Construction',
  'O&M',
  'Other',
] as const;
export type ProjectStageV2 = (typeof projectStageV2Values)[number];

/**
 * Tender workflow sub-stages (Tendor_Dashboard.md §1). Order is significant
 * — Transfer to Next/Previous Stage walks this array by index and the first
 * / last entries define the workflow boundaries. The DB CHECK constraint
 * (drizzle/0009) mirrors these exact strings.
 */
export const tenderSubStages = [
  'NIT Published',
  'Bid Submission (Open)',
  'Technical Evaluation',
  'Financial Evaluation',
  'Approval Process',
  'LoA Issued',
  'Agreement Signing',
  'Work Order Issued',
] as const;
export type TenderSubStage = (typeof tenderSubStages)[number];
export const FIRST_TENDER_SUB_STAGE = tenderSubStages[0];
export const FINAL_TENDER_SUB_STAGE =
  tenderSubStages[tenderSubStages.length - 1] as TenderSubStage;

export const contractTypes = [
  'Work Contract',
  'Service Contract',
  'O&M Contract',
  'Others',
] as const;
export type ContractType = (typeof contractTypes)[number];

export const priorities = ['High', 'Medium', 'Low', 'N/A'] as const;
export type Priority = (typeof priorities)[number];

export const omStatusOverrides = [
  'Not Started',
  'Ongoing',
  'Expiring Soon',
  'Expired',
  'Handed Over to ULB',
] as const;
export type OmStatusOverride = (typeof omStatusOverrides)[number];

export const cosCategories = [
  'SCOPE ADDITION',
  'SCOPE DELETION',
  'DESIGN CHANGE',
  'QUANTITY VARIATION',
  'OTHERS',
] as const;
export type CosCategory = (typeof cosCategories)[number];

export const openClosedStatuses = ['Open', 'Closed'] as const;
export type OpenClosedStatus = (typeof openClosedStatuses)[number];

export const geoPhotoSourceTypes = ['url', 'file'] as const;
export type GeoPhotoSourceType = (typeof geoPhotoSourceTypes)[number];

export const momStatuses = [
  'Action Pending',
  'In Progress',
  'Resolved',
  'Deferred',
] as const;
export type MomStatus = (typeof momStatuses)[number];

export const userRoles = ['MD', 'Admin', 'PD', 'Viewer'] as const;
export type UserRole = (typeof userRoles)[number];

export const auditActions = ['Created', 'Updated', 'Deleted'] as const;
export type AuditAction = (typeof auditActions)[number];

export const fundingSources = [
  'Central - EAP',
  'Central - Non-EAP',
  'Central - State Share',
  'State Funded',
] as const;
export type FundingSource = (typeof fundingSources)[number];

/** Derived (not stored) — computed from ucSubmittedDate/expenditure in the service. */
export const fundsUcStatuses = ['Submitted', 'Pending', 'Overdue'] as const;
export type FundsUcStatus = (typeof fundsUcStatuses)[number];
