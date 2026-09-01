/**
 * Drizzle table declarations for the BUIDCO schema.
 *
 * The SQL source of truth lives in drizzle/0000_baseline.sql (a verbatim
 * copy of the schema block from BUIDCO_table.md). This file mirrors it in
 * TypeScript so the query builder can produce typed reads/writes; CHECK
 * constraints, triggers, and views are declared in the SQL migration and
 * NOT re-created here. Do not run `drizzle-kit push` against this schema —
 * it would try to reconcile the two and lose the triggers/views.
 */

import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ============================================================
 * LOOKUP TABLES
 * ============================================================ */

export const district = pgTable('district', {
  districtId: serial('district_id').primaryKey(),
  districtName: varchar('district_name', { length: 60 }).notNull().unique(),
});

export const region = pgTable('region', {
  regionId: serial('region_id').primaryKey(),
  regionName: varchar('region_name', { length: 60 }).notNull().unique(),
});

export const division = pgTable(
  'division',
  {
    divisionId: serial('division_id').primaryKey(),
    divisionName: varchar('division_name', { length: 80 }).notNull().unique(),
    regionId: integer('region_id')
      .notNull()
      .references(() => region.regionId),
  },
  (t) => ({
    regionIdx: index('idx_division_region').on(t.regionId),
  }),
);

export const sector = pgTable('sector', {
  sectorId: serial('sector_id').primaryKey(),
  sectorName: varchar('sector_name', { length: 40 }).notNull().unique(),
});

export const scheme = pgTable('scheme', {
  schemeId: serial('scheme_id').primaryKey(),
  schemeName: varchar('scheme_name', { length: 60 }).notNull().unique(),
});

/* ============================================================
 * CORE: project
 * ============================================================ */

