/**
 * Project-detail field catalog for the MD Portfolio Briefing panel (per
 * Enhance MD Portfolio Briefing spec §3). Shared by MdSchemeSummaryModal.tsx
 * (the Fields picker + on-screen rendering) and mdProjectExport.ts (PDF/PPTX
 * export) — kept in its own module so neither has to import the other.
 *
 * The 12 CORE fields are rendered in this exact order at the top when
 * visible. Additional fields render below in group order.
 */
export type ProjectFieldKey =
  // Core (default ON) — order matters
  | 'nameOfWork' | 'agreementNumber' | 'agreementDate' | 'agreementAmount'
  | 'expectedCompletion' | 'physicalProgress' | 'financialProgress' | 'expenditureTillDate'
  | 'geotagPhotographs' | 'issuesRemarks' | 'agencyContractor' | 'pdName'
  // Extras (default OFF)
  | 'city' | 'district' | 'division' | 'region' | 'sector' | 'schemes' | 'projectStageV2' | 'contractType'
  | 'status' | 'priority'
  | 'sponsoringDept' | 'implementingAgency' | 'sanctionDate'
  | 'plannedEndDate' | 'revisedEndDate' | 'scheduledProgressPct'
  | 'delayReason' | 'deptStuckAt'
  | 'aaAmount' | 'revisedAaAmount' | 'contractValueCr'
  | 'mobAdvanceIssuedCr' | 'mobAdvanceRecoveredCr' | 'advanceOutstandingCr' | 'retentionMoneyHeldCr'
  | 'totalPaymentsCr' | 'lastPaymentDate' | 'lastRaBillNo'
  | 'pbgNumber' | 'pbgAmountCr' | 'pbgIssuingBank' | 'pbgExpiryDate'
  | 'emdAmountCr' | 'emdRefNumber' | 'emdDate'
  | 'omStartDate' | 'omEndDate' | 'omPeriodMonths' | 'omAgency' | 'omRemarks'
  | 'fundsUcSource' | 'fundsUcCentralShare' | 'fundsUcStateShare' | 'fundsUcOpeningBalance'
  | 'fundsUcGrantReceived' | 'fundsUcExpenditure' | 'fundsUcClosingBalance'
  | 'fundsUcSanctionNo' | 'fundsUcSubmittedDate' | 'fundsUcStatus'
  | 'projectBrief' | 'mainComponentScope';

export interface ProjectFieldDef { key: ProjectFieldKey; label: string; defaultOn: boolean }
export interface ProjectFieldGroup { group: string; fields: ProjectFieldDef[] }

