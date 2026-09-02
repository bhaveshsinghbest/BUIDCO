/**
 * Wire-format types shared by every RTK Query endpoint. These mirror
 * the shapes emitted by the Express API — kept in sync by convention,
 * since /frontend and /backend are independent apps. When a backend
 * response shape changes, update the matching type here.
 */

export type UserRole = 'MD' | 'Admin' | 'PD' | 'Viewer';

export type ProjectStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'On Hold'
  | 'Delayed';

/** @deprecated Soft-removed from UI in Phase A. Kept for legacy round-trip only. */
export type ProjectStage =
  | 'Conceptualization'
  | 'Pre-Tender'
  | 'Tender'
  | 'Construction'
  | 'O&M';

/** @deprecated Soft-removed from UI in Phase A. Values migrated into `projectStageV2`. */
export type CurrentPhase =
  | 'Conceptualization'
  | 'Design'
  | 'Pre-Tender'
  | 'Tender'
  | 'Construction'
  | 'O&M'
  | 'Completed';

/** @deprecated Soft-removed from UI in Phase A. Kept for legacy round-trip only. */
export type WorkType = 'Tender Work' | 'Tender Service' | 'Pre-Monsoon' | 'Construction' | 'Others';

/** New Project Stage field added in Phase A (§3.2). */
export type ProjectStageV2 =
  | 'Conceptualisation'
  | 'Design'
  | 'Pre-Tender'
  | 'Tender'
  | 'Construction'
  | 'O&M'
  | 'Other';

/** New Contract Type field added in Phase A (§3.1). */
export type ContractType =
  | 'Work Contract'
  | 'Service Contract'
  | 'O&M Contract'
  | 'Others';

/**
 * Tender workflow sub-stages (Tendor_Dashboard.md §1). Order matches the
 * backend's tenderSubStages enum — transfer buttons walk this array by
 * index, so any drift here would silently corrupt Next/Previous behaviour.
 */
export type TenderSubStage =
  | 'NIT Published'
  | 'Bid Submission (Open)'
  | 'Technical Evaluation'
  | 'Financial Evaluation'
  | 'Approval Process'
  | 'LoA Issued'
  | 'Agreement Signing'
  | 'Work Order Issued';
export type Priority = 'High' | 'Medium' | 'Low' | 'N/A';
export type FundingSource =
  | 'Central - EAP'
  | 'Central - Non-EAP'
  | 'Central - State Share'
  | 'State Funded';
export type FundsUcStatus = 'Submitted' | 'Pending' | 'Overdue';
export type OmStatusOverride =
  | 'Not Started'
  | 'Ongoing'
  | 'Expiring Soon'
  | 'Expired'
  | 'Handed Over to ULB';
export type CosCategory =
  | 'SCOPE ADDITION'
  | 'SCOPE DELETION'
  | 'DESIGN CHANGE'
  | 'QUANTITY VARIATION'
  | 'OTHERS';
export type OpenClosedStatus = 'Open' | 'Closed';
export type GeoPhotoSourceType = 'url' | 'file';
export type MomStatus = 'Action Pending' | 'In Progress' | 'Resolved' | 'Deferred';
export type AuditAction = 'Created' | 'Updated' | 'Deleted';

/* -------- Auth -------- */

export interface UserPublic {
  userId: number;
  username: string;
  role: UserRole;
  fullName: string | null;
  canCreateProjects: boolean;
  canUpdateProjects: boolean;
  canDeleteProjects: boolean;
  canViewProjects: boolean;
  /** PD's selected division for this session; absent for other roles. */
  divisionId?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
  /** Step 2 of the PD login handshake. */
  divisionId?: number;
}

/**
 * The /auth/login and /auth/refresh endpoints return one of two shapes:
 *  - success: full AuthResponse (user + tokens)
 *  - needsDivision: PD credentials verified but division not yet picked.
 * The client shows a division picker and re-POSTs with divisionId.
 */
export interface AuthNeedsDivision {
  needsDivision: true;
  divisions: Array<{ divisionId: number; divisionName: string }>;
}

