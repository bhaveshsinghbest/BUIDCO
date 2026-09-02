import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectListItem } from '../../types/api';
import type { Lookups } from '../../types/api';
import { useDeleteProjectMutation } from '../../app/api/projectsApi';
import { useAppSelector } from '../../app/hooks';
import { selectCurrentUser } from '../../features/auth/authSlice';
import { displayNitDate, displayNitNumber } from '../../features/tender/tenderWorkflow';
import { useClickOutside } from '../../hooks/useClickOutside';
import { daysBetween, formatCurrencyCr, formatDate, formatPercent } from '../../lib/formatters';
import { downloadProjectsExcel, downloadProjectsPdf, downloadProjectsPptx } from '../../lib/projectsExport';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches, minMatches } from '../ui/ColumnFilter';
import { OmAlertCell } from './OmAlertCell';
import { PbgAlertCell } from './PbgAlertCell';
import { PriorityBadge } from './PriorityBadge';
import { ProgressBar } from './ProgressBar';
import { ProjectProfileModal } from './ProjectProfileModal';
import { StatusBadge } from './StatusBadge';

/** Columns match the reference JSX register (with schema-backed field names). */
export interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  minWidth?: number;
  defaultVisible?: boolean;
  render: (row: ProjectListItem, index: number, ctx: LookupCtx) => React.ReactNode;
  sortValue?: (row: ProjectListItem) => string | number | null;
  /** Plain-text/number value used by the Excel/PDF export (render() returns JSX, so exports need their own accessor). */
  exportValue?: (row: ProjectListItem, ctx: LookupCtx, index: number) => string | number;
}

export interface LookupCtx {
  sectorById: Map<number, string>;
  districtById: Map<number, string>;
  schemeById: Map<number, string>;
  divisionById: Map<number, { name: string; regionName: string }>;
}

/** Mirrors PbgAlertCell's label logic in plain text, for export. */
function pbgAlertExportLabel(row: ProjectListItem): string {
  if (!row.pbgExpiryDate) return '—';
  const days = daysBetween(new Date(), row.pbgExpiryDate);
  if (days < 0 || days > 30) return '—';
  return days === 0 ? 'Expires TODAY' : `Expiring in ${days}d`;
}

/** Mirrors OmAlertCell's label logic in plain text, for export. */
function omAlertExportLabel(row: ProjectListItem): string {
  if (row.status !== 'Completed' || !row.omApplicable || !row.omStartDate) return '—';
  const endDate = row.omEndDate
    ? new Date(row.omEndDate)
    : row.omPeriodMonths !== null && row.omPeriodMonths !== undefined
      ? (() => {
          const d = new Date(row.omStartDate as string);
          d.setMonth(d.getMonth() + Math.round(row.omPeriodMonths as number));
          return d;
        })()
      : null;
  const daysLeft = endDate ? daysBetween(new Date(), endDate) : null;
  let status: string | null = row.omStatusOverride ?? null;
  if (!status && daysLeft !== null) {
    const startDate = row.omStartDate ? new Date(row.omStartDate) : null;
    if (startDate && new Date() < startDate) status = 'Not Started';
    else if (daysLeft < 0) status = 'Expired';
    else if (daysLeft <= 30) status = 'Expiring Soon';
    else status = 'Ongoing';
  }
  if (!status) return '—';
  if (status === 'Expired' && daysLeft !== null) return `Expired ${Math.abs(daysLeft)}d ago`;
  if (status === 'Expiring Soon' && daysLeft !== null) return `${daysLeft}d left`;
  return status;
}