export const project = pgTable(
  'project',
  {
    projectId: text('project_id').primaryKey(),
    projectName: varchar('project_name', { length: 300 }).notNull(),

    sectorId: integer('sector_id').references(() => sector.sectorId),
    city: varchar('city', { length: 100 }),
    districtId: integer('district_id').references(() => district.districtId),
    divisionId: integer('division_id').references(() => division.divisionId),
    contractor: varchar('contractor', { length: 200 }),
    pd: varchar('pd', { length: 120 }),
    mainWork: text('main_work'),
    physicalWorkProgressNote: text('physical_work_progress_note'),
    /** @deprecated Soft-removed from UI in Phase A (0006); column kept for legacy round-trip. */
    projectStage: varchar('project_stage', { length: 20 }),
    /** @deprecated Soft-removed from UI in Phase A (0006); column kept for legacy round-trip. */
    workType: varchar('work_type', { length: 20 }),
    contractType: varchar('contract_type', { length: 20 }),
    sponsoringDept: varchar('sponsoring_dept', { length: 150 }),
    implementingAgency: varchar('implementing_agency', { length: 150 }),
    sanctionDate: date('sanction_date'),
    projectBrief: text('project_brief'),

    /** @deprecated Soft-removed from UI in Phase A (0006); backfilled into projectStageV2. */
    currentPhase: varchar('current_phase', { length: 20 }),
    /** Backend column name stays `status`; UI label is "Execution Status" (Phase A §2). */
    status: varchar('status', { length: 20 }).notNull().default('Not Started'),
    projectStageV2: varchar('project_stage_v2', { length: 20 }),
    /**
     * Tender Dashboard sub-stage (Tendor_Dashboard.md §1). Non-null iff
     * project_stage_v2 = 'Tender' — enforced by a CHECK constraint in
     * drizzle/0009_tender_sub_stage.sql so schema drift can't decouple the
     * two columns.
     */
    tenderSubStage: varchar('tender_sub_stage', { length: 30 }),
    /**
     * NIT (Notice Inviting Tender) reference number, populated during the
     * NIT Published sub-stage. Editable only from the Tender Dashboard
     * while the project is in that sub-stage (NIT_addition_instructions.md §4).
     */
    nitNumber: varchar('nit_number', { length: 80 }),
    /** NIT publication date; paired with nitNumber (see above). */
    nitDate: date('nit_date'),
    plannedEndDate: date('planned_end_date'),
    revisedEndDate: date('revised_end_date'),
    delayReason: text('delay_reason'),
    deptStuckAt: varchar('dept_stuck_at', { length: 150 }),
    expectedCompletionDate: date('expected_completion_date'),
    expectedCompletionRaw: text('expected_completion_raw'),

    priority: varchar('priority', { length: 6 }),
    sanctionedCostCr: numeric('sanctioned_cost_cr', { precision: 12, scale: 2 }),
    aaAmountCr: numeric('aa_amount_cr', { precision: 12, scale: 2 }),
    revisedAaAmountCr: numeric('revised_aa_amount_cr', { precision: 12, scale: 2 }),
    agreementAmountCr: numeric('agreement_amount_cr', { precision: 12, scale: 2 }),
    physicalProgressPct: numeric('physical_progress_pct', { precision: 5, scale: 2 }),
    financialProgressCr: numeric('financial_progress_cr', { precision: 12, scale: 2 }),
    financialProgressPct: numeric('financial_progress_pct', { precision: 5, scale: 2 }),
    scheduledProgressPct: numeric('scheduled_progress_pct', { precision: 5, scale: 2 }),

    agreementNumber: varchar('agreement_number', { length: 80 }),
    agreementDate: date('agreement_date'),
    appointedDate: date('appointed_date'),
    contractValueCr: numeric('contract_value_cr', { precision: 12, scale: 2 }),
    mobAdvanceIssuedCr: numeric('mob_advance_issued_cr', { precision: 12, scale: 2 }),
    mobAdvanceRecoveredCr: numeric('mob_advance_recovered_cr', { precision: 12, scale: 2 }),
    advanceOutstandingCr: numeric('advance_outstanding_cr', { precision: 12, scale: 2 }),
    retentionMoneyHeldCr: numeric('retention_money_held_cr', { precision: 12, scale: 2 }),
    pbgNumber: varchar('pbg_number', { length: 80 }),
    pbgAmountCr: numeric('pbg_amount_cr', { precision: 12, scale: 2 }),
    pbgExpiryDate: date('pbg_expiry_date'),
    pbgIssuingBank: varchar('pbg_issuing_bank', { length: 120 }),
    emdAmountCr: numeric('emd_amount_cr', { precision: 12, scale: 2 }),
    emdRefNumber: varchar('emd_ref_number', { length: 80 }),
    emdDate: date('emd_date'),
    totalPaymentsCr: numeric('total_payments_cr', { precision: 12, scale: 2 }),
    lastPaymentDate: date('last_payment_date'),
    lastRaBillNo: varchar('last_ra_bill_no', { length: 60 }),

    geoTaggingUrl: text('geo_tagging_url'),

    remark: text('remark'),
    /** @deprecated Legacy free-text column; write to management_action_item instead. */
    managementActionLegacy: text('management_action_legacy'),

    omApplicable: boolean('om_applicable').default(false),
    omStartDate: date('om_start_date'),
    omPeriodMonths: numeric('om_period_months', { precision: 5, scale: 1 }),
    omEndDate: date('om_end_date'),
    omAgency: varchar('om_agency', { length: 150 }),
    omStatusOverride: varchar('om_status_override', { length: 20 }),
    omRemarks: text('om_remarks'),

    mprMonth: varchar('mpr_month', { length: 20 }),
    fundReceivedCr: numeric('fund_received_cr', { precision: 12, scale: 2 }),
    expenditureCentralRaw: text('expenditure_central_raw'),
    expenditureStateRaw: text('expenditure_state_raw'),
    manpowerEngagedRaw: text('manpower_engaged_raw'),
    mainComponentScope: text('main_component_scope'),
    progressPrevMonthRaw: text('progress_prev_month_raw'),
    progressThisMonthRaw: text('progress_this_month_raw'),
    mprRemark: text('mpr_remark'),

    /** @deprecated Legacy denormalized CoS/EoT fields; write to cos_eot_item instead. */
    cosEotType: varchar('cos_eot_type', { length: 50 }),
    /** @deprecated Legacy denormalized CoS/EoT fields; write to cos_eot_item instead. */
    cosEotStatus: varchar('cos_eot_status', { length: 50 }),
    /** @deprecated Legacy denormalized CoS/EoT fields; write to cos_eot_item instead. */
    cosEotDate: date('cos_eot_date'),
    /** @deprecated Legacy denormalized CoS/EoT fields; write to cos_eot_item instead. */
    cosEotRemark: text('cos_eot_remark'),

    lastUpdated: timestamp('last_updated', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_project_status').on(t.status),
    districtIdx: index('idx_project_district').on(t.districtId),
    sectorIdx: index('idx_project_sector').on(t.sectorId),
    stageIdx: index('idx_project_stage').on(t.projectStage),
    workTypeIdx: index('idx_project_work_type').on(t.workType),
  }),
);

