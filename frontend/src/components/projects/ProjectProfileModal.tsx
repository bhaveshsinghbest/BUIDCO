import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useGetLookupsQuery } from '../../app/api/lookupsApi';
import { useGetProjectQuery } from '../../app/api/projectsApi';
import { useListCosEotForProjectQuery } from '../../app/api/cosEotApi';
import { useListMgmtActionsForProjectQuery } from '../../app/api/mgmtActionsApi';
import { useListMilestonesQuery } from '../../app/api/milestonesApi';
import { useGetFundsUcByProjectQuery } from '../../app/api/fundsUcApi';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { OmAlertCell } from './OmAlertCell';
import { PbgAlertCell } from './PbgAlertCell';
import { PriorityBadge } from './PriorityBadge';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';
import { cn } from '../../lib/utils';
import {
  formatCurrencyCr,
  formatDate,
  formatPercent,
  daysBetween,
} from '../../lib/formatters';
import { displayNitDate, displayNitNumber } from '../../features/tender/tenderWorkflow';
import { fundsUcStatusOf } from '../../lib/fundsUc';

// ── Field key type ────────────────────────────────────────────────────────────
type FieldKey =
  // Header Strip
  | 'sponsoringDept' | 'implementingAgency' | 'sanctionDate'
  // Snapshot Boxes
  | 'projectLocation' | 'contractor' | 'originalCompletion' | 'revisedCompletion'
  | 'aaAmount' | 'revisedAaAmount' | 'agreementAmount' | 'physicalProgress' | 'financialProgress'
  | 'timeOverrun' | 'costOverrun'
  // Project Brief block
  | 'projectBrief'
  // Overview card
  | 'city' | 'district' | 'division' | 'region' | 'sector' | 'schemes' | 'pd' | 'projectStageV2' | 'contractType'
  // Schedule & Delay card (includes tender NIT details)
  | 'plannedEndDate' | 'revisedEndDate' | 'expectedCompletion'
  | 'scheduledProgressPct' | 'delayReason' | 'deptStuckAt'
  | 'nitNumber' | 'nitDate'
  // Contract & Financial card
  | 'agreementNumber' | 'agreementDate' | 'appointedDate' | 'contractValueCr'
  | 'mobAdvanceIssuedCr' | 'mobAdvanceRecoveredCr' | 'advanceOutstandingCr'
  | 'retentionMoneyHeldCr' | 'totalPaymentsCr' | 'lastPaymentDate' | 'lastRaBillNo'
  // PBG & EMD card
  | 'pbgNumber' | 'pbgAmountCr' | 'pbgIssuingBank' | 'pbgExpiryDate'
  | 'emdAmountCr' | 'emdRefNumber' | 'emdDate'
  // O&M card
  | 'omStartDate' | 'omPeriodMonths' | 'omEndDate' | 'omAgency'
  | 'omStatusOverride' | 'omRemarks'
  // Funding Source & UC card
  | 'fundsUcSource' | 'fundsUcCentralShare' | 'fundsUcStateShare'
  | 'fundsUcOpeningBalance' | 'fundsUcGrantReceived' | 'fundsUcExpenditure'
  | 'fundsUcClosingBalance' | 'fundsUcSanctionNo' | 'fundsUcSubmittedDate' | 'fundsUcStatus'
  // Remarks card
  | 'remark' | 'mainWork'
  // Resources
  | 'cosEotResource' | 'mgmtResource' | 'milestonesResource';

// ── Field group definitions for settings panel ────────────────────────────────
interface FieldDef {
  key: FieldKey;
  label: string;
}
interface GroupDef {
  group: string;
  fields: FieldDef[];
}