export const PROJECT_FIELD_GROUPS: ProjectFieldGroup[] = [
  {
    group: 'Core',
    fields: [
      { key: 'nameOfWork',          label: 'Name of Work',                defaultOn: true },
      { key: 'agreementNumber',     label: 'Agreement Number',            defaultOn: true },
      { key: 'agreementDate',       label: 'Agreement Date',              defaultOn: true },
      { key: 'agreementAmount',     label: 'Agreement Amount',            defaultOn: true },
      { key: 'expectedCompletion',  label: 'Expected Date of Completion', defaultOn: true },
      { key: 'physicalProgress',    label: 'Physical Progress',           defaultOn: true },
      { key: 'financialProgress',   label: 'Financial Progress',          defaultOn: true },
      { key: 'expenditureTillDate', label: 'Expenditure Till Date',       defaultOn: true },
      { key: 'geotagPhotographs',   label: 'Geotag Photographs',          defaultOn: true },
      { key: 'issuesRemarks',       label: 'Issues and Remarks',          defaultOn: true },
      { key: 'agencyContractor',    label: 'Name of Agency / Contractor', defaultOn: true },
      { key: 'pdName',              label: 'Name of PD',                  defaultOn: true },
    ],
  },
  {
    group: 'Classification',
    fields: [
      { key: 'city',           label: 'City',           defaultOn: false },
      { key: 'district',       label: 'District',       defaultOn: false },
      { key: 'division',       label: 'Division',       defaultOn: false },
      { key: 'region',         label: 'Region',         defaultOn: false },
      { key: 'sector',         label: 'Sector',         defaultOn: false },
      { key: 'schemes',        label: 'Scheme(s)',      defaultOn: false },
      { key: 'projectStageV2', label: 'Project Stage',    defaultOn: false },
      { key: 'contractType',   label: 'Contract Type',    defaultOn: false },
      { key: 'status',         label: 'Execution Status', defaultOn: false },
      { key: 'priority',       label: 'Priority',         defaultOn: false },
    ],
  },
  {
    group: 'Sponsoring & Dates',
    fields: [
      { key: 'sponsoringDept',       label: 'Sponsoring Department', defaultOn: false },
      { key: 'implementingAgency',   label: 'Implementing Agency',   defaultOn: false },
      { key: 'sanctionDate',         label: 'Sanction Date',         defaultOn: false },
      { key: 'plannedEndDate',       label: 'Planned End Date',      defaultOn: false },
      { key: 'revisedEndDate',       label: 'Revised End Date',      defaultOn: false },
      { key: 'scheduledProgressPct', label: 'Scheduled Progress %',  defaultOn: false },
      { key: 'delayReason',          label: 'Delay Reason',          defaultOn: false },
      { key: 'deptStuckAt',          label: 'Department Stuck At',   defaultOn: false },
    ],
  },
  {
    group: 'Contract & Financial',
    fields: [
      { key: 'aaAmount',              label: 'AA Amount',             defaultOn: false },
      { key: 'revisedAaAmount',       label: 'Revised AA Amount',     defaultOn: false },
      { key: 'contractValueCr',       label: 'Contract Value',        defaultOn: false },
      { key: 'mobAdvanceIssuedCr',    label: 'Mob. Advance Issued',   defaultOn: false },
      { key: 'mobAdvanceRecoveredCr', label: 'Mob. Advance Recovered', defaultOn: false },
      { key: 'advanceOutstandingCr',  label: 'Advance Outstanding',   defaultOn: false },
      { key: 'retentionMoneyHeldCr',  label: 'Retention Held',        defaultOn: false },
      { key: 'totalPaymentsCr',       label: 'Total Payments',        defaultOn: false },
      { key: 'lastPaymentDate',       label: 'Last Payment Date',     defaultOn: false },
      { key: 'lastRaBillNo',          label: 'Last RA Bill No.',       defaultOn: false },
    ],
  },
  {
    group: 'Security & Guarantees',
    fields: [
      { key: 'pbgNumber',      label: 'PBG Number',       defaultOn: false },
      { key: 'pbgAmountCr',    label: 'PBG Amount',       defaultOn: false },
      { key: 'pbgIssuingBank', label: 'PBG Issuing Bank', defaultOn: false },
      { key: 'pbgExpiryDate',  label: 'PBG Expiry Date',  defaultOn: false },
      { key: 'emdAmountCr',    label: 'EMD Amount',       defaultOn: false },
      { key: 'emdRefNumber',   label: 'EMD Reference',    defaultOn: false },
      { key: 'emdDate',        label: 'EMD Date',         defaultOn: false },
    ],
  },
  {
    group: 'O&M',
    fields: [
      { key: 'omStartDate',    label: 'O&M Start Date',      defaultOn: false },
      { key: 'omEndDate',      label: 'O&M End Date',        defaultOn: false },
      { key: 'omPeriodMonths', label: 'O&M Period (months)', defaultOn: false },
      { key: 'omAgency',       label: 'O&M Agency',          defaultOn: false },
      { key: 'omRemarks',      label: 'O&M Remarks',         defaultOn: false },
    ],
  },
  {
    // Default ON (unlike the other extras groups) so UC Funds is visible the
    // moment a project is opened from MD Portfolio, matching the Project
    // Details page and Project Profile modal, which show it unconditionally.
    group: 'Funding Source & UC',
    fields: [
      { key: 'fundsUcSource',         label: 'Funding Source',       defaultOn: true },
      { key: 'fundsUcCentralShare',   label: 'Central Share',        defaultOn: true },
      { key: 'fundsUcStateShare',     label: 'State Share',          defaultOn: true },
      { key: 'fundsUcOpeningBalance', label: 'Opening Balance',      defaultOn: true },
      { key: 'fundsUcGrantReceived',  label: 'Grant Received',       defaultOn: true },
      { key: 'fundsUcExpenditure',    label: 'Expenditure Incurred', defaultOn: true },
      { key: 'fundsUcClosingBalance', label: 'Closing Balance',      defaultOn: true },
      { key: 'fundsUcSanctionNo',     label: 'Sanction No.',         defaultOn: true },
      { key: 'fundsUcSubmittedDate',  label: 'UC Submitted Date',    defaultOn: true },
      { key: 'fundsUcStatus',         label: 'UC Status',            defaultOn: true },
    ],
  },
  {
    group: 'Notes',
    fields: [
      { key: 'projectBrief',       label: 'Project Brief',          defaultOn: false },
      { key: 'mainComponentScope', label: 'Main Component / Scope', defaultOn: false },
    ],
  },
];

export const ALL_PROJECT_KEYS = PROJECT_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
export const DEFAULT_PROJECT_VIS = Object.fromEntries(
  PROJECT_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f.defaultOn])),
) as Record<ProjectFieldKey, boolean>;
/** Fixed render order: 12 core fields as specified, then extras in group order. */
export const PROJECT_FIELD_ORDER: ProjectFieldKey[] = ALL_PROJECT_KEYS;