export interface AuthResponse {
  user: UserPublic;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export type LoginResponse = AuthResponse | AuthNeedsDivision;

export interface MeResponse {
  user: UserPublic;
}

/* -------- Forgot password (OTP) -------- */

export type OtpChannel = 'email' | 'mobile';

export interface RequestPasswordResetPayload {
  username: string;
}

export interface RequestPasswordResetResponse {
  found: boolean;
  /** Only MD self-serves directly; every other role goes through request/approval. */
  selfService: boolean;
  maskedEmail: string | null;
  maskedMobile: string | null;
  /** Present only when found && !selfService. */
  requestStatus?: 'none' | 'pending' | 'approved';
  /** Present only when requestStatus === 'approved' — the channel fixed at request time. */
  channel?: OtpChannel;
  /** Present only when found && !selfService — e.g. "MD, Admin, or PD". */
  approverRolesLabel?: string;
}

export interface CreatePasswordResetRequestPayload {
  username: string;
  channel: OtpChannel;
}

export interface CreatePasswordResetRequestResponse {
  submitted: true;
  /** True once an eligible approver was found and the OTP was actually dispatched to them. */
  otpSent: boolean;
}

export interface SendOtpPayload {
  username: string;
  channel: OtpChannel;
}

export interface VerifyOtpPayload {
  username: string;
  channel: OtpChannel;
  otp: string;
}

export interface VerifyOtpResponse {
  resetToken: string;
}

export interface ResetPasswordPayload {
  resetToken: string;
  password: string;
  confirmPassword: string;
}

/* -------- Lookups -------- */

export interface Lookups {
  districts: Array<{ districtId: number; districtName: string }>;
  sectors: Array<{ sectorId: number; sectorName: string }>;
  schemes: Array<{ schemeId: number; schemeName: string }>;
  /** Two regions: 'South Bihar' and 'North Bihar' (Phase B §6). */
  regions: Array<{ regionId: number; regionName: string }>;
  divisions: Array<{ divisionId: number; divisionName: string; regionId: number }>;
}

/* -------- KPIs -------- */

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

export interface ScheduleVsActual {
  avgActualPct: number | null;
  avgScheduledPctRaw: number | null;
  projectsWithSchedule: number;
  avgScheduledPctEffective: number | null;
}

export interface StageBucket {
  stage: string;
  projectCount: number;
  totalAaCr: number | null;
}

export interface WorkTypeCounts {
  tenderWorks: number;
  tenderServices: number;
  preMonsoon: number;
  preMonsoonCritical: number;
}

export interface FinancialSecurities {
  totalMobAdvanceCr: number | null;
  totalAdvanceOutstandingCr: number | null;
  totalRetentionCr: number | null;
  totalPbgCr: number | null;
  totalEmdCr: number | null;
  pbgExpiredCount: number;
}

export interface PbgExpiryAlert {
  projectId: string;
  projectName: string | null;
  districtId: number | null;
  city: string | null;
  pbgExpiryDate: string | null;
  daysLeft: number | null;
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

export interface SchemeChartRow {
  schemeId: number;
  schemeName: string;
  projectCount: number;
  avgPhysicalPct: number | null;
  avgFinancialPct: number | null;
  totalAgreementCr: number | null;
  totalFinancialCr: number | null;
}

export interface StatusDonutRow {
  status: string;
  projectCount: number;
}

export interface SchemeSummaryRow {
  schemeId: number;
  schemeName: string;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
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

export interface SectorSummaryRow {
  sectorId: number;
  sectorName: string;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
}

export interface DistrictSummaryRow {
  districtId: number;
  districtName: string;
  total: number;
  completed: number;
  delayed: number;
  completionRatePct: number | null;
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
  completionRatePct: number | null;
}

export interface RegionSummaryRow {
  regionId: number;
  regionName: string;
  divisionCount: number;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
}

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

export interface OutstandingGapRow {
  projectId: string;
  projectName: string | null;
  sectorId: number | null;
  districtId: number | null;
  priority: string | null;
  remark: string | null;
  status: string | null;
}

export interface MgmtActionSummaryRow {
  projectId: string;
  projectName: string | null;
  totalItems: number;
  openItems: number;
  closedItems: number;
}

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

/* -------- Projects -------- */

export interface ProjectListItem {
  projectId: string;
  projectName: string;
  /** Column name stays `status`; UI label is "Execution Status" (Phase A §2). */
  status: string;
  sectorId: number | null;
  districtId: number | null;
  divisionId: number | null;
  city: string | null;
  contractor: string | null;
  pd: string | null;
  /** @deprecated Soft-removed in Phase A; still returned for legacy round-trip. */
  projectStage: ProjectStage | null;
  projectStageV2: ProjectStageV2 | null;
  /** Tender workflow sub-stage; non-null only when projectStageV2 === 'Tender'. */
  tenderSubStage: TenderSubStage | null;
  /** NIT reference number; editable only from Tender Dashboard's NIT Published sub-stage. */
  nitNumber: string | null;
  /** NIT publication date (YYYY-MM-DD); pairs with nitNumber. */
  nitDate: string | null;
  contractType: ContractType | null;
  /** @deprecated Soft-removed in Phase A; still returned for legacy round-trip. */
  workType: WorkType | null;
  priority: Priority | null;
  physicalProgressPct: number | null;
  financialProgressPct: number | null;
  financialProgressCr: number | null;
  sanctionedCostCr: number | null;
  aaAmountCr: number | null;
  revisedAaAmountCr: number | null;
  agreementAmountCr: number | null;
  plannedEndDate: string | null;
  revisedEndDate: string | null;
  expectedCompletionDate: string | null;
  expectedCompletionRaw: string | null;
  pbgExpiryDate: string | null;
  remark: string | null;
  omApplicable: boolean | null;
  omStartDate: string | null;
  omPeriodMonths: number | null;
  omEndDate: string | null;
  omStatusOverride: OmStatusOverride | null;
  geoTaggingUrl: string | null;
  createdAt: string;
  lastUpdated: string | null;
  effectivePhysicalPct: number | null;
  isMilestoneWeighted: boolean | null;
  schemes: number[];
}

export interface ProjectDetail extends ProjectListItem {
  mainWork: string | null;
  physicalWorkProgressNote: string | null;
  sponsoringDept: string | null;
  implementingAgency: string | null;
  sanctionDate: string | null;
  projectBrief: string | null;
  /** @deprecated Soft-removed in Phase A; still returned for legacy round-trip. */
  currentPhase: CurrentPhase | null;
  delayReason: string | null;
  deptStuckAt: string | null;
  scheduledProgressPct: number | null;
  agreementNumber: string | null;
  agreementDate: string | null;
  appointedDate: string | null;
  contractValueCr: number | null;
  mobAdvanceIssuedCr: number | null;
  mobAdvanceRecoveredCr: number | null;
  advanceOutstandingCr: number | null;
  retentionMoneyHeldCr: number | null;
  pbgNumber: string | null;
  pbgAmountCr: number | null;
  pbgIssuingBank: string | null;
  emdAmountCr: number | null;
  emdRefNumber: string | null;
  emdDate: string | null;
  totalPaymentsCr: number | null;
  lastPaymentDate: string | null;
  lastRaBillNo: string | null;
  omAgency: string | null;
  omRemarks: string | null;
  mprMonth: string | null;
  fundReceivedCr: number | null;
  expenditureCentralRaw: string | null;
  expenditureStateRaw: string | null;
  manpowerEngagedRaw: string | null;
  mainComponentScope: string | null;
  progressPrevMonthRaw: string | null;
  progressThisMonthRaw: string | null;
  mprRemark: string | null;
}

export interface ProjectUpsertPayload {
  projectName?: string;
  sectorId?: number | null;
  city?: string | null;
  districtId?: number | null;
  divisionId?: number | null;
  contractor?: string | null;
  pd?: string | null;
  mainWork?: string | null;
  physicalWorkProgressNote?: string | null;
  /** @deprecated Soft-removed in Phase A; forms no longer send it. */
  projectStage?: ProjectStage | null;
  projectStageV2?: ProjectStageV2 | null;
  tenderSubStage?: TenderSubStage | null;
  contractType?: ContractType | null;
  /** @deprecated Soft-removed in Phase A; forms no longer send it. */
  workType?: WorkType | null;
  sponsoringDept?: string | null;
  implementingAgency?: string | null;
  sanctionDate?: string | null;
  projectBrief?: string | null;
  /** @deprecated Soft-removed in Phase A; forms no longer send it. */
  currentPhase?: CurrentPhase | null;
  status?: ProjectStatus;
  plannedEndDate?: string | null;
  revisedEndDate?: string | null;
  delayReason?: string | null;
  deptStuckAt?: string | null;
  expectedCompletionDate?: string | null;
  expectedCompletionRaw?: string | null;
  priority?: Priority | null;
  sanctionedCostCr?: number | null;
  aaAmountCr?: number | null;
  revisedAaAmountCr?: number | null;
  agreementAmountCr?: number | null;
  physicalProgressPct?: number | null;
  financialProgressCr?: number | null;
  financialProgressPct?: number | null;
  scheduledProgressPct?: number | null;
  agreementNumber?: string | null;
  agreementDate?: string | null;
  appointedDate?: string | null;
  contractValueCr?: number | null;
  mobAdvanceIssuedCr?: number | null;
  mobAdvanceRecoveredCr?: number | null;
  advanceOutstandingCr?: number | null;
  retentionMoneyHeldCr?: number | null;
  pbgNumber?: string | null;
  pbgAmountCr?: number | null;
  pbgExpiryDate?: string | null;
  pbgIssuingBank?: string | null;
  emdAmountCr?: number | null;
  emdRefNumber?: string | null;
  emdDate?: string | null;
  totalPaymentsCr?: number | null;
  lastPaymentDate?: string | null;
  lastRaBillNo?: string | null;
  geoTaggingUrl?: string | null;
  remark?: string | null;
  omApplicable?: boolean;
  omStartDate?: string | null;
  omPeriodMonths?: number | null;
  omEndDate?: string | null;
  omAgency?: string | null;
  omStatusOverride?: OmStatusOverride | null;
  omRemarks?: string | null;
  mprMonth?: string | null;
  fundReceivedCr?: number | null;
  expenditureCentralRaw?: string | null;
  expenditureStateRaw?: string | null;
  manpowerEngagedRaw?: string | null;
  mainComponentScope?: string | null;
  progressPrevMonthRaw?: string | null;
  progressThisMonthRaw?: string | null;
  mprRemark?: string | null;
  schemes?: number[];
}

/* -------- Nested resources -------- */

export interface CosEotItem {
  cosId: number;
  projectId: string;
  cosNumber: string | null;
  cosDate: string | null;
  category: CosCategory | null;
  cosAmountCr: number | null;
  variationPct: number | null;
  eotNumber: string | null;
  eotDaysGranted: number | null;
  timeLinked: boolean | null;
  originalEndDate: string | null;
  newEndDate: string | null;
  revisedDate: string | null;
}

export interface CosEotUpsertPayload {
  cosNumber?: string | null;
  cosDate?: string | null;
  category?: CosCategory | null;
  cosAmountCr?: number | null;
  variationPct?: number | null;
  eotNumber?: string | null;
  eotDaysGranted?: number | null;
  timeLinked?: boolean;
  originalEndDate?: string | null;
  newEndDate?: string | null;
  revisedDate?: string | null;
}

export interface MgmtActionItem {
  itemId: number;
  projectId: string;
  topic: string;
  status: OpenClosedStatus;
  deadlineDate: string | null;
  createdAt: string;
}

export interface MgmtActionUpsertPayload {
  topic?: string;
  status?: OpenClosedStatus;
  deadlineDate?: string | null;
}

export interface MilestoneItem {
  milestoneId: number;
  projectId: string;
  milestoneName: string;
  weightPct: number | null;
  plannedDate: string | null;
  sortOrder: number | null;
}

export interface ReplaceMilestonesPayload {
  milestones: Array<{
    milestoneId?: number;
    milestoneName: string;
    weightPct: number;
    plannedDate?: string | null;
    sortOrder?: number;
  }>;
}

export interface MonthlyProgressPayload {
  snapMonth: string;
  entries: Array<{
    milestoneId: number;
    progressPct: number;
    note?: string | null;
  }>;
}

export interface MonthlyProgressItem {
  mpId: number;
  milestoneId: number;
  projectId: string;
  snapMonth: string;
  progressPct: number | null;
  weightedContribution: number | null;
  note: string | null;
}

export interface PhysicalHistoryPoint {
  snapMonth: string;
  weightedPhysicalPct: number | null;
}

export interface MilestoneHistoryPoint {
  milestoneId: number;
  milestoneName: string;
  weightPct: number | null;
  snapMonth: string;
  progressPct: number | null;
  weightedContribution: number | null;
}

export interface MoM {
  momId: number;
  meetingDate: string;
  meetingTitle: string;
  venue: string | null;
  chairperson: string | null;
  attendees: string | null;
  projectId: string | null;
  agenda: string | null;
  decisions: string | null;
  momStatus: MomStatus;
  remarks: string | null;
  createdAt: string;
}

export interface MoMActionPoint {
  actionId: number;
  momId: number;
  description: string;
  owner: string | null;
  dueDate: string | null;
  status: OpenClosedStatus;
  resolutionDate: string | null;
}

export interface MoMDetail extends MoM {
  actionPoints: MoMActionPoint[];
}

export interface MoMUpsertPayload {
  meetingDate?: string;
  meetingTitle?: string;
  venue?: string | null;
  chairperson?: string | null;
  attendees?: string | null;
  projectId?: string | null;
  agenda?: string | null;
  decisions?: string | null;
  momStatus?: MomStatus;
  remarks?: string | null;
}

export interface MoMActionPointUpsertPayload {
  description?: string;
  owner?: string | null;
  dueDate?: string | null;
  status?: OpenClosedStatus;
  resolutionDate?: string | null;
}

export interface PreMonsoonItem {
  itemId: number;
  topic: string;
  priority: Priority | null;
  deadlineDate: string | null;
  createdAt: string;
}

export interface PreMonsoonUpsertPayload {
  topic?: string;
  priority?: Priority | null;
  deadlineDate?: string | null;
}

export interface FundsUcEntry {
  fundsUcId: number;
  projectId: string;
  fundingSource: FundingSource;
  openingBalanceCr: number;
  grantReceivedCr: number;
  expenditureIncurredCr: number;
  /** Only meaningful when fundingSource is 'Central - State Share'. */
  centralShareCr: number | null;
  stateShareCr: number | null;
  sanctionNo: string | null;
  ucSubmittedDate: string | null;
  remarks: string | null;
  createdAt: string;
  lastUpdated: string | null;
}

export interface FundsUcCreatePayload {
  projectId: string;
  fundingSource: FundingSource;
  openingBalanceCr?: number;
  grantReceivedCr?: number;
  expenditureIncurredCr?: number;
  centralShareCr?: number | null;
  stateShareCr?: number | null;
  sanctionNo?: string | null;
  ucSubmittedDate?: string | null;
  remarks?: string | null;
}

export type FundsUcUpdatePayload = Partial<Omit<FundsUcCreatePayload, 'projectId'>>;

export interface GeoPhoto {
  photoId: number;
  projectId: string;
  url: string;
  caption: string | null;
  photoDate: string | null;
  sourceType: GeoPhotoSourceType | null;
  fileName: string | null;
}

export interface GeoPhotoUrlCreatePayload {
  url: string;
  caption?: string | null;
  photoDate?: string | null;
}

export interface GeoPhotoUpdatePayload {
  caption?: string | null;
  photoDate?: string | null;
}

/* -------- User management + audit -------- */

export interface UserRow {
  userId: number;
  username: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean | null;
  canCreateProjects: boolean;
  canUpdateProjects: boolean;
  canDeleteProjects: boolean;
  canViewProjects: boolean;
  /** Assigned division IDs; PDs must have ≥ 1, empty for other roles. */
  divisions: number[];
  createdBy: number | null;
  createdAt: string | null;
  lastLogin: string | null;
  /** Forgot-password OTP delivery targets. */
  email: string | null;
  mobileNumber: string | null;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  role: UserRole;
  fullName?: string | null;
  canCreateProjects?: boolean;
  canUpdateProjects?: boolean;
  canDeleteProjects?: boolean;
  canViewProjects?: boolean;
  divisions?: number[];
  email?: string | null;
  mobileNumber?: string | null;
}

export interface UpdateUserPayload {
  fullName?: string | null;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
  canCreateProjects?: boolean;
  canUpdateProjects?: boolean;
  canDeleteProjects?: boolean;
  canViewProjects?: boolean;
  divisions?: number[];
  email?: string | null;
  mobileNumber?: string | null;
}

export interface AuditChange {
  changeId: number;
  auditId: number;
  fieldKey: string;
  fieldLabel: string | null;
  beforeValue: string | null;
  afterValue: string | null;
}

export interface AuditItem {
  auditId: number;
  projectId: string | null;
  projectNameSnapshot: string | null;
  userId: number | null;
  userLabel: string;
  roleLabel: string | null;
  action: AuditAction;
  changedAt: string;
  changes: AuditChange[];
}

/* -------- Pagination envelopes -------- */

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OffsetPage<T> {
  items: T[];
  nextOffset: number | null;
}

export interface ItemsResponse<T> {
  items: T[];
}

/* -------- Error envelope -------- */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