const FIELD_GROUPS: GroupDef[] = [
  {
    group: 'Quick Look Strip',
    fields: [
      { key: 'sponsoringDept',     label: 'Sponsoring Department' },
      { key: 'implementingAgency', label: 'Implementing Agency' },
      { key: 'sanctionDate',       label: 'Sanction Date' },
    ],
  },
  {
    group: 'Key Metric Boxes',
    fields: [
      { key: 'projectLocation',   label: 'Project Location' },
      { key: 'contractor',        label: 'Contractor / Agency' },
      { key: 'originalCompletion',label: 'Original Completion' },
      { key: 'revisedCompletion', label: 'Revised Completion' },
      { key: 'aaAmount',          label: 'AA Amount' },
      { key: 'revisedAaAmount',   label: 'Revised AA Amount' },
      { key: 'agreementAmount',   label: 'Agreement Amount' },
      { key: 'physicalProgress',  label: 'Physical Progress %' },
      { key: 'financialProgress', label: 'Financial Progress %' },
      { key: 'timeOverrun',       label: 'Time Overrun' },
      { key: 'costOverrun',       label: 'Cost Overrun' },
    ],
  },
  {
    group: 'Project Brief',
    fields: [
      { key: 'projectBrief', label: 'Project Brief' },
    ],
  },
  {
    group: 'Overview Card',
    fields: [
      { key: 'city',         label: 'City' },
      { key: 'district',     label: 'District' },
      { key: 'division',     label: 'Division' },
      { key: 'region',       label: 'Region' },
      { key: 'sector',       label: 'Sector' },
      { key: 'schemes',      label: 'Scheme(s)' },
      { key: 'pd',           label: 'PD' },
      { key: 'projectStageV2', label: 'Project Stage' },
      { key: 'contractType',  label: 'Contract Type' },
    ],
  },
  {
    group: 'Schedule & Delay Card',
    fields: [
      { key: 'plannedEndDate',      label: 'Planned End Date' },
      { key: 'revisedEndDate',      label: 'Revised End Date' },
      { key: 'expectedCompletion',  label: 'Expected Completion' },
      { key: 'scheduledProgressPct',label: 'Scheduled Progress %' },
      { key: 'delayReason',         label: 'Delay Reason' },
      { key: 'deptStuckAt',         label: 'Department Stuck At' },
      { key: 'nitNumber',           label: 'NIT Number' },
      { key: 'nitDate',             label: 'NIT Date' },
    ],
  },
  {
    group: 'Contract & Financial Card',
    fields: [
      { key: 'agreementNumber',      label: 'Agreement Number' },
      { key: 'agreementDate',        label: 'Agreement Date' },
      { key: 'appointedDate',        label: 'Appointed Date' },
      { key: 'contractValueCr',      label: 'Contract Value' },
      { key: 'mobAdvanceIssuedCr',   label: 'Mob. Advance Issued' },
      { key: 'mobAdvanceRecoveredCr',label: 'Mob. Advance Recovered' },
      { key: 'advanceOutstandingCr', label: 'Advance Outstanding' },
      { key: 'retentionMoneyHeldCr', label: 'Retention Held' },
      { key: 'totalPaymentsCr',      label: 'Total Payments' },
      { key: 'lastPaymentDate',      label: 'Last Payment Date' },
      { key: 'lastRaBillNo',         label: 'Last RA Bill No.' },
    ],
  },
  {
    group: 'PBG & EMD Card',
    fields: [
      { key: 'pbgNumber',     label: 'PBG Number' },
      { key: 'pbgAmountCr',   label: 'PBG Amount' },
      { key: 'pbgIssuingBank',label: 'PBG Issuing Bank' },
      { key: 'pbgExpiryDate', label: 'PBG Expiry Date' },
      { key: 'emdAmountCr',   label: 'EMD Amount' },
      { key: 'emdRefNumber',  label: 'EMD Reference' },
      { key: 'emdDate',       label: 'EMD Date' },
    ],
  },
  {
    group: 'O&M Card',
    fields: [
      { key: 'omStartDate',     label: 'O&M Start Date' },
      { key: 'omPeriodMonths',  label: 'Period (months)' },
      { key: 'omEndDate',       label: 'O&M End Date' },
      { key: 'omAgency',        label: 'O&M Agency' },
      { key: 'omStatusOverride',label: 'Status Override' },
      { key: 'omRemarks',       label: 'O&M Remarks' },
    ],
  },
  {
    group: 'Funding Source & UC Card',
    fields: [
      { key: 'fundsUcSource',          label: 'Funding Source' },
      { key: 'fundsUcCentralShare',    label: 'Central Share' },
      { key: 'fundsUcStateShare',      label: 'State Share' },
      { key: 'fundsUcOpeningBalance',  label: 'Opening Balance' },
      { key: 'fundsUcGrantReceived',   label: 'Grant Received' },
      { key: 'fundsUcExpenditure',     label: 'Expenditure Incurred' },
      { key: 'fundsUcClosingBalance',  label: 'Closing Balance' },
      { key: 'fundsUcSanctionNo',      label: 'Sanction No.' },
      { key: 'fundsUcSubmittedDate',   label: 'UC Submitted Date' },
      { key: 'fundsUcStatus',          label: 'UC Status' },
    ],
  },
  {
    group: 'Remarks & Gaps Card',
    fields: [
      { key: 'remark',   label: 'Outstanding Remark' },
      { key: 'mainWork', label: 'Main Work' },
    ],
  },
  {
    group: 'Related Resources',
    fields: [
      { key: 'cosEotResource',   label: 'CoS / EoT Records' },
      { key: 'mgmtResource',     label: 'Management Actions' },
      { key: 'milestonesResource',label: 'Milestones' },
    ],
  },
];

const ALL_KEYS = FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

const DEFAULT_VISIBILITY = Object.fromEntries(
  ALL_KEYS.map((k) => [k, true]),
) as Record<FieldKey, boolean>;

const LS_KEY = 'buidco.projectProfile.fieldVisibility.v2';

function loadVisibility(): Record<FieldKey, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_VISIBILITY };
    return { ...DEFAULT_VISIBILITY, ...(JSON.parse(raw) as Partial<Record<FieldKey, boolean>>) };
  } catch {
    return { ...DEFAULT_VISIBILITY };
  }
}