const COLUMNS: Column[] = [
  {
    key: 'sno',
    label: 'S.No.',
    align: 'center',
    minWidth: 50,
    defaultVisible: true,
    render: (_r, i) => <span className="text-[#9CA3AF] tabular-nums">{i + 1}</span>,
    exportValue: (_r, _ctx, i) => i + 1,
  },
  {
    key: 'projectName',
    label: 'Project Name',
    minWidth: 220,
    defaultVisible: true,
    render: (r) => (
      <span className="font-semibold text-[#1D4ED8]">{r.projectName || '—'}</span>
    ),
    sortValue: (r) => r.projectName,
    exportValue: (r) => r.projectName || '—',
  },
  {
    key: 'city',
    label: 'City',
    minWidth: 100,
    defaultVisible: true,
    render: (r) => r.city ?? '—',
    sortValue: (r) => r.city,
    exportValue: (r) => r.city ?? '—',
  },
  {
    key: 'district',
    label: 'District',
    minWidth: 110,
    defaultVisible: true,
    render: (r, _i, ctx) =>
      r.districtId ? (ctx.districtById.get(r.districtId) ?? '—') : '—',
    sortValue: (r) => r.districtId,
    exportValue: (r, ctx) => (r.districtId ? (ctx.districtById.get(r.districtId) ?? '—') : '—'),
  },
  {
    key: 'division',
    label: 'Division',
    minWidth: 130,
    defaultVisible: true,
    render: (r, _i, ctx) =>
      r.divisionId ? (ctx.divisionById.get(r.divisionId)?.name ?? '—') : '—',
    sortValue: (r) => r.divisionId,
    exportValue: (r, ctx) => (r.divisionId ? (ctx.divisionById.get(r.divisionId)?.name ?? '—') : '—'),
  },
  {
    key: 'region',
    label: 'Region',
    minWidth: 110,
    defaultVisible: false,
    render: (r, _i, ctx) =>
      r.divisionId ? (ctx.divisionById.get(r.divisionId)?.regionName ?? '—') : '—',
    // Sort proxies on divisionId (South Bihar IDs precede North Bihar per the
    // migration insert order) so we don't need lookup ctx in sortValue.
    sortValue: (r) => r.divisionId,
    exportValue: (r, ctx) => (r.divisionId ? (ctx.divisionById.get(r.divisionId)?.regionName ?? '—') : '—'),
  },
  {
    key: 'contractor',
    label: 'Contractor',
    minWidth: 160,
    defaultVisible: true,
    render: (r) => (r.contractor ? <span className="truncate">{r.contractor}</span> : '—'),
    sortValue: (r) => r.contractor,
    exportValue: (r) => r.contractor ?? '—',
  },
  {
    key: 'pd',
    label: 'PD',
    minWidth: 90,
    defaultVisible: false,
    render: (r) => r.pd ?? '—',
    sortValue: (r) => r.pd,
    exportValue: (r) => r.pd ?? '—',
  },
  {
    key: 'sectorName',
    label: 'Sector',
    minWidth: 110,
    defaultVisible: true,
    render: (r, _i, ctx) => (r.sectorId ? (ctx.sectorById.get(r.sectorId) ?? '—') : '—'),
    sortValue: (r) => r.sectorId,
    exportValue: (r, ctx) => (r.sectorId ? (ctx.sectorById.get(r.sectorId) ?? '—') : '—'),
  },
  {
    key: 'schemes',
    label: 'Scheme(s)',
    minWidth: 180,
    defaultVisible: true,
    render: (r, _i, ctx) => {
      if (!r.schemes || r.schemes.length === 0) return <span className="text-[#D1D5DB]">—</span>;
      const names = r.schemes.map((id) => ctx.schemeById.get(id) ?? `#${id}`);
      return (
        <div className="flex flex-wrap gap-1">
          {names.map((n) => (
            <span
              key={n}
              className="inline-flex rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10.5px] font-semibold text-[#1D4ED8]"
            >
              {n}
            </span>
          ))}
        </div>
      );
    },
    sortValue: (r) => (r.schemes && r.schemes.length > 0 ? r.schemes[0] ?? null : null),
    exportValue: (r, ctx) =>
      r.schemes && r.schemes.length > 0
        ? r.schemes.map((id) => ctx.schemeById.get(id) ?? `#${id}`).join(', ')
        : '—',
  },
  // Note: 'division' + 'region' columns are inserted alongside 'district' above.
  {
    key: 'projectStageV2',
    label: 'Stage',
    minWidth: 130,
    defaultVisible: false,
    render: (r) => r.projectStageV2 ?? '—',
    sortValue: (r) => r.projectStageV2,
    exportValue: (r) => r.projectStageV2 ?? '—',
  },
  {
    key: 'contractType',
    label: 'Contract Type',
    minWidth: 140,
    defaultVisible: false,
    render: (r) => r.contractType ?? '—',
    sortValue: (r) => r.contractType,
    exportValue: (r) => r.contractType ?? '—',
  },
  {
    key: 'aaAmountCr',
    label: 'AA (₹ Cr.)',
    minWidth: 110,
    align: 'right',
    defaultVisible: true,
    render: (r) => <span className="tabular-nums">{formatCurrencyCr(r.aaAmountCr)}</span>,
    sortValue: (r) => r.aaAmountCr,
    exportValue: (r) => formatCurrencyCr(r.aaAmountCr),
  },
  {
    key: 'revisedAaAmountCr',
    label: 'Revised AA (₹ Cr.)',
    minWidth: 130,
    align: 'right',
    defaultVisible: false,
    render: (r) => <span className="tabular-nums">{formatCurrencyCr(r.revisedAaAmountCr)}</span>,
    sortValue: (r) => r.revisedAaAmountCr,
    exportValue: (r) => formatCurrencyCr(r.revisedAaAmountCr),
  },
  {
    key: 'agreementAmountCr',
    label: 'Agreement (₹ Cr.)',
    minWidth: 130,
    align: 'right',
    defaultVisible: true,
    render: (r) => <span className="tabular-nums">{formatCurrencyCr(r.agreementAmountCr)}</span>,
    sortValue: (r) => r.agreementAmountCr,
    exportValue: (r) => formatCurrencyCr(r.agreementAmountCr),
  },
  {
    key: 'physicalProgressPct',
    label: 'Physical %',
    minWidth: 130,
    defaultVisible: true,
    render: (r) => (
      <ProgressBar value={r.effectivePhysicalPct ?? r.physicalProgressPct} color="#1D4ED8" />
    ),
    sortValue: (r) => r.effectivePhysicalPct ?? r.physicalProgressPct,
    exportValue: (r) => formatPercent(r.effectivePhysicalPct ?? r.physicalProgressPct),
  },
  {
    key: 'financialProgressCr',
    label: 'Financial (₹ Cr.)',
    minWidth: 130,
    align: 'right',
    defaultVisible: false,
    render: (r) => <span className="tabular-nums">{formatCurrencyCr(r.financialProgressCr)}</span>,
    sortValue: (r) => r.financialProgressCr,
    exportValue: (r) => formatCurrencyCr(r.financialProgressCr),
  },
  {
    key: 'financialProgressPct',
    label: 'Financial %',
    minWidth: 130,
    defaultVisible: true,
    render: (r) => <ProgressBar value={r.financialProgressPct} color="#22C55E" />,
    sortValue: (r) => r.financialProgressPct,
    exportValue: (r) => formatPercent(r.financialProgressPct),
  },
  {
    key: 'expectedCompletion',
    label: 'Expected Completion',
    minWidth: 150,
    defaultVisible: true,
    render: (r) =>
      r.expectedCompletionDate ? formatDate(r.expectedCompletionDate) : (r.expectedCompletionRaw ?? '—'),
    sortValue: (r) => r.expectedCompletionDate,
    exportValue: (r) =>
      r.expectedCompletionDate ? formatDate(r.expectedCompletionDate) : (r.expectedCompletionRaw ?? '—'),
  },
  {
    key: 'status',
    label: 'Execution Status',
    minWidth: 140,
    defaultVisible: true,
    render: (r) => <StatusBadge status={r.status} />,
    sortValue: (r) => r.status,
    exportValue: (r) => r.status ?? '—',
  },
  {
    key: 'remark',
    label: 'Outstanding Gap',
    minWidth: 220,
    defaultVisible: true,
    render: (r) =>
      r.remark ? (
        <span className="inline-block max-w-[260px] rounded bg-[#FEF2F2] px-2 py-0.5 text-[11px] leading-snug text-[#B91C1C]">
          ⚠ {r.remark}
        </span>
      ) : (
        <span className="text-[#D1D5DB]">—</span>
      ),
    sortValue: (r) => r.remark,
    exportValue: (r) => r.remark ?? '—',
  },
  {
    key: 'priority',
    label: 'Priority',
    minWidth: 100,
    align: 'center',
    defaultVisible: true,
    render: (r) => <PriorityBadge priority={r.priority} />,
    sortValue: (r) => r.priority,
    exportValue: (r) => r.priority ?? '—',
  },
  {
    key: 'pbgAlert',
    label: 'PBG Alert',
    minWidth: 150,
    align: 'center',
    defaultVisible: true,
    render: (r) => <PbgAlertCell pbgExpiryDate={r.pbgExpiryDate} />,
    sortValue: (r) => r.pbgExpiryDate,
    exportValue: (r) => pbgAlertExportLabel(r),
  },
  {
    key: 'omAlert',
    label: 'O&M Status',
    minWidth: 150,
    align: 'center',
    defaultVisible: true,
    render: (r) => (
      <OmAlertCell
        status={r.status}
        omApplicable={r.omApplicable}
        omStartDate={r.omStartDate}
        omEndDate={r.omEndDate}
        omPeriodMonths={r.omPeriodMonths}
        omStatusOverride={r.omStatusOverride}
      />
    ),
    exportValue: (r) => omAlertExportLabel(r),
  },
  {
    key: 'geoTagging',
    label: 'GeoTag',
    minWidth: 80,
    align: 'center',
    defaultVisible: false,
    render: (r) =>
      r.geoTaggingUrl ? (
        <a
          href={r.geoTaggingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          📍 View
        </a>
      ) : (
        <span className="text-[#D1D5DB]">—</span>
      ),
    exportValue: (r) => r.geoTaggingUrl ?? '—',
  },
  {
    // NIT_addition_instructions.md §5/§6 — always show the value or the
    // "Yet to be Published" placeholder so Project Directors can spot rows
    // that still need NIT publication at a glance. Off by default (per the
    // user preference); toggle from the ⚙ Columns picker.
    key: 'nitNumber',
    label: 'NIT Number',
    minWidth: 160,
    defaultVisible: false,
    render: (r) => {
      const val = r.nitNumber;
      return val && val.trim() !== '' ? (
        <span className="text-[#111827]">{val}</span>
      ) : (
        <span className="italic text-[#B45309]">{displayNitNumber(null)}</span>
      );
    },
    sortValue: (r) => r.nitNumber,
  },
  {
    key: 'nitDate',
    label: 'NIT Date',
    minWidth: 130,
    defaultVisible: false,
    render: (r) =>
      r.nitDate ? (
        <span className="tabular-nums text-[#111827]">{formatDate(r.nitDate)}</span>
      ) : (
        <span className="italic text-[#B45309]">{displayNitDate(null)}</span>
      ),
    sortValue: (r) => r.nitDate,
  },
];

export const ALL_COLUMN_KEYS = COLUMNS.map((c) => c.key);

/** Same joined-names text the 'schemes' column already exports, reused for its filter. */
function schemesText(row: ProjectListItem, ctx: LookupCtx): string {
  if (!row.schemes || row.schemes.length === 0) return '';
  return row.schemes.map((id) => ctx.schemeById.get(id) ?? `#${id}`).join(', ');
}

/** Mirrors the Project Stage / Contract Type / Execution Status / Priority
 *  option lists already used by ProjectsFilterBar, for consistency. */
const STAGE_OPTIONS = ['Conceptualisation', 'Design', 'Pre-Tender', 'Tender', 'Construction', 'O&M', 'Other'];
const CONTRACT_TYPE_OPTIONS = ['Work Contract', 'Service Contract', 'O&M Contract', 'Others'];
const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Delayed'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low', 'N/A'];

