/**
 * Human-readable field labels for the audit trail viewer.
 *
 * Keys are the TS field names emitted by `diffFields` (camelCase, and
 * a handful of synthetic markers like `table`, `schemes`, `entries`).
 * Values are the strings shown to end users in the audit UI.
 *
 * Each entity also exports a pre-bound helper (`diffProject`, `diffCosEot`,
 * ...) so services can call `diffProject(before, after)` and get the
 * label map applied automatically — the label bookkeeping stays local
 * to this file.
 */

import { diffFields, type AuditChange } from './audit.js';

type Row = Record<string, unknown>;

export const PROJECT_LABELS: Record<string, string> = {
  projectName: 'Project name',
  sectorId: 'Sector',
  city: 'City',
  districtId: 'District',
  divisionId: 'Division',
  contractor: 'Contractor',
  pd: 'PD',
  mainWork: 'Main work',
  physicalWorkProgressNote: 'Physical work progress note',
  projectStage: 'Project stage (legacy)',
  workType: 'Work type (legacy)',
  contractType: 'Contract type',
  sponsoringDept: 'Sponsoring department',
  implementingAgency: 'Implementing agency',
  sanctionDate: 'Sanction date',
  projectBrief: 'Project brief',
  currentPhase: 'Current phase (legacy)',
  status: 'Execution status',
  projectStageV2: 'Project stage',
  tenderSubStage: 'Tender sub-stage',
  nitNumber: 'NIT number',
  nitDate: 'NIT date',
  plannedEndDate: 'Planned end date',
  revisedEndDate: 'Revised end date',
  delayReason: 'Delay reason',
  deptStuckAt: 'Department stuck at',
  expectedCompletionDate: 'Expected completion date',
  expectedCompletionRaw: 'Expected completion (raw)',
  priority: 'Priority',
  sanctionedCostCr: 'Sanctioned cost (₹ Cr)',
  aaAmountCr: 'AA amount (₹ Cr)',
  revisedAaAmountCr: 'Revised AA amount (₹ Cr)',
  agreementAmountCr: 'Agreement amount (₹ Cr)',
  physicalProgressPct: 'Physical progress (%)',
  financialProgressCr: 'Financial progress (₹ Cr)',
  financialProgressPct: 'Financial progress (%)',
  scheduledProgressPct: 'Scheduled progress (%)',
  agreementNumber: 'Agreement number',
  agreementDate: 'Agreement date',
  appointedDate: 'Appointed date',
  contractValueCr: 'Contract value (₹ Cr)',
  mobAdvanceIssuedCr: 'Mobilisation advance issued (₹ Cr)',
  mobAdvanceRecoveredCr: 'Mobilisation advance recovered (₹ Cr)',
  advanceOutstandingCr: 'Advance outstanding (₹ Cr)',
  retentionMoneyHeldCr: 'Retention money held (₹ Cr)',
  pbgNumber: 'PBG number',
  pbgAmountCr: 'PBG amount (₹ Cr)',
  pbgExpiryDate: 'PBG expiry date',
  pbgIssuingBank: 'PBG issuing bank',
  emdAmountCr: 'EMD amount (₹ Cr)',
  emdRefNumber: 'EMD reference number',
  emdDate: 'EMD date',
  totalPaymentsCr: 'Total payments (₹ Cr)',
  lastPaymentDate: 'Last payment date',
  lastRaBillNo: 'Last RA bill number',
  geoTaggingUrl: 'GeoTagging URL',
  remark: 'Remark',
  omApplicable: 'O&M applicable',
  omStartDate: 'O&M start date',
  omPeriodMonths: 'O&M period (months)',
  omEndDate: 'O&M end date',
  omAgency: 'O&M agency',
  omStatusOverride: 'O&M status override',
  omRemarks: 'O&M remarks',
  mprMonth: 'MPR month',
  fundReceivedCr: 'Fund received (₹ Cr)',
  expenditureCentralRaw: 'Expenditure — central (raw)',
  expenditureStateRaw: 'Expenditure — state (raw)',
  manpowerEngagedRaw: 'Manpower engaged (raw)',
  mainComponentScope: 'Main component scope',
  progressPrevMonthRaw: 'Progress previous month (raw)',
  progressThisMonthRaw: 'Progress this month (raw)',
  mprRemark: 'MPR remark',
  projectId: 'Project ID',
  schemes: 'Schemes',
  table: 'Table',
};

export const COS_EOT_LABELS: Record<string, string> = {
  cosNumber: 'CoS number',
  cosDate: 'CoS date',
  category: 'Category',
  cosAmountCr: 'CoS amount (₹ Cr)',
  variationPct: 'Variation (%)',
  eotNumber: 'EoT number',
  eotDaysGranted: 'EoT days granted',
  timeLinked: 'Time-linked',
  originalEndDate: 'Original end date',
  newEndDate: 'New end date',
  revisedDate: 'Revised date',
  projectId: 'Project ID',
  cosId: 'CoS ID',
  table: 'Table',
};