function saveVisibility(v: Record<FieldKey, boolean>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    // ignore quota errors
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  projectId: string | null;
  onClose: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProjectProfileModal({ projectId, onClose }: Props): JSX.Element | null {
  const enabled = projectId !== null;
  const detail       = useGetProjectQuery(projectId ?? '', { skip: !enabled });
  const cosEot       = useListCosEotForProjectQuery(projectId ?? '', { skip: !enabled });
  const mgmt         = useListMgmtActionsForProjectQuery(projectId ?? '', { skip: !enabled });
  const milestones   = useListMilestonesQuery(projectId ?? '', { skip: !enabled });
  const fundsUc      = useGetFundsUcByProjectQuery(projectId ?? '', { skip: !enabled });
  const lookups      = useGetLookupsQuery(undefined, { skip: !enabled });

  const [showSettings, setShowSettings] = useState(false);
  const [fieldSearch, setFieldSearch]   = useState('');
  const [visibility, setVisibility]     = useState<Record<FieldKey, boolean>>(loadVisibility);
  const searchRef = useRef<HTMLInputElement>(null);

  const isVisible = (key: FieldKey): boolean => visibility[key] ?? true;

  const toggleField = (key: FieldKey): void => {
    setVisibility((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveVisibility(next);
      return next;
    });
  };

  const setAll = (val: boolean): void => {
    const next = Object.fromEntries(ALL_KEYS.map((k) => [k, val])) as Record<FieldKey, boolean>;
    setVisibility(next);
    saveVisibility(next);
  };

  // Escape → close
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (showSettings) { setShowSettings(false); return; }
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, onClose, showSettings]);

  // Lock body scroll
  useEffect(() => {
    if (!enabled) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [enabled]);

  // Focus search when settings opens
  useEffect(() => {
    if (showSettings) setTimeout(() => searchRef.current?.focus(), 80);
  }, [showSettings]);

  if (!enabled) return null;

  const project = detail.data;

  // Lookup labels
  const sectorName  = project?.sectorId
    ? lookups.data?.sectors.find((s) => s.sectorId === project.sectorId)?.sectorName
    : null;
  const districtName = project?.districtId
    ? lookups.data?.districts.find((d) => d.districtId === project.districtId)?.districtName
    : null;
  const divisionRow = project?.divisionId
    ? lookups.data?.divisions.find((d) => d.divisionId === project.divisionId)
    : null;
  const divisionName = divisionRow?.divisionName ?? null;
  const regionName = divisionRow
    ? lookups.data?.regions.find((r) => r.regionId === divisionRow.regionId)?.regionName ?? null
    : null;
  const schemeNames = (project?.schemes ?? []).map(
    (id) => lookups.data?.schemes.find((s) => s.schemeId === id)?.schemeName ?? `#${id}`,
  );

  // Computed: Time Overrun
  const endRef = project?.revisedEndDate ?? project?.expectedCompletionDate;
  const timeOverrunDays =
    project?.plannedEndDate && endRef ? daysBetween(project.plannedEndDate, endRef) : null;
  const timeOverrunDisplay =
    timeOverrunDays === null ? 'N/A' :
    timeOverrunDays > 0     ? `${timeOverrunDays} days` :
                              'On Schedule';
  const isTimeOverrun = timeOverrunDays !== null && timeOverrunDays > 0;

  // Computed: Cost Overrun
  const costOverrunVal =
    project?.aaAmountCr != null && project?.agreementAmountCr != null
      ? project.agreementAmountCr - project.aaAmountCr
      : null;
  const costOverrunDisplay =
    costOverrunVal === null ? 'N/A' :
    costOverrunVal > 0     ? formatCurrencyCr(costOverrunVal) :
                             'Within AA';
  const isCostOverrun = costOverrunVal !== null && costOverrunVal > 0;

  const locationDisplay = project?.city
    ? `${project.city}${districtName ? `, ${districtName}` : ''}`
    : (districtName ?? '—');

  // ── Filtered groups for settings search ───────────────────────────────────
  const lowerSearch = fieldSearch.toLowerCase();
  const filteredGroups = FIELD_GROUPS
    .map((g) => ({
      ...g,
      fields: g.fields.filter(
        (f) => !lowerSearch || f.label.toLowerCase().includes(lowerSearch),
      ),
    }))
    .filter((g) => g.fields.length > 0);

  // ── Card field lists (pre-filtered by visibility) ─────────────────────────
  type GridField = { label: string; value: React.ReactNode; fk: FieldKey };

  const overviewFields: GridField[] = [
    { label: 'City',               value: project?.city,                 fk: 'city' },
    { label: 'District',           value: districtName,                  fk: 'district' },
    { label: 'Division',           value: divisionName,                  fk: 'division' },
    { label: 'Region',             value: regionName,                    fk: 'region' },
    { label: 'Sector',             value: sectorName,                    fk: 'sector' },
    { label: 'Scheme(s)',          value: schemeNames.join(', ') || null, fk: 'schemes' },
    { label: 'Contractor',         value: project?.contractor,           fk: 'contractor' },
    { label: 'PD',                 value: project?.pd,                   fk: 'pd' },
    { label: 'Sponsoring Dept',    value: project?.sponsoringDept,       fk: 'sponsoringDept' },
    { label: 'Implementing Agency',value: project?.implementingAgency,   fk: 'implementingAgency' },
    { label: 'Project Stage',      value: project?.projectStageV2,       fk: 'projectStageV2' },
    { label: 'Contract Type',      value: project?.contractType,         fk: 'contractType' },
  ];

  const scheduleFields: GridField[] = [
    { label: 'Sanction Date',       value: formatDate(project?.sanctionDate),         fk: 'sanctionDate' },
    { label: 'Planned End Date',    value: formatDate(project?.plannedEndDate),        fk: 'plannedEndDate' },
    { label: 'Revised End Date',    value: formatDate(project?.revisedEndDate),        fk: 'revisedEndDate' },
    {
      label: 'Expected Completion',
      value: formatDate(project?.expectedCompletionDate) === '—'
        ? (project?.expectedCompletionRaw ?? '—')
        : formatDate(project?.expectedCompletionDate),
      fk: 'expectedCompletion',
    },
    { label: 'Scheduled Progress %', value: formatPercent(project?.scheduledProgressPct), fk: 'scheduledProgressPct' },
    { label: 'Delay Reason',          value: project?.delayReason,                        fk: 'delayReason' },
    { label: 'Department Stuck At',   value: project?.deptStuckAt,                        fk: 'deptStuckAt' },
    // NIT_addition_instructions.md §4 — read-only in the profile modal.
    // Editable only from the Tender Dashboard's NIT Published sub-stage.
    {
      label: 'NIT Number',
      value: project?.nitNumber && project.nitNumber.trim() !== ''
        ? project.nitNumber
        : displayNitNumber(null),
      fk: 'nitNumber',
    },
    {
      label: 'NIT Date',
      value: project?.nitDate ? formatDate(project.nitDate) : displayNitDate(null),
      fk: 'nitDate',
    },
  ];

  const contractFields: GridField[] = [
    { label: 'Agreement Number',      value: project?.agreementNumber,                     fk: 'agreementNumber' },
    { label: 'Agreement Date',        value: formatDate(project?.agreementDate),            fk: 'agreementDate' },
    { label: 'Appointed Date',        value: formatDate(project?.appointedDate),            fk: 'appointedDate' },
    { label: 'Contract Value',        value: formatCurrencyCr(project?.contractValueCr),    fk: 'contractValueCr' },
    { label: 'Mob. Advance Issued',   value: formatCurrencyCr(project?.mobAdvanceIssuedCr), fk: 'mobAdvanceIssuedCr' },
    { label: 'Mob. Advance Recovered',value: formatCurrencyCr(project?.mobAdvanceRecoveredCr), fk: 'mobAdvanceRecoveredCr' },
    { label: 'Advance Outstanding',   value: formatCurrencyCr(project?.advanceOutstandingCr),  fk: 'advanceOutstandingCr' },
    { label: 'Retention Held',        value: formatCurrencyCr(project?.retentionMoneyHeldCr),  fk: 'retentionMoneyHeldCr' },
    { label: 'Total Payments',        value: formatCurrencyCr(project?.totalPaymentsCr),       fk: 'totalPaymentsCr' },
    { label: 'Last Payment Date',     value: formatDate(project?.lastPaymentDate),             fk: 'lastPaymentDate' },
    { label: 'Last RA Bill No.',      value: project?.lastRaBillNo,                           fk: 'lastRaBillNo' },
  ];

  const pbgFields: GridField[] = [
    { label: 'PBG Number',      value: project?.pbgNumber,                    fk: 'pbgNumber' },
    { label: 'PBG Amount',      value: formatCurrencyCr(project?.pbgAmountCr), fk: 'pbgAmountCr' },
    { label: 'PBG Issuing Bank',value: project?.pbgIssuingBank,               fk: 'pbgIssuingBank' },
    { label: 'PBG Expiry Date', value: formatDate(project?.pbgExpiryDate),     fk: 'pbgExpiryDate' },
    { label: 'EMD Amount',      value: formatCurrencyCr(project?.emdAmountCr), fk: 'emdAmountCr' },
    { label: 'EMD Reference',   value: project?.emdRefNumber,                 fk: 'emdRefNumber' },
    { label: 'EMD Date',        value: formatDate(project?.emdDate),           fk: 'emdDate' },
  ];

  const omFields: GridField[] = [
    { label: 'O&M Start Date',  value: formatDate(project?.omStartDate),  fk: 'omStartDate' },
    { label: 'Period (months)', value: project?.omPeriodMonths ?? '—',    fk: 'omPeriodMonths' },
    { label: 'O&M End Date',    value: formatDate(project?.omEndDate),    fk: 'omEndDate' },
    { label: 'O&M Agency',      value: project?.omAgency,                fk: 'omAgency' },
    { label: 'Status Override', value: project?.omStatusOverride,        fk: 'omStatusOverride' },
  ];

  const fundsUcEntry = fundsUc.data ?? null;
  const isCentralStateShare = fundsUcEntry?.fundingSource === 'Central - State Share';
  const fundsUcFields: GridField[] = fundsUcEntry
    ? [
        { label: 'Funding Source', value: fundsUcEntry.fundingSource, fk: 'fundsUcSource' },
        ...(isCentralStateShare
          ? ([
              { label: 'Central Share', value: formatPercent(fundsUcEntry.centralSharePct, 0), fk: 'fundsUcCentralShare' },
              { label: 'State Share', value: formatPercent(fundsUcEntry.stateSharePct, 0), fk: 'fundsUcStateShare' },
            ] as GridField[])
          : []),
        { label: 'Opening Balance', value: formatCurrencyCr(fundsUcEntry.openingBalanceCr), fk: 'fundsUcOpeningBalance' },
        { label: 'Grant Received', value: formatCurrencyCr(fundsUcEntry.grantReceivedCr), fk: 'fundsUcGrantReceived' },
        { label: 'Expenditure Incurred', value: formatCurrencyCr(fundsUcEntry.expenditureIncurredCr), fk: 'fundsUcExpenditure' },
        {
          label: 'Closing Balance',
          value: formatCurrencyCr(fundsUcEntry.openingBalanceCr + fundsUcEntry.grantReceivedCr - fundsUcEntry.expenditureIncurredCr),
          fk: 'fundsUcClosingBalance',
        },
        { label: 'Sanction No.', value: fundsUcEntry.sanctionNo, fk: 'fundsUcSanctionNo' },
        { label: 'UC Submitted Date', value: formatDate(fundsUcEntry.ucSubmittedDate), fk: 'fundsUcSubmittedDate' },
        { label: 'UC Status', value: fundsUcStatusOf(fundsUcEntry), fk: 'fundsUcStatus' },
      ]
    : [];

  const visible = (fields: GridField[]) => fields.filter((f) => isVisible(f.fk));

  const visOv       = visible(overviewFields);
  const visSched    = visible(scheduleFields);
  const visContract = visible(contractFields);
  const visPbg      = visible(pbgFields);
  const visOm       = visible(omFields);
  const visFundsUc  = visible(fundsUcFields);

  const showRemarkCard =
    isVisible('remark') || isVisible('mainWork') || isVisible('projectBrief');

  const showFundsUcCard = fundsUc.isLoading || visFundsUc.length > 0 || (!fundsUcEntry && isVisible('fundsUcSource'));

  const showDetailSection =
    visOv.length > 0 || visSched.length > 0 ||
    visContract.length > 0 || visPbg.length > 0 ||
    visOm.length > 0 || showFundsUcCard || showRemarkCard;

  const showStripSection =
    isVisible('sponsoringDept') || isVisible('implementingAgency') || isVisible('sanctionDate');

  const showSnapRow1 =
    isVisible('projectLocation') || isVisible('contractor') ||
    isVisible('originalCompletion') || isVisible('revisedCompletion');

  const showSnapRow2 =
    isVisible('aaAmount') || isVisible('revisedAaAmount') || isVisible('agreementAmount') ||
    isVisible('physicalProgress') || isVisible('financialProgress');

  const showOverrunRow = isVisible('timeOverrun') || isVisible('costOverrun');

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Project profile"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative my-4 w-full max-w-5xl rounded-xl border border-[#E5E7EB] bg-white shadow-2xl">

        {/* ── Gradient header ─────────────────────────────────────────────── */}
        <header
          className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-xl px-3 py-3 sm:px-5 sm:py-3.5"
          style={{ background: 'linear-gradient(100deg,#1E3A5F 0%,#2563EB 100%)' }}
        >
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#93C5FD]">
              🪪 Project Profile
            </p>
            <h2 className="mt-0.5 max-w-xl truncate text-[15px] font-bold text-white">
              {project?.projectName ?? (detail.isLoading ? '…' : '—')}
            </h2>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              title="Customise which fields appear on this profile"
              onClick={() => setShowSettings((s) => !s)}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors',
                showSettings
                  ? 'border-white/70 bg-white/30 text-white'
                  : 'border-white/30 bg-white/15 text-white hover:bg-white/25',
              )}
            >
              ⚙️ Customise
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-white/30 bg-white/15 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-white/25"
            >
              ⬇ Export PDF
            </button>
            {project ? (
              <NavLink
                to={`/projects/${project.projectId}`}
                onClick={onClose}
                className="rounded-md border border-white/50 bg-white/15 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-white/25"
              >
                📋 Other Details
              </NavLink>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              aria-label="Close"
              className="border-white/40 bg-white/15 text-white hover:bg-white/25"
            >
              ✕
            </Button>
          </div>
        </header>

        {/* ── Settings panel ──────────────────────────────────────────────── */}
        {showSettings ? (
          <div className="border-b border-[#E5E7EB] bg-white">
            {/* Settings header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F3F4F6] px-3 py-3 sm:px-5">
              <span className="text-[12.5px] font-bold text-[#1E3A5F]">
                ⚙️ Customise Profile Fields
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAll(true)}
                  className="rounded border border-[#D1D5DB] px-2.5 py-1 text-[10.5px] font-semibold text-[#374151] hover:bg-[#F9FAFB]"
                >
                  Show All
                </button>
                <button
                  type="button"
                  onClick={() => setAll(false)}
                  className="rounded border border-[#FCA5A5] px-2.5 py-1 text-[10.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]"
                >
                  Hide All
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSettings(false); setFieldSearch(''); }}
                  className="rounded bg-[#1E3A5F] px-3 py-1 text-[10.5px] font-semibold text-white hover:bg-[#1e3a5fe0]"
                >
                  Done ✓
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 pb-3 pt-3 sm:px-5">
              <input
                ref={searchRef}
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Search fields… (e.g. PBG, contractor, O&M)"
                className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-[12px] text-[#111827] outline-none placeholder:text-[#9CA3AF] focus:border-[#93C5FD] focus:ring-1 focus:ring-[#93C5FD]"
              />
            </div>

            {/* Groups + field chips */}
            <div className="max-h-72 overflow-y-auto px-3 pb-4 sm:px-5">
              {filteredGroups.length === 0 ? (
                <p className="text-[12px] text-[#9CA3AF]">No fields match.</p>
              ) : (
                <div className="space-y-4">
                  {filteredGroups.map((g) => (
                    <div key={g.group}>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                        {g.group}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {g.fields.map((f) => {
                          const on = isVisible(f.key);
                          return (
                            <label
                              key={f.key}
                              className={cn(
                                'flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                                on
                                  ? 'border-[#93C5FD] bg-[#EFF6FF] font-semibold text-[#1D4ED8]'
                                  : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleField(f.key)}
                                className="cursor-pointer accent-[#1D4ED8]"
                              />
                              {f.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Modal body ──────────────────────────────────────────────────── */}
        <div className="px-3 py-4 sm:px-6 sm:py-5" id="project-profile-print-area">
          {detail.isLoading || !project ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="space-y-5">

              {/* Title block */}
              <div>
                <div className="text-[18px] font-extrabold text-[#111827]">
                  {project.projectName}
                </div>
                <div className="mt-1 text-[12px] text-[#6B7280]">
                  {sectorName ? `${sectorName} · ` : ''}
                  {schemeNames.length > 0 ? schemeNames.join(', ') : ''}
                  {districtName ? ` · ${districtName}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={project.status} />
                  <PriorityBadge priority={project.priority} />
                  {project.projectStageV2 ? (
                    <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#1E3A5F]">
                      Stage · {project.projectStageV2}
                    </span>
                  ) : null}
                  {project.contractType ? (
                    <span className="rounded-full border border-[#D1D5DB] bg-[#F9FAFB] px-2 py-0.5 text-[10.5px] font-semibold text-[#374151]">
                      {project.contractType}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Quick Look Strip */}
              {showStripSection ? (
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-[#D1D5DB] bg-[#F3F4F6] px-4 py-3 sm:grid-cols-3">
                  {isVisible('sponsoringDept') ? (
                    <StripItem label="Sponsoring Department" value={project.sponsoringDept} />
                  ) : null}
                  {isVisible('implementingAgency') ? (
                    <StripItem label="Implementing Agency" value={project.implementingAgency} />
                  ) : null}
                  {isVisible('sanctionDate') ? (
                    <StripItem label="Sanction Date" value={formatDate(project.sanctionDate)} />
                  ) : null}
                </div>
              ) : null}

              {/* Snapshot Boxes — row 1: location, contractor, dates */}
              {showSnapRow1 ? (
                <div className={cn(
                  'grid gap-3',
                  [isVisible('projectLocation'), isVisible('contractor'), isVisible('originalCompletion'), isVisible('revisedCompletion')].filter(Boolean).length === 4
                    ? 'grid-cols-2 sm:grid-cols-4'
                    : 'grid-cols-2 sm:grid-cols-3',
                )}>
                  {isVisible('projectLocation') ? (
                    <SnapshotBox label="PROJECT LOCATION" value={locationDisplay} />
                  ) : null}
                  {isVisible('contractor') ? (
                    <SnapshotBox label="CONTRACTOR / AGENCY" value={project.contractor} />
                  ) : null}
                  {isVisible('originalCompletion') ? (
                    <SnapshotBox label="ORIGINAL COMPLETION" value={formatDate(project.plannedEndDate)} />
                  ) : null}
                  {isVisible('revisedCompletion') ? (
                    <SnapshotBox label="REVISED COMPLETION" value={formatDate(project.revisedEndDate)} />
                  ) : null}
                </div>
              ) : null}

              {/* Snapshot Boxes — row 2: money + progress */}
              {showSnapRow2 ? (
                <div className={cn(
                  'grid gap-3',
                  [isVisible('aaAmount'), isVisible('revisedAaAmount'), isVisible('agreementAmount'), isVisible('physicalProgress'), isVisible('financialProgress')].filter(Boolean).length >= 4
                    ? 'grid-cols-2 sm:grid-cols-4'
                    : 'grid-cols-2 sm:grid-cols-3',
                )}>
                  {isVisible('aaAmount') ? (
                    <SnapshotBox label="AA AMOUNT" value={formatCurrencyCr(project.aaAmountCr)} />
                  ) : null}
                  {isVisible('revisedAaAmount') ? (
                    <SnapshotBox label="REVISED AA" value={formatCurrencyCr(project.revisedAaAmountCr)} />
                  ) : null}
                  {isVisible('agreementAmount') ? (
                    <SnapshotBox label="AGREEMENT AMOUNT" value={formatCurrencyCr(project.agreementAmountCr)} />
                  ) : null}
                  {isVisible('physicalProgress') ? (
                    <ProgressBox
                      label="PHYSICAL PROGRESS"
                      value={project.effectivePhysicalPct}
                      color="#1D4ED8"
                      sub={project.isMilestoneWeighted ? 'Milestone-weighted' : 'Manual entry'}
                      subColor={project.isMilestoneWeighted ? '#15803D' : '#6B7280'}
                    />
                  ) : null}
                  {isVisible('financialProgress') ? (
                    <ProgressBox label="FINANCIAL PROGRESS" value={project.financialProgressPct} color="#22C55E" />
                  ) : null}
                </div>
              ) : null}

              {/* Overrun Boxes */}
              {showOverrunRow ? (
                <div className={cn(
                  'grid gap-3',
                  isVisible('timeOverrun') && isVisible('costOverrun')
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2',
                )}>
                  {isVisible('timeOverrun') ? (
                    <OverrunBox label="TIME OVERRUN" value={timeOverrunDisplay} isOverrun={isTimeOverrun} />
                  ) : null}
                  {isVisible('costOverrun') ? (
                    <OverrunBox label="COST OVERRUN" value={costOverrunDisplay} isOverrun={isCostOverrun} />
                  ) : null}
                </div>
              ) : null}

              {/* Project Brief */}
              {isVisible('projectBrief') && project.projectBrief ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1E3A5F]">
                    Project Brief
                  </p>
                  <div className="whitespace-pre-wrap rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-[12.5px] leading-relaxed text-[#374151]">
                    {project.projectBrief}
                  </div>
                </div>
              ) : null}

              {/* Detail Field Cards */}
              {showDetailSection ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {visOv.length > 0 ? (
                    <FieldCard title="Overview">
                      <FieldGrid fields={visOv} />
                    </FieldCard>
                  ) : null}

                  {visSched.length > 0 ? (
                    <FieldCard title="Schedule & Delay">
                      <FieldGrid fields={visSched} />
                    </FieldCard>
                  ) : null}

                  {visContract.length > 0 ? (
                    <FieldCard title="Contract & Financial (₹ Cr)">
                      <FieldGrid fields={visContract} />
                    </FieldCard>
                  ) : null}

                  {visPbg.length > 0 ? (
                    <FieldCard title="PBG & EMD">
                      <FieldGrid fields={visPbg} />
                      <div className="mt-2">
                        <PbgAlertCell pbgExpiryDate={project.pbgExpiryDate} />
                      </div>
                    </FieldCard>
                  ) : null}

                  {showFundsUcCard ? (
                    <FieldCard title="Funding Source & UC">
                      {fundsUc.isLoading ? (
                        <Skeleton className="h-16 w-full" />
                      ) : visFundsUc.length > 0 ? (
                        <FieldGrid fields={visFundsUc} />
                      ) : (
                        <p className="text-[12.5px] text-[#6B7280]">
                          No Funding Source recorded yet — add it from the Input Sheet.
                        </p>
                      )}
                    </FieldCard>
                  ) : null}

                  {visOm.length > 0 || (project.omApplicable && (isVisible('omRemarks') || isVisible('omStatusOverride'))) ? (
                    <FieldCard title="O&M">
                      {!project.omApplicable ? (
                        <p className="text-[12.5px] text-[#6B7280]">Not applicable to this project.</p>
                      ) : (
                        <>
                          {visOm.length > 0 ? <FieldGrid fields={visOm} /> : null}
                          <div className="mt-2">
                            <OmAlertCell
                              status={project.status}
                              omApplicable={project.omApplicable}
                              omStartDate={project.omStartDate}
                              omEndDate={project.omEndDate}
                              omPeriodMonths={project.omPeriodMonths}
                              omStatusOverride={project.omStatusOverride}
                            />
                          </div>
                          {isVisible('omRemarks') && project.omRemarks ? (
                            <p className="mt-2 whitespace-pre-wrap text-[12px] text-[#374151]">
                              {project.omRemarks}
                            </p>
                          ) : null}
                        </>
                      )}
                    </FieldCard>
                  ) : null}

                  {showRemarkCard ? (
                    <FieldCard title="Outstanding Gap & Remarks">
                      {isVisible('remark') ? (
                        project.remark ? (
                          <p className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B91C1C]">
                            ⚠ {project.remark}
                          </p>
                        ) : (
                          <p className="text-[12.5px] text-[#6B7280]">No outstanding gap recorded.</p>
                        )
                      ) : null}
                      {isVisible('mainWork') && project.mainWork ? (
                        <div className="mt-3">
                          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">Main Work</p>
                          <p className="whitespace-pre-wrap text-[12.5px] text-[#111827]">{project.mainWork}</p>
                        </div>
                      ) : null}
                      {isVisible('projectBrief') && project.projectBrief ? (
                        <div className="mt-3">
                          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">Project Brief</p>
                          <p className="whitespace-pre-wrap text-[12.5px] text-[#111827]">{project.projectBrief}</p>
                        </div>
                      ) : null}
                    </FieldCard>
                  ) : null}
                </div>
              ) : null}

              {/* Related Resources */}
              {(isVisible('cosEotResource') || isVisible('mgmtResource') || isVisible('milestonesResource')) ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {isVisible('cosEotResource') ? (
                    <FieldCard title={`CoS / EoT (${cosEot.data?.items.length ?? 0})`}>
                      {cosEot.isLoading ? (
                        <Skeleton className="h-12 w-full" />
                      ) : cosEot.data?.items.length ? (
                        <ul className="space-y-1 text-[12px]">
                          {cosEot.data.items.slice(0, 4).map((c) => (
                            <li
                              key={c.cosId}
                              className="flex items-center justify-between rounded border border-[#E5E7EB] px-2 py-1"
                            >
                              <span className="truncate font-semibold text-[#111827]">
                                {c.cosNumber ?? 'CoS'} · {c.category ?? '—'}
                              </span>
                              <span className="tabular-nums text-[#6B7280]">
                                {formatCurrencyCr(c.cosAmountCr)}
                                {c.eotDaysGranted ? ` · +${c.eotDaysGranted}d` : ''}
                              </span>
                            </li>
                          ))}
                          {cosEot.data.items.length > 4 ? (
                            <li className="text-[11px] italic text-[#6B7280]">
                              +{cosEot.data.items.length - 4} more…
                            </li>
                          ) : null}
                        </ul>
                      ) : (
                        <p className="text-[12px] text-[#6B7280]">No CoS / EoT records.</p>
                      )}
                    </FieldCard>
                  ) : null}

                  {isVisible('mgmtResource') ? (
                    <FieldCard title={`Management Actions (${mgmt.data?.items.length ?? 0})`}>
                      {mgmt.isLoading ? (
                        <Skeleton className="h-12 w-full" />
                      ) : mgmt.data?.items.length ? (
                        <ul className="space-y-1 text-[12px]">
                          {mgmt.data.items.slice(0, 4).map((a) => (
                            <li
                              key={a.itemId}
                              className={cn(
                                'rounded border px-2 py-1 text-[#111827]',
                                a.status === 'Closed'
                                  ? 'border-[#86EFAC] bg-[#F0FDF4]'
                                  : 'border-[#FCA5A5] bg-[#FEF2F2]',
                              )}
                            >
                              {a.topic}
                            </li>
                          ))}
                          {mgmt.data.items.length > 4 ? (
                            <li className="text-[11px] italic text-[#6B7280]">
                              +{mgmt.data.items.length - 4} more…
                            </li>
                          ) : null}
                        </ul>
                      ) : (
                        <p className="text-[12px] text-[#6B7280]">No management actions.</p>
                      )}
                    </FieldCard>
                  ) : null}

                  {isVisible('milestonesResource') ? (
                    <FieldCard title={`Milestones (${milestones.data?.items.length ?? 0})`}>
                      {milestones.isLoading ? (
                        <Skeleton className="h-12 w-full" />
                      ) : milestones.data?.items.length ? (
                        <ul className="space-y-1 text-[12px]">
                          {milestones.data.items.slice(0, 4).map((m) => (
                            <li
                              key={m.milestoneId}
                              className="flex items-center justify-between rounded border border-[#E5E7EB] px-2 py-1"
                            >
                              <span className="truncate">{m.milestoneName}</span>
                              <span className="tabular-nums text-[#374151]">{m.weightPct}%</span>
                            </li>
                          ))}
                          {milestones.data.items.length > 4 ? (
                            <li className="text-[11px] italic text-[#6B7280]">
                              +{milestones.data.items.length - 4} more…
                            </li>
                          ) : null}
                        </ul>
                      ) : (
                        <p className="text-[12px] text-[#6B7280]">No milestones yet.</p>
                      )}
                    </FieldCard>
                  ) : null}
                </div>
              ) : null}

            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #project-profile-print-area,
          #project-profile-print-area * { visibility: visible; }
          #project-profile-print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StripItem({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div>
      <span className="text-[11.5px] font-bold text-[#374151]">{label}: </span>
      <span className="text-[11.5px] text-[#111827]">{value ?? '—'}</span>
    </div>
  );
}

function SnapshotBox({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-[#BFDBFE] bg-[#DBEAFE] p-3 text-center">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-[#1E3A5F]">{label}</dt>
      <dd className="mt-1 text-[13px] font-bold leading-tight text-[#111827]">{value ?? '—'}</dd>
    </div>
  );
}

function ProgressBox({
  label, value, color, sub, subColor,
}: {
  label: string;
  value: number | null | undefined;
  color: string;
  sub?: string;
  subColor?: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-[#BFDBFE] bg-[#DBEAFE] p-3">
      <dt className="text-[9.5px] font-bold uppercase tracking-wider text-[#1E3A5F]">{label}</dt>
      <dd className="mt-1 text-[16px] font-extrabold tabular-nums text-[#111827]">
        {formatPercent(value)}
      </dd>
      <ProgressBar value={value} color={color} showLabel={false} className="mt-1.5" />
      {sub ? (
        <p
          className="mt-1 text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: subColor ?? '#6B7280' }}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function OverrunBox({ label, value, isOverrun }: {
  label: string; value: string; isOverrun: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-center',
        isOverrun ? 'border-[#FCA5A5] bg-[#FEE2E2]' : 'border-[#86EFAC] bg-[#F0FDF4]',
      )}
    >
      <dt className={cn('text-[9.5px] font-bold uppercase tracking-wider', isOverrun ? 'text-[#B91C1C]' : 'text-[#15803D]')}>
        {label}
      </dt>
      <dd className={cn('mt-1 text-[15px] font-bold', isOverrun ? 'text-[#B91C1C]' : 'text-[#15803D]')}>
        {value}
      </dd>
    </div>
  );
}

function FieldCard({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-sm">
      <h3 className="mb-2 border-b border-[#F3F4F6] pb-1 text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldGrid({ fields }: {
  fields: Array<{ label: string; value: React.ReactNode }>;
}): JSX.Element {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
      {fields.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
            {f.label}
          </dt>
          <dd className="truncate text-[#111827]">{f.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