type FilterConfig =
  | { kind: 'text'; getValue: (row: ProjectListItem, ctx: LookupCtx) => string | null | undefined }
  | { kind: 'min'; getValue: (row: ProjectListItem) => number | null | undefined; placeholder: string }
  | {
      kind: 'select';
      getValue: (row: ProjectListItem, ctx: LookupCtx) => string | null | undefined;
      getOptions: (ctx: LookupCtx, lookups: Lookups | undefined) => string[];
    };

/**
 * Task: Table Column Filter for Projects — matches the same per-column
 * filter behavior already on the Sectors/Schemes/Divisions/CoS-EoT/
 * Management Action/O&M tables. Lookup-backed selects (District/Division/
 * Region/Sector) filter by the resolved NAME (what the cell actually
 * displays), not the raw id. Columns not listed here (S.No., PBG/O&M alert
 * cells, GeoTag link, dates) are computed/visual/date fields, left
 * unfiltered — consistent with how the other tables treat that class of
 * column.
 */
const FILTER_CONFIG: Record<string, FilterConfig> = {
  projectName: { kind: 'text', getValue: (r) => r.projectName },
  city: { kind: 'text', getValue: (r) => r.city },
  district: {
    kind: 'select',
    getValue: (r, ctx) => (r.districtId ? (ctx.districtById.get(r.districtId) ?? null) : null),
    getOptions: (_ctx, lookups) => (lookups?.districts ?? []).map((d) => d.districtName),
  },
  division: {
    kind: 'select',
    getValue: (r, ctx) => (r.divisionId ? (ctx.divisionById.get(r.divisionId)?.name ?? null) : null),
    getOptions: (_ctx, lookups) => (lookups?.divisions ?? []).map((d) => d.divisionName),
  },
  region: {
    kind: 'select',
    getValue: (r, ctx) => (r.divisionId ? (ctx.divisionById.get(r.divisionId)?.regionName ?? null) : null),
    getOptions: (_ctx, lookups) => (lookups?.regions ?? []).map((rg) => rg.regionName),
  },
  contractor: { kind: 'text', getValue: (r) => r.contractor },
  pd: { kind: 'text', getValue: (r) => r.pd },
  sectorName: {
    kind: 'select',
    getValue: (r, ctx) => (r.sectorId ? (ctx.sectorById.get(r.sectorId) ?? null) : null),
    getOptions: (_ctx, lookups) => (lookups?.sectors ?? []).map((s) => s.sectorName),
  },
  schemes: { kind: 'text', getValue: (r, ctx) => schemesText(r, ctx) },
  projectStageV2: { kind: 'select', getValue: (r) => r.projectStageV2, getOptions: () => STAGE_OPTIONS },
  contractType: { kind: 'select', getValue: (r) => r.contractType, getOptions: () => CONTRACT_TYPE_OPTIONS },
  aaAmountCr: { kind: 'min', getValue: (r) => r.aaAmountCr, placeholder: '≥ Cr' },
  revisedAaAmountCr: { kind: 'min', getValue: (r) => r.revisedAaAmountCr, placeholder: '≥ Cr' },
  agreementAmountCr: { kind: 'min', getValue: (r) => r.agreementAmountCr, placeholder: '≥ Cr' },
  physicalProgressPct: { kind: 'min', getValue: (r) => r.effectivePhysicalPct ?? r.physicalProgressPct, placeholder: '≥ %' },
  financialProgressCr: { kind: 'min', getValue: (r) => r.financialProgressCr, placeholder: '≥ Cr' },
  financialProgressPct: { kind: 'min', getValue: (r) => r.financialProgressPct, placeholder: '≥ %' },
  status: { kind: 'select', getValue: (r) => r.status, getOptions: () => STATUS_OPTIONS },
  remark: { kind: 'text', getValue: (r) => r.remark },
  priority: { kind: 'select', getValue: (r) => r.priority, getOptions: () => PRIORITY_OPTIONS },
  nitNumber: { kind: 'text', getValue: (r) => r.nitNumber },
};