export const MGMT_ACTION_LABELS: Record<string, string> = {
  topic: 'Topic',
  status: 'Status',
  deadlineDate: 'Deadline date',
  projectId: 'Project ID',
  itemId: 'Item ID',
  table: 'Table',
};

export const MILESTONE_SET_LABELS: Record<string, string> = {
  milestones: 'Milestone set',
  table: 'Table',
};

export const MILESTONE_PROGRESS_LABELS: Record<string, string> = {
  snapMonth: 'Reporting month',
  entries: 'Progress entries',
  table: 'Table',
};

export const MOM_LABELS: Record<string, string> = {
  meetingDate: 'Meeting date',
  meetingTitle: 'Title',
  venue: 'Venue',
  chairperson: 'Chairperson',
  attendees: 'Attendees',
  projectId: 'Project',
  agenda: 'Agenda',
  decisions: 'Decisions',
  momStatus: 'MoM status',
  remarks: 'Remarks',
  momId: 'MoM ID',
  table: 'Table',
};

export const MOM_ACTION_LABELS: Record<string, string> = {
  description: 'Description',
  owner: 'Owner',
  dueDate: 'Due date',
  status: 'Status',
  resolutionDate: 'Resolution date',
  momId: 'MoM ID',
  actionId: 'Action ID',
  table: 'Table',
};

export const PRE_MONSOON_LABELS: Record<string, string> = {
  topic: 'Topic',
  priority: 'Priority',
  deadlineDate: 'Deadline date',
  itemId: 'Item ID',
  table: 'Table',
};

export const FUNDS_UC_LABELS: Record<string, string> = {
  projectId: 'Project ID',
  fundingSource: 'Funding source',
  openingBalanceCr: 'Opening balance (₹ Cr)',
  grantReceivedCr: 'Grant received (₹ Cr)',
  expenditureIncurredCr: 'Expenditure incurred (₹ Cr)',
  sanctionNo: 'Sanction no.',
  ucSubmittedDate: 'UC submitted date',
  remarks: 'Remarks',
  fundsUcId: 'Funds & UC ID',
  table: 'Table',
};

export const GEO_PHOTO_LABELS: Record<string, string> = {
  url: 'URL',
  caption: 'Caption',
  photoDate: 'Photo date',
  sourceType: 'Source type',
  fileName: 'File name',
  projectId: 'Project ID',
  photoId: 'Photo ID',
  table: 'Table',
};

export const APP_USER_LABELS: Record<string, string> = {
  username: 'Username',
  fullName: 'Full name',
  role: 'Role',
  isActive: 'Active',
  passwordChanged: 'Password',
  canCreateProjects: 'Can create projects',
  canUpdateProjects: 'Can update projects',
  canDeleteProjects: 'Can delete projects',
  canViewProjects: 'Can view projects',
  divisions: 'Assigned divisions',
  createdBy: 'Created by',
  userId: 'User ID',
  email: 'Email',
  mobileNumber: 'Mobile number',
  table: 'Table',
};

export const PASSWORD_RESET_REQUEST_LABELS: Record<string, string> = {
  requestId: 'Request ID',
  userId: 'Requesting user ID',
  role: 'Requester role',
  channel: 'OTP channel',
  status: 'Status',
  approverId: 'Approver ID',
  approverRole: 'Approver role',
  decisionNote: 'Decision note',
  table: 'Table',
};

/* Pre-bound helpers — each service imports the one it needs. */
export const diffProject = (b: Row, a: Row): AuditChange[] => diffFields(b, a, PROJECT_LABELS);
export const diffCosEot = (b: Row, a: Row): AuditChange[] => diffFields(b, a, COS_EOT_LABELS);
export const diffMgmtAction = (b: Row, a: Row): AuditChange[] => diffFields(b, a, MGMT_ACTION_LABELS);
export const diffMilestoneSet = (b: Row, a: Row): AuditChange[] => diffFields(b, a, MILESTONE_SET_LABELS);
export const diffMilestoneProgress = (b: Row, a: Row): AuditChange[] => diffFields(b, a, MILESTONE_PROGRESS_LABELS);
export const diffMom = (b: Row, a: Row): AuditChange[] => diffFields(b, a, MOM_LABELS);
export const diffMomAction = (b: Row, a: Row): AuditChange[] => diffFields(b, a, MOM_ACTION_LABELS);
export const diffPreMonsoon = (b: Row, a: Row): AuditChange[] => diffFields(b, a, PRE_MONSOON_LABELS);
export const diffFundsUc = (b: Row, a: Row): AuditChange[] => diffFields(b, a, FUNDS_UC_LABELS);
export const diffGeoPhoto = (b: Row, a: Row): AuditChange[] => diffFields(b, a, GEO_PHOTO_LABELS);
export const diffAppUser = (b: Row, a: Row): AuditChange[] => diffFields(b, a, APP_USER_LABELS);
export const diffPasswordResetRequest = (b: Row, a: Row): AuditChange[] =>
  diffFields(b, a, PASSWORD_RESET_REQUEST_LABELS);
