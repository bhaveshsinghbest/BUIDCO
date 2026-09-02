/**
 * Generates the "Project Register" Download Template (bhaveshTask.md Tasks
 * 5-7) — a single source of truth so the template, the Import Project
 * mapping (frontend/src/components/input-sheet/ImportProjectDialog.tsx),
 * and the Input Sheet form can't silently drift apart.
 *
 * Every column here corresponds 1:1 to a real Input Sheet field (verified
 * against BasicInfoSection / PhaseDatesSection / ProgressFinancialSection /
 * ContractSecuritySection / GeoTaggingSection / ActionRemarksSection /
 * OmDetailsSection / FundingSourceSection). Computed/auto fields (Delay
 * Days, Sanctioned Cost, Total CoS Count, Total EoT Days, Region — derived
 * from Division) are deliberately excluded — they're display-only, not
 * something a bulk import should set.
 *
 * Layout matches what ImportProjectDialog.tsx expects:
 *   Row 1 — section band (colour-coded, matches the Input Sheet's own tabs)
 *   Row 2 — column header (the text ImportProjectDialog matches against)
 *   Row 3 — type hint (Text / Number / Dropdown: X / Date / …)
 *   Row 4+ — data
 * Sheet name: "Project Register".
 *
 * Usage:  npm run gen:input-template
 * Output: frontend/src/assets/Template.xlsx (the file the Input Sheet's
 *         "Download Template" link actually serves).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { db, pool } from '../db/client.js';
import { division, scheme, sector } from '../db/schema.js';
import { fundingSources } from '../db/enums.js';

/* ============================================================
 * Column catalogue — one row per Input Sheet field, grouped and
 * ordered exactly like the Input Sheet's own sections.
 * ============================================================ */

type ColumnType = 'text' | 'number' | 'percent' | 'date' | 'enum' | 'lookup' | 'multi-lookup' | 'yesno';

interface ColumnSpec {
  section: string;
  header: string;
  key: string;
  type: ColumnType;
  required?: boolean;
  enumValues?: readonly string[];
  lookupSheet?: 'Divisions' | 'Sectors' | 'Schemes';
  note?: string;
  width?: number;
}

const PROJECT_STAGE_V2 = ['Conceptualisation', 'Design', 'Pre-Tender', 'Tender', 'Construction', 'O&M', 'Other'] as const;
const EXECUTION_STATUS = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Delayed'] as const;
const CONTRACT_TYPES = ['Work Contract', 'Service Contract', 'O&M Contract', 'Others'] as const;
const PRIORITY_ENUM = ['High', 'Medium', 'Low', 'N/A'] as const;
const OM_STATUS_ENUM = ['Not Started', 'Ongoing', 'Expiring Soon', 'Expired', 'Handed Over to ULB'] as const;
const YES_NO_ENUM = ['Yes', 'No'] as const;