const LS_KEY = 'buidco.projects.columnVisibility.v1';

function loadVisibility(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* localStorage unavailable */
  }
  const defaults: Record<string, boolean> = {};
  for (const c of COLUMNS) defaults[c.key] = c.defaultVisible !== false;
  return defaults;
}

function saveVisibility(v: Record<string, boolean>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    /* localStorage unavailable */
  }
}

interface ProjectsTableProps {
  rows: ProjectListItem[];
  lookups: Lookups | undefined;
  isFetching?: boolean;
  /** Fetches every project matching the current filters (not just this page), for export. */
  fetchAllRows: () => Promise<ProjectListItem[]>;
}

export function ProjectsTable({ rows, lookups, isFetching, fetchAllRows }: ProjectsTableProps): JSX.Element {
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const isMd = currentUser?.role === 'MD';
  const [deleteProject, deleteState] = useDeleteProjectMutation();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => loadVisibility());
  const [showPicker, setShowPicker] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | 'pptx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>('sno');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [profileProjectId, setProfileProjectId] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(exportMenuRef, showExportMenu, () => setShowExportMenu(false));

  const handleEdit = (e: React.MouseEvent, projectId: string): void => {
    e.stopPropagation();
    navigate(`/input-sheet/${projectId}`);
  };

  const handleDelete = async (e: React.MouseEvent, row: ProjectListItem): Promise<void> => {
    e.stopPropagation();
    setDeleteError(null);
    if (!window.confirm(`Delete "${row.projectName}"? This permanently removes the project and all of its linked data (milestones, CoS/EoT, photos, etc.). This cannot be undone.`)) {
      return;
    }
    try {
      await deleteProject(row.projectId).unwrap();
    } catch {
      setDeleteError(`Could not delete "${row.projectName}". Please try again.`);
    }
  };

  // Task: Table Column Filter — each filterable column narrows the table
  // independently, combined with AND, layered on top of the existing
  // sort/visibility/download features without touching any of them.
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (key: string, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const activeFilterCount = Object.values(colFilters).filter((v) => v.trim() !== '').length;

  const ctx = useMemo<LookupCtx>(() => {
    const regionById = new Map(
      (lookups?.regions ?? []).map((r) => [r.regionId, r.regionName]),
    );
    return {
      sectorById: new Map((lookups?.sectors ?? []).map((s) => [s.sectorId, s.sectorName])),
      districtById: new Map((lookups?.districts ?? []).map((d) => [d.districtId, d.districtName])),
      schemeById: new Map((lookups?.schemes ?? []).map((s) => [s.schemeId, s.schemeName])),
      divisionById: new Map(
        (lookups?.divisions ?? []).map((d) => [
          d.divisionId,
          { name: d.divisionName, regionName: regionById.get(d.regionId) ?? '' },
        ]),
      ),
    };
  }, [lookups]);

  const matchesAllFilters = (row: ProjectListItem): boolean => {
    for (const [key, filterValue] of Object.entries(colFilters)) {
      if (filterValue.trim() === '') continue;
      const config = FILTER_CONFIG[key];
      if (!config) continue;
      if (config.kind === 'min') {
        if (!minMatches(filterValue, config.getValue(row))) return false;
      } else if (config.kind === 'select') {
        if (!selectMatches(filterValue, config.getValue(row, ctx))) return false;
      } else {
        if (!textMatches(filterValue, config.getValue(row, ctx))) return false;
      }
    }
    return true;
  };

  const filteredRows = useMemo(
    () => rows.filter(matchesAllFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesAllFilters closes over colFilters/ctx, both already deps
    [rows, colFilters, ctx],
  );

  const visibleColumns = COLUMNS.filter((c) => visibility[c.key] !== false);
  const toggle = (key: string): void => {
    setVisibility((prev) => {
      const next = { ...prev, [key]: !(prev[key] !== false) };
      saveVisibility(next);
      return next;
    });
  };
  const setAllVisibility = (val: boolean): void => {
    const next: Record<string, boolean> = {};
    for (const c of COLUMNS) next[c.key] = val;
    setVisibility(next);
    saveVisibility(next);
  };

  const sortedRows = useMemo(() => {
    if (sortKey === 'sno') return filteredRows;
    const col = COLUMNS.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filteredRows;
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  const onSort = (key: string): void => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const arrow = (key: string): string => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const runExport = async (format: 'excel' | 'pdf' | 'pptx'): Promise<void> => {
    setShowExportMenu(false);
    setExportError(null);
    setExporting(format);
    try {
      // Column filters apply to the export too, same as visible columns —
      // fetchAllRows() bypasses pagination but not the user's column filters.
      const allRows = (await fetchAllRows()).filter(matchesAllFilters);
      if (format === 'excel') await downloadProjectsExcel(visibleColumns, allRows, ctx);
      else if (format === 'pdf') await downloadProjectsPdf(visibleColumns, allRows, ctx);
      else await downloadProjectsPptx(visibleColumns, allRows, ctx);
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const exportingLabel =
    exporting === 'excel' ? 'Excel' : exporting === 'pdf' ? 'PDF' : exporting === 'pptx' ? 'PowerPoint' : '';

  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#F3F4F6] px-3 py-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
          {activeFilterCount > 0
            ? `${filteredRows.length} of ${rows.length} project${rows.length === 1 ? '' : 's'} match ${activeFilterCount} column filter${activeFilterCount === 1 ? '' : 's'}`
            : `${rows.length} project${rows.length === 1 ? '' : 's'} on this page`}
          {isFetching ? ' · refreshing…' : ''}
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={() => setColFilters({})}
              className="ml-2 normal-case text-[#B91C1C] hover:underline"
            >
              Clear column filters
            </button>
          ) : null}
          {exportError ? <span className="ml-2 normal-case text-[#B91C1C]">{exportError}</span> : null}
          {deleteError ? <span className="ml-2 normal-case text-[#B91C1C]">{deleteError}</span> : null}
        </span>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportMenu((p) => !p)}
              aria-expanded={showExportMenu}
              disabled={exporting !== null}
            >
              {exporting ? `Exporting ${exportingLabel}…` : '⬇ Download'}
            </Button>
            {showExportMenu ? (
              <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-[#E5E7EB] bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => void runExport('excel')}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-[#374151] hover:bg-[#F3F4F6]"
                >
                  Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => void runExport('pdf')}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-[#374151] hover:bg-[#F3F4F6]"
                >
                  PDF (.pdf)
                </button>
                <button
                  type="button"
                  onClick={() => void runExport('pptx')}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-[#374151] hover:bg-[#F3F4F6]"
                >
                  PowerPoint (.pptx)
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPicker((p) => !p)}
              aria-expanded={showPicker}
            >
              ⚙ Columns ({visibleColumns.length}/{COLUMNS.length})
            </Button>
            {showPicker ? (
              <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-[#374151]">
                  Column visibility
                  <div className="flex gap-1">
                    <Button variant="ghost" size="xs" onClick={() => setAllVisibility(true)}>
                      Show all
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setAllVisibility(false)}>
                      Hide all
                    </Button>
                  </div>
                </div>
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {COLUMNS.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 text-xs text-[#374151]">
                      <input
                        type="checkbox"
                        checked={visibility[c.key] !== false}
                        onChange={() => toggle(c.key)}
                        className="h-3.5 w-3.5"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        {/* min-w-[960px]: on phones/tablets the many-column table would squish
            below readability. Force a min width so the wrapper scrolls
            horizontally instead. */}
        <table className="w-full min-w-[960px] border-collapse text-xs">
          <thead className="bg-[#F9FAFB]">
            <tr>
              {visibleColumns.map((c) => {
                const filter = FILTER_CONFIG[c.key];
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      'sticky top-0 z-10 whitespace-nowrap align-top border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#374151]',
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    )}
                    style={c.minWidth ? { minWidth: c.minWidth } : undefined}
                  >
                    <div>
                      {c.sortValue ? (
                        <button
                          type="button"
                          onClick={() => onSort(c.key)}
                          className="cursor-pointer hover:text-[#1E3A5F]"
                        >
                          {c.label}
                          <span aria-hidden>{arrow(c.key)}</span>
                        </button>
                      ) : (
                        c.label
                      )}
                    </div>
                    {filter ? (
                      filter.kind === 'select' ? (
                        <ColumnFilterSelect
                          value={colFilters[c.key] ?? ''}
                          onChange={(v) => setColFilter(c.key, v)}
                          options={filter.getOptions(ctx, lookups).map((o) => ({ value: o, label: o }))}
                        />
                      ) : (
                        <ColumnFilterText
                          value={colFilters[c.key] ?? ''}
                          onChange={(v) => setColFilter(c.key, v)}
                          align={c.align === 'right' ? 'right' : 'left'}
                          {...(filter.kind === 'min' ? { placeholder: filter.placeholder } : {})}
                        />
                      )
                    ) : null}
                  </th>
                );
              })}
              {isMd ? (
                <th
                  scope="col"
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-[#374151]"
                >
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (isMd ? 1 : 0)} className="px-3 py-10 text-center text-[#6B7280]">
                  No projects match your filters.
                </td>
              </tr>
            ) : (
              sortedRows.map((row, i) => (
                <tr
                  key={row.projectId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setProfileProjectId(row.projectId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setProfileProjectId(row.projectId);
                    }
                  }}
                  className="cursor-pointer border-b border-[#F3F4F6] hover:bg-[#F0F7FF] focus:bg-[#EFF6FF] focus:outline-none"
                >
                  {visibleColumns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'whitespace-nowrap px-3 py-2 align-middle text-[12px] text-[#374151]',
                        c.align === 'right'
                          ? 'text-right'
                          : c.align === 'center'
                            ? 'text-center'
                            : 'text-left',
                      )}
                    >
                      {c.render(row, i, ctx)}
                    </td>
                  ))}
                  {isMd ? (
                    <td className="whitespace-nowrap px-3 py-2 align-middle text-[12px]">
                      <div className="flex items-center gap-1">
                        <Button size="xs" variant="outline" onClick={(e) => handleEdit(e, row.projectId)}>
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={(e) => void handleDelete(e, row)}
                          disabled={deleteState.isLoading}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ProjectProfileModal
        projectId={profileProjectId}
        onClose={() => setProfileProjectId(null)}
      />
    </div>
  );
}