/* ============================================================
 * MILESTONE-WEIGHTED PHYSICAL PROGRESS
 * ============================================================ */

export const projectMilestone = pgTable(
  'project_milestone',
  {
    milestoneId: serial('milestone_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.projectId, { onDelete: 'cascade' }),
    milestoneName: varchar('milestone_name', { length: 200 }).notNull(),
    weightPct: numeric('weight_pct', { precision: 5, scale: 2 }).notNull(),
    plannedDate: date('planned_date'),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    projectNameUnique: unique('project_milestone_project_id_milestone_name_key').on(
      t.projectId,
      t.milestoneName,
    ),
    projectIdx: index('idx_milestone_project').on(t.projectId),
  }),
);

export const milestoneProgress = pgTable(
  'milestone_progress',
  {
    mpId: serial('mp_id').primaryKey(),
    milestoneId: integer('milestone_id')
      .notNull()
      .references(() => projectMilestone.milestoneId, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => project.projectId, { onDelete: 'cascade' }),
    snapMonth: date('snap_month').notNull(),
    progressPct: numeric('progress_pct', { precision: 5, scale: 2 }).notNull(),
    weightedContribution: numeric('weighted_contribution', { precision: 6, scale: 3 }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    milestoneMonthUnique: unique('milestone_progress_milestone_id_snap_month_key').on(
      t.milestoneId,
      t.snapMonth,
    ),
    projectMonthIdx: index('idx_mp_project_month').on(t.projectId, t.snapMonth),
    milestoneIdx: index('idx_mp_milestone').on(t.milestoneId),
  }),
);

/* ============================================================
 * CHILD TABLES
 * ============================================================ */

export const projectScheme = pgTable(
  'project_scheme',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.projectId, { onDelete: 'cascade' }),
    schemeId: integer('scheme_id')
      .notNull()
      .references(() => scheme.schemeId),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.schemeId] }),
    schemeIdx: index('idx_project_scheme_scheme').on(t.schemeId),
  }),
);