const COLUMNS: ColumnSpec[] = [
  /* 01 · Basic Info (Fixed Input — MD/Admin only) */
  { section: '01 · Basic Info', header: 'Project Name', key: 'projectName', type: 'text', required: true, width: 40 },
  { section: '01 · Basic Info', header: 'Sector', key: 'sectorId', type: 'lookup', lookupSheet: 'Sectors', width: 20 },
  { section: '01 · Basic Info', header: 'City', key: 'city', type: 'text', width: 18 },
  { section: '01 · Basic Info', header: 'Division', key: 'divisionId', type: 'lookup', lookupSheet: 'Divisions', width: 20 },
  { section: '01 · Basic Info', header: 'Contractor', key: 'contractor', type: 'text', width: 28 },
  { section: '01 · Basic Info', header: 'PD', key: 'pd', type: 'text', width: 20 },
  { section: '01 · Basic Info', header: 'Scheme(s)', key: 'schemes', type: 'multi-lookup', lookupSheet: 'Schemes', note: 'Comma-separated scheme names, e.g. "AMRUT 1.0, Namami Gange".', width: 30 },
  { section: '01 · Basic Info', header: 'Main Work', key: 'mainWork', type: 'text', width: 36 },
  { section: '01 · Basic Info', header: 'Physical Work Progress', key: 'physicalWorkProgressNote', type: 'text', note: 'Descriptive note — use the % columns below for numeric progress.', width: 30 },
  { section: '01 · Basic Info', header: 'Contract Type', key: 'contractType', type: 'enum', enumValues: CONTRACT_TYPES, required: true, width: 18 },
  { section: '01 · Basic Info', header: 'Sponsoring Department', key: 'sponsoringDept', type: 'text', width: 24 },
  { section: '01 · Basic Info', header: 'Implementing Agency', key: 'implementingAgency', type: 'text', width: 24 },
  { section: '01 · Basic Info', header: 'Project Sanction Date', key: 'sanctionDate', type: 'date', width: 18 },
  { section: '01 · Basic Info', header: 'Project Brief', key: 'projectBrief', type: 'text', width: 40 },

  /* 02 · Phase & Dates */
  { section: '02 · Phase & Dates', header: 'Project Stage', key: 'projectStageV2', type: 'enum', enumValues: PROJECT_STAGE_V2, width: 18 },
  { section: '02 · Phase & Dates', header: 'Execution Status', key: 'status', type: 'enum', enumValues: EXECUTION_STATUS, note: 'Defaults to "Not Started" if left blank.', width: 16 },
  { section: '02 · Phase & Dates', header: 'Planned End Date', key: 'plannedEndDate', type: 'date', width: 18 },
  { section: '02 · Phase & Dates', header: 'Revised End Date', key: 'revisedEndDate', type: 'date', width: 18 },
  { section: '02 · Phase & Dates', header: 'Expected Completion (date)', key: 'expectedCompletionDate', type: 'date', width: 20 },
  { section: '02 · Phase & Dates', header: 'Delay Reason / Root Cause', key: 'delayReason', type: 'text', width: 32 },
  { section: '02 · Phase & Dates', header: 'Department / Agency Stuck At', key: 'deptStuckAt', type: 'text', width: 26 },

  /* 03 · Progress & Financial */
  { section: '03 · Progress & Financial', header: 'Physical Progress % (Actual)', key: 'physicalProgressPct', type: 'percent', width: 20 },
  { section: '03 · Progress & Financial', header: 'Physical Progress % (Scheduled)', key: 'scheduledProgressPct', type: 'percent', width: 22 },
  { section: '03 · Progress & Financial', header: 'Financial Progress %', key: 'financialProgressPct', type: 'percent', width: 18 },
  { section: '03 · Progress & Financial', header: 'AA Amount (Rs. Cr.)', key: 'aaAmountCr', type: 'number', width: 18 },
  { section: '03 · Progress & Financial', header: 'Revised AA Amount (Rs. Cr.)', key: 'revisedAaAmountCr', type: 'number', width: 20 },
  { section: '03 · Progress & Financial', header: 'Agreement Amount (Rs. Cr.)', key: 'agreementAmountCr', type: 'number', width: 20 },
  { section: '03 · Progress & Financial', header: 'Financial Progress (Rs. Cr.)', key: 'financialProgressCr', type: 'number', width: 20 },
  { section: '03 · Progress & Financial', header: 'MPR Month', key: 'mprMonth', type: 'text', note: 'e.g. "Jun 2026". Optional — Monthly Progress Report block.', width: 16 },
  { section: '03 · Progress & Financial', header: 'Fund Received (Rs. Cr.)', key: 'fundReceivedCr', type: 'number', width: 18 },
  { section: '03 · Progress & Financial', header: 'Expenditure — Central Share (raw)', key: 'expenditureCentralRaw', type: 'text', width: 24 },
  { section: '03 · Progress & Financial', header: 'Expenditure — State Share (raw)', key: 'expenditureStateRaw', type: 'text', width: 24 },
  { section: '03 · Progress & Financial', header: 'Manpower Engaged', key: 'manpowerEngagedRaw', type: 'text', width: 18 },
  { section: '03 · Progress & Financial', header: 'Main Component (with scope)', key: 'mainComponentScope', type: 'text', width: 30 },
  { section: '03 · Progress & Financial', header: 'Progress — Up to Previous Month', key: 'progressPrevMonthRaw', type: 'text', width: 24 },
  { section: '03 · Progress & Financial', header: 'Progress — During This Month', key: 'progressThisMonthRaw', type: 'text', width: 24 },
  { section: '03 · Progress & Financial', header: 'MPR Remarks', key: 'mprRemark', type: 'text', width: 30 },

  /* 05 · Contract & Financial Security (Fixed Input — MD/Admin only) */
  { section: '05 · Contract & Financial Security', header: 'Agreement Number', key: 'agreementNumber', type: 'text', width: 20 },
  { section: '05 · Contract & Financial Security', header: 'Agreement Date', key: 'agreementDate', type: 'date', width: 16 },
  { section: '05 · Contract & Financial Security', header: 'Appointed Date', key: 'appointedDate', type: 'date', width: 16 },
  { section: '05 · Contract & Financial Security', header: 'Contract Value (Rs. Cr.)', key: 'contractValueCr', type: 'number', width: 20 },
  { section: '05 · Contract & Financial Security', header: 'Mobilisation Advance Issued (Rs. Cr.)', key: 'mobAdvanceIssuedCr', type: 'number', width: 24 },
  { section: '05 · Contract & Financial Security', header: 'Mob. Advance Recovered (Rs. Cr.)', key: 'mobAdvanceRecoveredCr', type: 'number', width: 24 },
  { section: '05 · Contract & Financial Security', header: 'Advance Outstanding (Rs. Cr.)', key: 'advanceOutstandingCr', type: 'number', width: 22 },
  { section: '05 · Contract & Financial Security', header: 'Retention Money Held (Rs. Cr.)', key: 'retentionMoneyHeldCr', type: 'number', width: 22 },
  { section: '05 · Contract & Financial Security', header: 'PBG Number', key: 'pbgNumber', type: 'text', width: 18 },
  { section: '05 · Contract & Financial Security', header: 'PBG Amount (Rs. Cr.)', key: 'pbgAmountCr', type: 'number', width: 18 },
  { section: '05 · Contract & Financial Security', header: 'PBG Expiry Date', key: 'pbgExpiryDate', type: 'date', width: 16 },
  { section: '05 · Contract & Financial Security', header: 'PBG Issuing Bank', key: 'pbgIssuingBank', type: 'text', width: 22 },
  { section: '05 · Contract & Financial Security', header: 'EMD Amount (Rs. Cr.)', key: 'emdAmountCr', type: 'number', width: 18 },
  { section: '05 · Contract & Financial Security', header: 'EMD Reference Number', key: 'emdRefNumber', type: 'text', width: 20 },
  { section: '05 · Contract & Financial Security', header: 'EMD Date', key: 'emdDate', type: 'date', width: 16 },
  { section: '05 · Contract & Financial Security', header: 'Total Payments Made (Rs. Cr.)', key: 'totalPaymentsCr', type: 'number', width: 22 },
  { section: '05 · Contract & Financial Security', header: 'Last Payment Date', key: 'lastPaymentDate', type: 'date', width: 16 },
  { section: '05 · Contract & Financial Security', header: 'Last RA Bill No.', key: 'lastRaBillNo', type: 'text', width: 18 },

  /* 06 · GeoTagging */
  { section: '06 · GeoTagging', header: 'Geo-Tagging URL (overview link)', key: 'geoTaggingUrl', type: 'text', note: 'Full https:// URL. Site photos are added from the Input Sheet directly (upload or link) — see the GeoTagging Photos Log sheet.', width: 34 },

  /* 07 · Action & Remarks */
  { section: '07 · Action & Remarks', header: 'Priority', key: 'priority', type: 'enum', enumValues: PRIORITY_ENUM, width: 12 },
  { section: '07 · Action & Remarks', header: 'Gap / Remark', key: 'remark', type: 'text', note: 'Fill only if there is an outstanding gap; blank means "no gap".', width: 34 },

  /* 08 · O&M */
  { section: '08 · O&M', header: 'O&M Applicable', key: 'omApplicable', type: 'yesno', width: 14 },
  { section: '08 · O&M', header: 'O&M Start Date', key: 'omStartDate', type: 'date', width: 16 },
  { section: '08 · O&M', header: 'Total O&M Period (Months)', key: 'omPeriodMonths', type: 'number', width: 20 },
  { section: '08 · O&M', header: 'O&M End Date (override)', key: 'omEndDate', type: 'date', note: 'Leave blank to auto-calculate from Start Date + Period.', width: 20 },
  { section: '08 · O&M', header: 'O&M Agency / Contractor', key: 'omAgency', type: 'text', width: 24 },
  { section: '08 · O&M', header: 'O&M Status (Manual Override)', key: 'omStatusOverride', type: 'enum', enumValues: OM_STATUS_ENUM, width: 22 },
  { section: '08 · O&M', header: 'O&M Remarks', key: 'omRemarks', type: 'text', width: 30 },

  /* 09 · Funding Source of the Project */
  { section: '09 · Funding Source', header: 'Funding Source of the Project', key: 'fundingSource', type: 'enum', enumValues: fundingSources, width: 26 },
  { section: '09 · Funding Source', header: 'Opening Balance (Rs. Cr.)', key: 'openingBalanceCr', type: 'number', width: 20 },
  { section: '09 · Funding Source', header: 'Grant Received (Rs. Cr.)', key: 'grantReceivedCr', type: 'number', width: 20 },
  { section: '09 · Funding Source', header: 'Expenditure Incurred (Rs. Cr.)', key: 'expenditureIncurredCr', type: 'number', width: 22 },
  { section: '09 · Funding Source', header: 'Central Share (%)', key: 'centralSharePct', type: 'percent', note: 'Only when Funding Source = "Central - State Share". Central % + State % must not exceed 100.', width: 18 },
  { section: '09 · Funding Source', header: 'State Share (%)', key: 'stateSharePct', type: 'percent', note: 'Only when Funding Source = "Central - State Share". Central % + State % must not exceed 100.', width: 18 },
];

const SECTION_COLOR: Record<string, string> = {
  '01 · Basic Info': 'FF1E3A5F',
  '02 · Phase & Dates': 'FF2563EB',
  '03 · Progress & Financial': 'FF15803D',
  '05 · Contract & Financial Security': 'FFB45309',
  '06 · GeoTagging': 'FF0EA5E9',
  '07 · Action & Remarks': 'FFB91C1C',
  '08 · O&M': 'FF6B7280',
  '09 · Funding Source': 'FF7C3AED',
};

/* ============================================================
 * Shared styling — matches the app's existing template look.
 * ============================================================ */

const sectionFont = { bold: true, color: { argb: 'FFFFFFFF' }, family: 2, size: 12, name: 'Arial' } as const;
const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' }, bgColor: { argb: 'FFD1D5DB' } } as const;
const headerFont = { bold: true, color: { argb: 'FF1E3A5F' }, family: 2, size: 9, name: 'Arial' } as const;
const requiredHeaderFont = { ...headerFont, color: { argb: 'FFB91C1C' } };
const hintFont = { italic: true, color: { argb: 'FF6B7280' }, family: 2, size: 8, name: 'Arial' } as const;
const centerMiddleWrap = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
const centerMiddle = { horizontal: 'center' as const, vertical: 'middle' as const };
const thinBorder = {
  left: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
  top: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
};