export const cosEotItem = pgTable(
  'cos_eot_item',
  {
    cosId: serial('cos_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.projectId, { onDelete: 'cascade' }),
    cosNumber: varchar('cos_number', { length: 20 }),
    cosDate: date('cos_date'),
    category: varchar('category', { length: 30 }),
    cosAmountCr: numeric('cos_amount_cr', { precision: 12, scale: 2 }),
    variationPct: numeric('variation_pct', { precision: 6, scale: 2 }),
    eotNumber: varchar('eot_number', { length: 20 }),
    eotDaysGranted: integer('eot_days_granted').default(0),
    timeLinked: boolean('time_linked').default(false),
    originalEndDate: date('original_end_date'),
    newEndDate: date('new_end_date'),
    revisedDate: date('revised_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    projectIdx: index('idx_cos_eot_project').on(t.projectId),
  }),
);

export const managementActionItem = pgTable(
  'management_action_item',
  {
    itemId: serial('item_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.projectId, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    status: varchar('status', { length: 10 }).notNull().default('Open'),
    deadlineDate: date('deadline_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    projectIdx: index('idx_mgmt_action_project').on(t.projectId),
  }),
);

export const geoPhoto = pgTable('geo_photo', {
  photoId: serial('photo_id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => project.projectId, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  caption: text('caption'),
  photoDate: date('photo_date'),
  sourceType: varchar('source_type', { length: 10 }),
  fileName: varchar('file_name', { length: 200 }),
});

/* ============================================================
 * STANDALONE FEATURE TABLES
 * ============================================================ */

export const preMonsoonItem = pgTable('pre_monsoon_item', {
  itemId: serial('item_id').primaryKey(),
  topic: text('topic').notNull(),
  priority: varchar('priority', { length: 6 }),
  deadlineDate: date('deadline_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const projectFundsUc = pgTable(
  'project_funds_uc',
  {
    fundsUcId: serial('funds_uc_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .unique()
      .references(() => project.projectId, { onDelete: 'cascade' }),
    fundingSource: varchar('funding_source', { length: 30 }).notNull(),
    openingBalanceCr: numeric('opening_balance_cr', { precision: 12, scale: 2 }).notNull().default('0'),
    grantReceivedCr: numeric('grant_received_cr', { precision: 12, scale: 2 }).notNull().default('0'),
    expenditureIncurredCr: numeric('expenditure_incurred_cr', { precision: 12, scale: 2 }).notNull().default('0'),
    sanctionNo: varchar('sanction_no', { length: 80 }),
    ucSubmittedDate: date('uc_submitted_date'),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUpdated: timestamp('last_updated', { withTimezone: true }),
  },
  (t) => ({
    fundingSourceIdx: index('idx_funds_uc_funding_source').on(t.fundingSource),
  }),
);

export const minutesOfMeeting = pgTable(
  'minutes_of_meeting',
  {
    momId: serial('mom_id').primaryKey(),
    meetingDate: date('meeting_date').notNull(),
    meetingTitle: varchar('meeting_title', { length: 200 }).notNull(),
    venue: varchar('venue', { length: 150 }),
    chairperson: varchar('chairperson', { length: 120 }),
    attendees: text('attendees'),
    projectId: text('project_id').references(() => project.projectId),
    agenda: text('agenda'),
    decisions: text('decisions'),
    momStatus: varchar('mom_status', { length: 20 }).notNull().default('Action Pending'),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    projectIdx: index('idx_mom_project').on(t.projectId),
  }),
);

export const momActionPoint = pgTable('mom_action_point', {
  actionId: serial('action_id').primaryKey(),
  momId: integer('mom_id')
    .notNull()
    .references(() => minutesOfMeeting.momId, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  owner: varchar('owner', { length: 120 }),
  dueDate: date('due_date'),
  status: varchar('status', { length: 10 }).notNull().default('Open'),
  resolutionDate: date('resolution_date'),
});

/* ============================================================
 * AUTH & AUDIT
 * ============================================================ */

export const appUser = pgTable('app_user', {
  userId: serial('user_id').primaryKey(),
  username: varchar('username', { length: 60 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: varchar('full_name', { length: 120 }),
  role: varchar('role', { length: 10 }).notNull(),
  isActive: boolean('is_active').default(true),
  canCreateProjects: boolean('can_create_projects').notNull().default(false),
  canUpdateProjects: boolean('can_update_projects').notNull().default(false),
  canDeleteProjects: boolean('can_delete_projects').notNull().default(false),
  canViewProjects:   boolean('can_view_projects').notNull().default(true),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  /** Forgot-password OTP delivery target (Task 4/0009). Nullable — not every existing user has one on file yet. */
  email: varchar('email', { length: 120 }),
  /** Forgot-password OTP delivery target (Task 4/0009). Nullable — not every existing user has one on file yet. */
  mobileNumber: varchar('mobile_number', { length: 15 }),
});

/** PD ↔ Division assignment (Phase C1 §3). */
export const userDivision = pgTable(
  'user_division',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => appUser.userId, { onDelete: 'cascade' }),
    divisionId: integer('division_id')
      .notNull()
      .references(() => division.divisionId, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.divisionId] }),
    userIdx: index('idx_user_division_user').on(t.userId),
    divisionIdx: index('idx_user_division_division').on(t.divisionId),
  }),
);

export const auditLog = pgTable(
  'audit_log',
  {
    auditId: integer('audit_id').generatedAlwaysAsIdentity().primaryKey(),
    projectId: text('project_id').references(() => project.projectId),
    userId: integer('user_id').references(() => appUser.userId),
    userLabel: varchar('user_label', { length: 120 }).notNull(),
    roleLabel: varchar('role_label', { length: 20 }),
    action: varchar('action', { length: 10 }).notNull(),
    projectNameSnapshot: varchar('project_name_snapshot', { length: 300 }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    projectIdx: index('idx_audit_project').on(t.projectId),
  }),
);

export const auditLogChange = pgTable('audit_log_change', {
  changeId: serial('change_id').primaryKey(),
  auditId: integer('audit_id')
    .notNull()
    .references(() => auditLog.auditId, { onDelete: 'cascade' }),
  fieldKey: varchar('field_key', { length: 60 }).notNull(),
  fieldLabel: varchar('field_label', { length: 120 }),
  beforeValue: text('before_value'),
  afterValue: text('after_value'),
});

/* ============================================================
 * REFRESH TOKENS (0001_refresh_token.sql)
 * ============================================================ */

export const refreshToken = pgTable(
  'refresh_token',
  {
    tokenId: text('token_id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => appUser.userId, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: text('replaced_by'),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    /** PD's chosen division for this session; NULL for MD/Admin/Viewer. */
    selectedDivisionId: integer('selected_division_id')
      .references(() => division.divisionId),
  },
  (t) => ({
    userIdx: index('idx_refresh_token_user').on(t.userId),
  }),
);

/* ============================================================
 * PASSWORD RESET OTP (0009_password_reset.sql)
 * ============================================================ */

export const passwordResetOtp = pgTable(
  'password_reset_otp',
  {
    otpId: serial('otp_id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => appUser.userId, { onDelete: 'cascade' }),
    /** 'email' | 'mobile' */
    channel: varchar('channel', { length: 10 }).notNull(),
    otpHash: text('otp_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    /** Populated only after successful OTP verification — see lib/otp.ts. */
    resetTokenHash: text('reset_token_hash'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (t) => ({
    userIdx: index('idx_password_reset_otp_user').on(t.userId),
  }),
);

/* ============================================================
 * PASSWORD RESET REQUESTS (0010_password_reset_requests.sql)
 *
 * Admin/PD/Viewer submit a request here instead of self-serving an OTP;
 * an authorised higher role must approve it (see lib/roleHierarchy.ts).
 * The DB-level partial unique index that enforces "one active request
 * per user" lives only in the SQL migration (not mirrored here — see
 * the file header note on CHECK constraints/triggers/views).
 * ============================================================ */

export const passwordResetRequest = pgTable(
  'password_reset_request',
  {
    requestId: serial('request_id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => appUser.userId, { onDelete: 'cascade' }),
    /** Snapshot of the requester's role at submission time. */
    role: varchar('role', { length: 10 }).notNull(),
    /** 'email' | 'mobile' — chosen by the requester at submission time. */
    channel: varchar('channel', { length: 10 }).notNull(),
    /** 'Pending' | 'Approved' | 'Rejected' | 'Completed' */
    status: varchar('status', { length: 10 }).notNull().default('Pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().default(sql`now()`),
    approverId: integer('approver_id').references(() => appUser.userId),
    approverRole: varchar('approver_role', { length: 10 }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    /** Set when the requester actually completes the password reset. */
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (t) => ({
    userIdx: index('idx_password_reset_request_user').on(t.userId),
  }),
);

/* ============================================================
 * TYPE EXPORTS
 * ============================================================ */

export type District = typeof district.$inferSelect;
export type Sector = typeof sector.$inferSelect;
export type Scheme = typeof scheme.$inferSelect;
export type Region = typeof region.$inferSelect;
export type Division = typeof division.$inferSelect;

export type Project = typeof project.$inferSelect;
export type ProjectInsert = typeof project.$inferInsert;

export type ProjectMilestone = typeof projectMilestone.$inferSelect;
export type ProjectMilestoneInsert = typeof projectMilestone.$inferInsert;

export type MilestoneProgress = typeof milestoneProgress.$inferSelect;
export type MilestoneProgressInsert = typeof milestoneProgress.$inferInsert;

export type CosEotItem = typeof cosEotItem.$inferSelect;
export type CosEotItemInsert = typeof cosEotItem.$inferInsert;

export type ManagementActionItem = typeof managementActionItem.$inferSelect;
export type ManagementActionItemInsert = typeof managementActionItem.$inferInsert;

export type GeoPhoto = typeof geoPhoto.$inferSelect;
export type GeoPhotoInsert = typeof geoPhoto.$inferInsert;

export type PreMonsoonItem = typeof preMonsoonItem.$inferSelect;
export type PreMonsoonItemInsert = typeof preMonsoonItem.$inferInsert;

export type ProjectFundsUc = typeof projectFundsUc.$inferSelect;
export type ProjectFundsUcInsert = typeof projectFundsUc.$inferInsert;

export type MinutesOfMeeting = typeof minutesOfMeeting.$inferSelect;
export type MinutesOfMeetingInsert = typeof minutesOfMeeting.$inferInsert;

export type MomActionPoint = typeof momActionPoint.$inferSelect;
export type MomActionPointInsert = typeof momActionPoint.$inferInsert;

export type AppUser = typeof appUser.$inferSelect;
export type AppUserInsert = typeof appUser.$inferInsert;

export type UserDivision = typeof userDivision.$inferSelect;
export type UserDivisionInsert = typeof userDivision.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type AuditLogInsert = typeof auditLog.$inferInsert;
export type AuditLogChange = typeof auditLogChange.$inferSelect;
export type AuditLogChangeInsert = typeof auditLogChange.$inferInsert;

export type RefreshToken = typeof refreshToken.$inferSelect;
export type RefreshTokenInsert = typeof refreshToken.$inferInsert;

export type PasswordResetRequest = typeof passwordResetRequest.$inferSelect;
export type PasswordResetRequestInsert = typeof passwordResetRequest.$inferInsert;