interface DataValidation {
  type: 'list' | 'decimal' | 'date';
  allowBlank?: boolean;
  operator?: string;
  formulae?: unknown[];
  showErrorMessage?: boolean;
  errorTitle?: string;
  error?: string;
}
interface WorksheetWithValidations {
  dataValidations: { add: (range: string, opts: DataValidation) => void };
}
function addValidation(ws: ExcelJS.Worksheet, range: string, opts: DataValidation): void {
  (ws as unknown as WorksheetWithValidations).dataValidations.add(range, opts);
}

function toColumnLetter(index: number): string {
  let n = index;
  let out = '';
  while (n >= 0) {
    out = String.fromCharCode((n % 26) + 65) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

const DATA_ROWS = 200; // rows 4..203 get dropdown validation primed

/* ============================================================
 * Sheet builders
 * ============================================================ */

interface Lookups {
  divisions: string[];
  sectors: string[];
  schemes: string[];
}

async function loadLookups(): Promise<Lookups> {
  const [divisions, sectors, schemes] = await Promise.all([
    db.select({ name: division.divisionName }).from(division).orderBy(division.divisionName),
    db.select({ name: sector.sectorName }).from(sector).orderBy(sector.sectorName),
    db.select({ name: scheme.schemeName }).from(scheme).orderBy(scheme.schemeName),
  ]);
  return {
    divisions: divisions.map((d) => d.name),
    sectors: sectors.map((s) => s.name),
    schemes: schemes.map((s) => s.name),
  };
}

function addLookupSheet(wb: ExcelJS.Workbook, name: 'Divisions' | 'Sectors' | 'Schemes', names: string[]): void {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: 'FF6B7280' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = [{ header: 'Name', key: 'name', width: 40 }];
  const header = ws.getRow(1).getCell(1);
  header.value = 'Name';
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, family: 2, size: 10, name: 'Arial' };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  for (const n of names) ws.addRow([n]);
  if (names.length > 0) ws.autoFilter = { from: 'A1', to: `A${names.length + 1}` };
}

function addListsSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet('Lists', {
    properties: { tabColor: { argb: 'FF9CA3AF' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const enums: Array<[string, readonly string[]]> = [
    ['ContractType', CONTRACT_TYPES],
    ['ProjectStage', PROJECT_STAGE_V2],
    ['ExecutionStatus', EXECUTION_STATUS],
    ['Priority', PRIORITY_ENUM],
    ['OMStatus', OM_STATUS_ENUM],
    ['YesNo', YES_NO_ENUM],
    ['FundingSource', fundingSources],
  ];
  ws.columns = enums.map(([label]) => ({ header: label, key: label, width: 26 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, family: 2, size: 10, name: 'Arial' };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  const maxLen = Math.max(...enums.map(([, vals]) => vals.length));
  for (let i = 0; i < maxLen; i++) {
    ws.addRow(enums.map(([, vals]) => vals[i] ?? ''));
  }
}

function addLogSheet(wb: ExcelJS.Workbook, name: string, headers: string[]): void {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  headers.forEach((h, i) => {
    const cell = ws.getRow(1).getCell(i + 1);
    cell.value = h;
    cell.fill = headerFill as unknown as ExcelJS.Fill;
    cell.font = headerFont as unknown as ExcelJS.Font;
    ws.getColumn(i + 1).width = i === 0 ? 26 : 22;
  });
}

function addReadmeSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet('README', { properties: { tabColor: { argb: 'FF15803D' } } });
  ws.columns = [{ width: 110 }];
  const mandatory = COLUMNS.filter((c) => c.required).map((c) => c.header);
  const lines: Array<{ text: string; bold?: boolean; size?: number; color?: string }> = [
    { text: 'BUIDCO Input Sheet — Project Register Template', bold: true, size: 16, color: 'FF1E3A5F' },
    { text: '' },
    { text: 'How to use', bold: true, size: 12 },
    { text: '1. Open the "Project Register" sheet. Each row (starting row 4) is one project.' },
    { text: '2. Row 2 has the field name; row 3 is a type hint (Text / Number / Dropdown / Date). Row 3 is not data — leave it as-is.' },
    { text: `3. Mandatory fields (must be filled for a row to import): ${mandatory.join(', ')}. Every other field is optional — leave blank if unknown.` },
    { text: '4. Columns are colour-grouped by Input Sheet section (Basic Info, Phase & Dates, Progress & Financial, Contract & Security, GeoTagging, Action & Remarks, O&M, Funding Source).' },
    { text: '5. Enum columns (Execution Status, Priority, Project Stage, Contract Type, O&M Status, Yes/No, Funding Source) have dropdowns — pick a value from the list.' },
    { text: '6. Sector / Division are dropdowns backed by the "Sectors" / "Divisions" reference sheets — pick the exact name shown there.' },
    { text: '7. Scheme(s) is a comma-separated list of scheme names, e.g. "AMRUT 1.0, Namami Gange" — one project can belong to several.' },
    { text: '8. Funding Source: Central Share / State Share only apply when Funding Source = "Central - State Share" — leave them blank otherwise.' },
    { text: '' },
    { text: 'Numeric conventions', bold: true, size: 12 },
    { text: '• All money amounts are ₹ Crore (not lakhs, not rupees).' },
    { text: '• All percentages are 0–100 (write 42.5, not 0.425).' },
    { text: '• Dates: use an Excel date cell or type YYYY-MM-DD (e.g. 2027-01-15).' },
    { text: '' },
    { text: 'Child records (not imported by this file)', bold: true, size: 12 },
    { text: 'CoS/EoT events, GeoTagging photos, and Management Action items each belong to a project but are entered from the Input Sheet directly after the project exists — the "…Log" sheets here are blank reference templates for jotting that data down by hand, not something this import reads.' },
    { text: '' },
    { text: `Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}Z`, color: 'FF6B7280' },
  ];
  for (const l of lines) {
    const row = ws.addRow([l.text]);
    row.font = { bold: l.bold ?? false, size: l.size ?? 11, color: l.color ? { argb: l.color } : undefined };
    row.alignment = { wrapText: true, vertical: 'top' };
  }
}

function addProjectRegisterSheet(wb: ExcelJS.Workbook, lookups: Lookups): void {
  const ws = wb.addWorksheet('Project Register', {
    properties: { tabColor: { argb: 'FF1E3A5F' } },
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
  });

  const sectionRow = ws.getRow(1);
  const headerRow = ws.getRow(2);
  const hintRow = ws.getRow(3);

  ws.columns = [
    { key: 'sno', width: 6 },
    ...COLUMNS.map((c) => ({ key: c.key, width: c.width ?? 20 })),
  ];

  const snoSection = sectionRow.getCell(1);
  snoSection.value = '#';
  snoSection.font = sectionFont as unknown as ExcelJS.Font;
  snoSection.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
  snoSection.border = thinBorder;
  const snoHeader = headerRow.getCell(1);
  snoHeader.value = '#';
  snoHeader.font = headerFont as unknown as ExcelJS.Font;
  snoHeader.fill = headerFill as unknown as ExcelJS.Fill;
  snoHeader.alignment = centerMiddleWrap;
  snoHeader.border = thinBorder;

  COLUMNS.forEach((col, idx) => {
    const excelIdx = idx + 2; // +1 for the leading '#' column, +1 for 1-based Excel index
    const letter = toColumnLetter(excelIdx - 1);

    const sectionCell = sectionRow.getCell(excelIdx);
    sectionCell.value = col.section;
    sectionCell.font = sectionFont as unknown as ExcelJS.Font;
    sectionCell.alignment = centerMiddle;
    sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_COLOR[col.section] ?? 'FF6B7280' } };
    sectionCell.border = thinBorder;

    const headerCell = headerRow.getCell(excelIdx);
    headerCell.value = col.header;
    headerCell.font = (col.required ? requiredHeaderFont : headerFont) as unknown as ExcelJS.Font;
    headerCell.fill = headerFill as unknown as ExcelJS.Fill;
    headerCell.alignment = centerMiddleWrap;
    headerCell.border = thinBorder;
    if (col.note) headerCell.note = col.note;

    const hintCell = hintRow.getCell(excelIdx);
    hintCell.value =
      col.type === 'lookup' || col.type === 'multi-lookup'
        ? `Dropdown: ${col.lookupSheet}`
        : col.type === 'enum'
          ? 'Dropdown'
          : col.type === 'yesno'
            ? 'Dropdown: Yes/No'
            : col.type === 'date'
              ? 'Date'
              : col.type === 'number'
                ? 'Number'
                : col.type === 'percent'
                  ? 'Number (0-100)'
                  : 'Text';
    hintCell.font = hintFont as unknown as ExcelJS.Font;
    hintCell.fill = headerFill as unknown as ExcelJS.Fill;
    hintCell.alignment = centerMiddle;
    hintCell.border = thinBorder;

    const range = `${letter}4:${letter}${3 + DATA_ROWS}`;
    switch (col.type) {
      case 'enum':
        if (col.enumValues) {
          addValidation(ws, range, {
            type: 'list',
            allowBlank: true,
            formulae: [`"${col.enumValues.join(',')}"`],
            showErrorMessage: true,
            errorTitle: 'Invalid value',
            error: `Pick one of: ${col.enumValues.join(', ')}`,
          });
        }
        break;
      case 'yesno':
        addValidation(ws, range, {
          type: 'list',
          allowBlank: true,
          formulae: ['"Yes,No"'],
          showErrorMessage: true,
          errorTitle: 'Invalid value',
          error: 'Pick Yes or No.',
        });
        break;
      case 'lookup': {
        const count =
          col.lookupSheet === 'Divisions' ? lookups.divisions.length
          : col.lookupSheet === 'Sectors' ? lookups.sectors.length
          : lookups.schemes.length;
        if (col.lookupSheet && count > 0) {
          addValidation(ws, range, {
            type: 'list',
            allowBlank: true,
            formulae: [`=${col.lookupSheet}!$A$2:$A$${count + 1}`],
            showErrorMessage: true,
            errorTitle: 'Invalid value',
            error: `Pick a name from the ${col.lookupSheet} sheet.`,
          });
        }
        break;
      }
      case 'number':
        addValidation(ws, range, {
          type: 'decimal',
          allowBlank: true,
          operator: 'greaterThanOrEqual',
          formulae: [0],
          showErrorMessage: true,
          errorTitle: 'Invalid number',
          error: 'Enter a non-negative number (e.g. 12.5).',
        });
        break;
      case 'percent':
        addValidation(ws, range, {
          type: 'decimal',
          allowBlank: true,
          operator: 'between',
          formulae: [0, 100],
          showErrorMessage: true,
          errorTitle: 'Invalid percentage',
          error: 'Enter a number between 0 and 100 (e.g. 42.5, not 0.425).',
        });
        break;
      case 'date':
        addValidation(ws, range, {
          type: 'date',
          allowBlank: true,
          operator: 'greaterThan',
          formulae: [new Date('1990-01-01')],
          showErrorMessage: true,
          errorTitle: 'Invalid date',
          error: 'Enter a valid date (YYYY-MM-DD or use the Excel date picker).',
        });
        break;
      case 'text':
      case 'multi-lookup':
        break;
    }
  });

  // Serial number formula down the data range.
  for (let r = 4; r <= 3 + DATA_ROWS; r++) {
    ws.getRow(r).getCell(1).value = { formula: `IF(B${r}="","",ROW()-3)` };
  }

  sectionRow.height = 20;
  headerRow.height = 32;
  hintRow.height = 14;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: COLUMNS.length + 1 } };
}

/* ============================================================
 * Main
 * ============================================================ */

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(here, '..', '..', '..', 'frontend', 'src', 'assets', 'Template.xlsx');

  process.stdout.write('Loading lookups from DB…\n');
  const lookups = await loadLookups();
  process.stdout.write(`  ${lookups.divisions.length} divisions · ${lookups.sectors.length} sectors · ${lookups.schemes.length} schemes\n`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'BUIDCO Dashboard';
  wb.created = new Date();
  wb.title = 'BUIDCO Project Register Template';

  addReadmeSheet(wb);
  addProjectRegisterSheet(wb, lookups);
  addLogSheet(wb, 'CoS-EoT Log', [
    'Project Name', 'CoS Number', 'CoS Date', 'Category', 'CoS Amount (Rs. Cr.)', 'Variation %',
    'EoT Number', 'EoT Days Granted', 'Time Linked?', 'Original End Date', 'New End Date (After EoT)', 'Revised Date (if Different)',
  ]);
  addLogSheet(wb, 'GeoTagging Photos Log', ['Project Name', 'Photo URL / Link', 'Caption', 'Date Added']);
  addLogSheet(wb, 'Management Actions Log', ['Project Name', 'Topic', 'Status', 'Deadline Date']);
  addLookupSheet(wb, 'Sectors', lookups.sectors);
  addLookupSheet(wb, 'Divisions', lookups.divisions);
  addLookupSheet(wb, 'Schemes', lookups.schemes);
  addListsSheet(wb);

  await wb.xlsx.writeFile(outputPath);
  process.stdout.write(`\nWrote ${outputPath}\n`);
  process.stdout.write(`  ${COLUMNS.length} project fields across ${new Set(COLUMNS.map((c) => c.section)).size} sections\n`);
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`Template generation failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
