import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGetLookupsQuery } from '../../app/api/lookupsApi';
import { useGetDelayStatusQuery } from '../../app/api/kpisApi';
import { useGetProjectQuery, useListProjectsQuery } from '../../app/api/projectsApi';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { OmAlertCell } from '../projects/OmAlertCell';
import { PbgAlertCell } from '../projects/PbgAlertCell';
import { PriorityBadge } from '../projects/PriorityBadge';
import { ProgressBar } from '../projects/ProgressBar';
import { StatusBadge } from '../projects/StatusBadge';
import type { Lookups, ProjectDetail, ProjectListItem } from '../../types/api';
import { useClickOutside } from '../../hooks/useClickOutside';
import { cn } from '../../lib/utils';
import { formatCurrencyCr, formatDate, formatPercent } from '../../lib/formatters';
import { downloadProjectPdf, downloadProjectPptx } from '../../lib/mdProjectExport';
import { RemarksButton, RemarksDialog } from '../projects/RemarksDialog';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches } from '../ui/ColumnFilter';
import {
  ALL_PROJECT_KEYS,
  PROJECT_FIELD_GROUPS,
  PROJECT_FIELD_ORDER,
  DEFAULT_PROJECT_VIS,
  type ProjectFieldKey,
} from '../../lib/mdProjectFields';
import type { LookupCtx } from '../projects/ProjectsTable';

// ── Status filter options (mirrors projectStatuses enum on the backend) ─────
const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Delayed'] as const;

// ── Draggable divider bounds (per user's answer: min 320px each, 25–75%) ────
const DIVIDER_MIN_PX = 320;
const DIVIDER_MIN_PCT = 25;
const DIVIDER_MAX_PCT = 75;
const LS_DIVIDER_KEY = 'buidco_md_popup_divider_pct_v1';

function loadDividerPct(): number {
  try {
    const raw = localStorage.getItem(LS_DIVIDER_KEY);
    if (!raw) return 42;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < DIVIDER_MIN_PCT || v > DIVIDER_MAX_PCT) return 42;
    return v;
  } catch {
    return 42;
  }
}
function saveDividerPct(v: number): void {
  try { localStorage.setItem(LS_DIVIDER_KEY, String(v)); } catch { /* quota */ }
}

// ── Left-side KPI field catalog ──────────────────────────────────────────────
type KpiKey =
  | 'total' | 'completed' | 'inProgress' | 'delayed' | 'onHold' | 'notStarted'
  | 'avgPhysicalPct' | 'avgFinancialPct' | 'financialUtilisationPct'
  | 'totalAaCr' | 'totalFinancialCr'
  | 'needsAttention';

interface KpiFieldDef { key: KpiKey; label: string; defaultOn: boolean }
interface KpiGroupDef { group: string; fields: KpiFieldDef[] }

const KPI_GROUPS: KpiGroupDef[] = [
  {
    group: 'Status Breakdown',
    fields: [
      { key: 'total',       label: 'Total Projects', defaultOn: true },
      { key: 'completed',   label: 'Completed',       defaultOn: true },
      { key: 'inProgress',  label: 'In Progress',     defaultOn: true },
      { key: 'delayed',     label: 'Delayed',         defaultOn: true },
      { key: 'onHold',      label: 'On Hold',         defaultOn: false },
      { key: 'notStarted',  label: 'Not Started',     defaultOn: false },
    ],
  },
  {
    group: 'Progress Metrics',
    fields: [
      { key: 'avgPhysicalPct',           label: 'Avg Physical %',         defaultOn: true },
      { key: 'avgFinancialPct',          label: 'Avg Financial %',        defaultOn: true },
      { key: 'financialUtilisationPct',  label: 'Financial Utilisation %', defaultOn: true },
    ],
  },
  {
    group: 'Financial Totals',
    fields: [
      { key: 'totalAaCr',        label: 'Total Sanctioned (₹ Cr)', defaultOn: false },
      { key: 'totalFinancialCr', label: 'Total Spent (₹ Cr)',      defaultOn: false },
    ],
  },
  {
    group: 'Additional Insight',
    fields: [
      { key: 'needsAttention', label: 'Needs-Attention List', defaultOn: false },
    ],
  },
];

const ALL_KPI_KEYS = KPI_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
const DEFAULT_KPI_VIS = Object.fromEntries(
  KPI_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f.defaultOn])),
) as Record<KpiKey, boolean>;

// ── Right-side project-list column catalog ───────────────────────────────────
type ColKey =
  | 'projectName' | 'city' | 'district' | 'division' | 'region' | 'contractor' | 'pd' | 'sector' | 'schemes'
  | 'aaAmount' | 'agreementAmount' | 'physicalProgress'
  | 'financialProgressCr' | 'financialProgressPct'
  | 'expectedCompletion' | 'status' | 'contractType' | 'outstandingGap' | 'priority'
  | 'pbgAlert' | 'omStatus' | 'remarks';

interface ColDef { key: ColKey; label: string; defaultOn: boolean; locked?: boolean }

const COLUMN_DEFS: ColDef[] = [
  { key: 'projectName',         label: 'Project Name',         defaultOn: true, locked: true },
  { key: 'city',                label: 'City',                 defaultOn: false },
  { key: 'district',            label: 'District',             defaultOn: true  },
  { key: 'division',            label: 'Division',             defaultOn: true  },
  { key: 'region',              label: 'Region',               defaultOn: false },
  { key: 'contractor',          label: 'Contractor',           defaultOn: false },
  { key: 'pd',                  label: 'PD',                   defaultOn: false },
  { key: 'sector',              label: 'Sector',               defaultOn: false },
  { key: 'schemes',             label: 'Scheme(s)',            defaultOn: false },
  { key: 'aaAmount',            label: 'AA Amount (₹ Cr)',      defaultOn: false },
  { key: 'agreementAmount',     label: 'Agreement Amount (₹ Cr)', defaultOn: false },
  { key: 'physicalProgress',    label: 'Physical %',           defaultOn: true  },
  { key: 'financialProgressCr', label: 'Financial (₹ Cr)',      defaultOn: false },
  { key: 'financialProgressPct',label: 'Financial %',          defaultOn: false },
  { key: 'expectedCompletion',  label: 'Expected Completion',   defaultOn: true  },
  { key: 'status',              label: 'Execution Status',      defaultOn: false },
  { key: 'contractType',        label: 'Contract Type',         defaultOn: false },
  { key: 'outstandingGap',      label: 'Outstanding Gap',       defaultOn: false },
  { key: 'priority',            label: 'Priority',              defaultOn: true  },
  { key: 'pbgAlert',            label: 'PBG Alert',             defaultOn: false },
  { key: 'omStatus',            label: 'O&M Status',            defaultOn: false },
  { key: 'remarks',             label: 'Remarks',               defaultOn: false },
];

const DEFAULT_COL_VIS = Object.fromEntries(
  COLUMN_DEFS.map((c) => [c.key, c.defaultOn]),
) as Record<ColKey, boolean>;

// ── Project-detail field catalog (per Enhance MD Portfolio Briefing spec §3) ─
// Moved to lib/mdProjectFields.ts so the PDF/PPTX export module can share it
// without importing this component (would create a circular import).

// ── localStorage helpers (buidco_md_popup_*_v1 per spec §7) ──────────────────
const LS_KPI_KEY  = 'buidco_md_popup_left_fields_v1';
const LS_COLS_KEY = 'buidco_md_popup_right_columns_v1';
const LS_PROJ_KEY = 'buidco_md_popup_project_fields_v1';

function loadVis<K extends string>(
  storageKey: string,
  defaults: Record<K, boolean>,
): Record<K, boolean> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaults };
    return { ...defaults, ...(JSON.parse(raw) as Partial<Record<K, boolean>>) };
  } catch {
    return { ...defaults };
  }
}
function saveVis<K extends string>(storageKey: string, v: Record<K, boolean>): void {
  try { localStorage.setItem(storageKey, JSON.stringify(v)); } catch { /* quota */ }
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
}

// ── Main component ───────────────────────────────────────────────────────────
export function MdSchemeSummaryModal({ open, onClose }: Props): JSX.Element | null {
  const lookupsQuery  = useGetLookupsQuery(undefined, { skip: !open });

  // Filter row — all four combine to narrow the project list AND the aggregate
  // KPIs on the left (client-side aggregate of the visible list per user's
  // answer to Q1 during spec review).
  const [filterSchemeId,   setFilterSchemeId]   = useState<number | null>(null);
  const [filterSectorId,   setFilterSectorId]   = useState<number | null>(null);
  const [filterDivisionId, setFilterDivisionId] = useState<number | null>(null);
  const [filterStatus,     setFilterStatus]     = useState<string | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [openPicker, setOpenPicker]           = useState<null | 'kpi' | 'cols' | 'proj'>(null);
  const [colSearch, setColSearch]             = useState('');
  const [kpiSearch, setKpiSearch]             = useState('');
  const [projSearch, setProjSearch]           = useState('');
  const [kpiVis, setKpiVis]                   = useState<Record<KpiKey, boolean>>(() =>
    loadVis(LS_KPI_KEY, DEFAULT_KPI_VIS),
  );
  const [colVis, setColVis]                   = useState<Record<ColKey, boolean>>(() =>
    loadVis(LS_COLS_KEY, DEFAULT_COL_VIS),
  );
  const [projVis, setProjVis]                 = useState<Record<ProjectFieldKey, boolean>>(() =>
    loadVis(LS_PROJ_KEY, DEFAULT_PROJECT_VIS),
  );
  const [leftPct, setLeftPct] = useState<number>(() => loadDividerPct());
  const [showMdExportMenu, setShowMdExportMenu] = useState(false);
  const [mdExporting, setMdExporting]           = useState<'pdf' | 'pptx' | null>(null);
  const [mdExportError, setMdExportError]       = useState<string | null>(null);
  const [remarksProject, setRemarksProject]     = useState<ProjectListItem | null>(null);
  const bodyRef  = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mdExportMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(mdExportMenuRef, showMdExportMenu, () => setShowMdExportMenu(false));

  // Project list — server-filtered by the 4 filter dropdowns. Fetches
  // whenever the modal is open (no more "select a scheme first" gate). Limit
  // caps at the backend max (100). If more matched, the aggregate KPIs on
  // the left panel reflect this visible slice — noted on the KPI header.
  const projectsQuery = useListProjectsQuery(
    open
      ? {
          limit: 100,
          ...(filterSchemeId   ? { schemeId:   filterSchemeId   } : {}),
          ...(filterSectorId   ? { sectorId:   filterSectorId   } : {}),
          ...(filterDivisionId ? { divisionId: filterDivisionId } : {}),
          ...(filterStatus     ? { status:     filterStatus     } : {}),
        }
      : { limit: 1 },
    { skip: !open },
  );

  // Delay status — only fetched when the Needs-Attention insight is on.
  const delayQuery = useGetDelayStatusQuery(undefined, {
    skip: !open || !kpiVis.needsAttention,
  });

  // Full ProjectDetail — needed for core fields (Name of Work, Agreement Number,
  // Agreement Date) that aren't on the light ProjectListItem.
  const projectDetailQuery = useGetProjectQuery(activeProjectId ?? '', {
    skip: !open || activeProjectId === null,
  });

  // ── Escape → picker → project → modal ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (openPicker)      { setOpenPicker(null);     return; }
      if (activeProjectId) { setActiveProjectId(null); return; }
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, openPicker, activeProjectId, onClose]);

  // Any filter change clears the drilled-in project (it may have just been
  // filtered out of view).
  useEffect(() => {
    setActiveProjectId(null);
  }, [filterSchemeId, filterSectorId, filterDivisionId, filterStatus]);

  // ── Draggable divider handlers ──
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent): void => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    if (!open) return;
    const move = (clientX: number): void => {
      if (!draggingRef.current || !bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      const rawPct = ((clientX - rect.left) / rect.width) * 100;
      // Enforce both the % swing (25–75) and the 320px minimum on each side.
      const minPctFromPx = (DIVIDER_MIN_PX / rect.width) * 100;
      const maxPctFromPx = 100 - minPctFromPx;
      const min = Math.max(DIVIDER_MIN_PCT, minPctFromPx);
      const max = Math.min(DIVIDER_MAX_PCT, maxPctFromPx);
      const clamped = Math.min(max, Math.max(min, rawPct));
      setLeftPct(clamped);
    };
    const onMouseMove = (e: MouseEvent): void => move(e.clientX);
    const onTouchMove = (e: TouchEvent): void => {
      const t = e.touches[0];
      if (t) move(t.clientX);
    };
    const stop = (): void => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLeftPct((v) => { saveDividerPct(v); return v; });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   stop);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend',  stop);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   stop);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend',  stop);
    };
  }, [open]);

  // ── Body scroll lock while modal is open ──
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ── Focus picker search when picker opens ──
  useEffect(() => {
    if (openPicker) setTimeout(() => searchRef.current?.focus(), 60);
  }, [openPicker]);

  // ── Derived state ──
  const projects = projectsQuery.data?.items ?? [];
  const activeProject = activeProjectId
    ? projects.find((p) => p.projectId === activeProjectId) ?? null
    : null;
  const hasAnyFilter =
    filterSchemeId !== null || filterSectorId !== null ||
    filterDivisionId !== null || filterStatus !== null;
  const hitCap = projects.length >= 100;

  const districtsById = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of lookupsQuery.data?.districts ?? []) m.set(d.districtId, d.districtName);
    return m;
  }, [lookupsQuery.data]);
  const sectorsById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of lookupsQuery.data?.sectors ?? []) m.set(s.sectorId, s.sectorName);
    return m;
  }, [lookupsQuery.data]);
  const schemesById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of lookupsQuery.data?.schemes ?? []) m.set(s.schemeId, s.schemeName);
    return m;
  }, [lookupsQuery.data]);
  const divisionsById = useMemo(() => {
    const regionById = new Map(
      (lookupsQuery.data?.regions ?? []).map((r) => [r.regionId, r.regionName]),
    );
    const m = new Map<number, { name: string; regionName: string }>();
    for (const d of lookupsQuery.data?.divisions ?? []) {
      m.set(d.divisionId, { name: d.divisionName, regionName: regionById.get(d.regionId) ?? '' });
    }
    return m;
  }, [lookupsQuery.data]);

  // Export the active project's currently-ticked fields as PDF/PowerPoint.
  // Waits for the full ProjectDetail fetch so extras-only fields (agreement
  // number, sponsoring dept, etc.) aren't exported blank while still loading.
  const runMdExport = async (format: 'pdf' | 'pptx'): Promise<void> => {
    if (!activeProject) return;
    setShowMdExportMenu(false);
    setMdExportError(null);
    setMdExporting(format);
    try {
      const visibleKeys = PROJECT_FIELD_ORDER.filter((k) => projVis[k]);
      const ctx: LookupCtx = {
        districtById: districtsById,
        divisionById: divisionsById,
        sectorById: sectorsById,
        schemeById: schemesById,
      };
      const asDetail = projectDetailQuery.data ?? null;
      if (format === 'pdf') await downloadProjectPdf(visibleKeys, activeProject, asDetail, ctx);
      else await downloadProjectPptx(visibleKeys, activeProject, asDetail, ctx);
    } catch {
      setMdExportError('Export failed. Please try again.');
    } finally {
      setMdExporting(null);
    }
  };

  // Sort projects: High priority first, then Delayed first, then nearest expected date
  const sortedProjects = useMemo(() => {
    const priorityWeight = (p: string | null): number =>
      p === 'High' ? 0 : p === 'Medium' ? 1 : p === 'Low' ? 2 : 3;
    const statusWeight = (s: string | null): number =>
      s === 'Delayed' ? 0 : s === 'In Progress' ? 1 : s === 'On Hold' ? 2 :
      s === 'Not Started' ? 3 : s === 'Completed' ? 4 : 5;
    return [...projects].sort((a, b) => {
      const pd = priorityWeight(a.priority) - priorityWeight(b.priority);
      if (pd !== 0) return pd;
      const sd = statusWeight(a.status) - statusWeight(b.status);
      if (sd !== 0) return sd;
      const ax = a.expectedCompletionDate ?? '9999-12-31';
      const bx = b.expectedCompletionDate ?? '9999-12-31';
      return ax.localeCompare(bx);
    });
  }, [projects]);

  // Aggregate KPIs computed client-side from the currently-filtered project
  // set (per user's answer to Q1). If the backend returned the max page
  // (100 rows), aggregates cover that visible slice — flagged in the header.
  const aggregate = useMemo(() => {
    const avg = (nums: Array<number | null>): number | null => {
      const clean = nums.filter((n): n is number => typeof n === 'number');
      if (clean.length === 0) return null;
      return Math.round((clean.reduce((s, n) => s + n, 0) / clean.length) * 10) / 10;
    };
    const sum = (nums: Array<number | null>): number =>
      nums.reduce<number>((s, n) => s + (n ?? 0), 0);

    const totalAa    = Math.round(sum(projects.map((p) => p.aaAmountCr)) * 100) / 100;
    const totalSpent = Math.round(sum(projects.map((p) => p.financialProgressCr)) * 100) / 100;
    return {
      total:       projects.length,
      completed:   projects.filter((p) => p.status === 'Completed').length,
      inProgress:  projects.filter((p) => p.status === 'In Progress').length,
      delayed:     projects.filter((p) => p.status === 'Delayed').length,
      onHold:      projects.filter((p) => p.status === 'On Hold').length,
      notStarted:  projects.filter((p) => p.status === 'Not Started').length,
      avgPhysicalPct: avg(projects.map((p) => p.effectivePhysicalPct ?? p.physicalProgressPct)),
      avgFinancialPct: avg(projects.map((p) => p.financialProgressPct)),
      financialUtilisationPct: totalAa > 0
        ? Math.round((totalSpent / totalAa) * 1000) / 10
        : null,
      totalAaCr: totalAa,
      totalFinancialCr: totalSpent,
    };
  }, [projects]);

  const needsAttentionList = useMemo(() => {
    if (!kpiVis.needsAttention) return [];
    const visibleIds = new Set(projects.map((p) => p.projectId));
    const delayed = (delayQuery.data?.items ?? [])
      .filter((d) => visibleIds.has(d.projectId))
      .filter((d) => (d.uncoveredDelayDays ?? 0) > 0)
      .sort((a, b) => (b.uncoveredDelayDays ?? 0) - (a.uncoveredDelayDays ?? 0))
      .map((d) => ({
        projectId: d.projectId,
        projectName: d.projectName ?? '—',
        uncoveredDelayDays: d.uncoveredDelayDays,
      }));
    if (delayed.length >= 3) return delayed.slice(0, 3);
    const highPri = projects
      .filter((p) => p.priority === 'High' && !delayed.some((d) => d.projectId === p.projectId))
      .map((p) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        uncoveredDelayDays: null as number | null,
      }));
    return [...delayed, ...highPri].slice(0, 3);
  }, [kpiVis.needsAttention, projects, delayQuery.data]);

  // Picker filtering
  const filteredKpiGroups = KPI_GROUPS
    .map((g) => ({
      ...g,
      fields: g.fields.filter(
        (f) => !kpiSearch || f.label.toLowerCase().includes(kpiSearch.toLowerCase()),
      ),
    }))
    .filter((g) => g.fields.length > 0);

  const filteredCols = COLUMN_DEFS.filter(
    (c) => !colSearch || c.label.toLowerCase().includes(colSearch.toLowerCase()),
  );

  const filteredProjGroups = PROJECT_FIELD_GROUPS
    .map((g) => ({
      ...g,
      fields: g.fields.filter(
        (f) => !projSearch || f.label.toLowerCase().includes(projSearch.toLowerCase()),
      ),
    }))
    .filter((g) => g.fields.length > 0);

  // Visible column list (order preserved, projectName always first)
  const visibleCols = COLUMN_DEFS.filter((c) => c.locked || colVis[c.key]);

  // Any visible left field?
  const anyKpiOn = ALL_KPI_KEYS.some((k) => kpiVis[k]);

  const toggleKpi = (k: KpiKey): void => {
    setKpiVis((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      saveVis(LS_KPI_KEY, next);
      return next;
    });
  };
  const toggleCol = (k: ColKey): void => {
    setColVis((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      saveVis(LS_COLS_KEY, next);
      return next;
    });
  };
  const setAllKpi = (v: boolean): void => {
    const next = Object.fromEntries(ALL_KPI_KEYS.map((k) => [k, v])) as Record<KpiKey, boolean>;
    setKpiVis(next); saveVis(LS_KPI_KEY, next);
  };
  const setAllCols = (v: boolean): void => {
    const next = Object.fromEntries(
      COLUMN_DEFS.map((c) => [c.key, c.locked ? true : v]),
    ) as Record<ColKey, boolean>;
    setColVis(next); saveVis(LS_COLS_KEY, next);
  };
  const toggleProj = (k: ProjectFieldKey): void => {
    setProjVis((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      saveVis(LS_PROJ_KEY, next);
      return next;
    });
  };
  const setAllProj = (v: boolean): void => {
    const next = Object.fromEntries(ALL_PROJECT_KEYS.map((k) => [k, v])) as Record<ProjectFieldKey, boolean>;
    setProjVis(next); saveVis(LS_PROJ_KEY, next);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="MD Scheme Summary"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative flex flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xl"
        style={{ width: '95vw', maxWidth: '1800px', height: 'min(92vh, 1000px)' }}
      >
        {/* ── Gradient header (matches ProjectProfileModal) ────────────── */}
        <header
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5"
          style={{ background: 'linear-gradient(100deg,#1E3A5F 0%,#2563EB 100%)' }}
        >
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#93C5FD]">
              📊 MD Portfolio Briefing
            </p>
            <h2 className="mt-0.5 text-[15px] font-bold text-white">Scheme Summary</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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

        {/* ── Body: two panels — resizable via draggable divider on lg+ ─── */}
        <div
          ref={bodyRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
          style={{ ['--left-pct' as string]: `${leftPct}%` } as React.CSSProperties}
        >
          {/* LEFT — Portfolio KPIs OR active-project details */}
          <section
            className="flex min-h-0 min-w-0 shrink-0 flex-col border-b border-[#E5E7EB] lg:border-b-0 lg:w-[var(--left-pct)]"
            data-panel="left"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2.5">
              <span className="truncate text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                {activeProject
                  ? 'Project Snapshot'
                  : hasAnyFilter
                    ? `Portfolio KPIs · Filtered${hitCap ? ' (top 100)' : ''}`
                    : 'Portfolio KPIs · All Projects'}
                {activeProject && mdExportError ? (
                  <span className="ml-2 normal-case text-[#B91C1C]">{mdExportError}</span>
                ) : null}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {activeProject ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveProjectId(null)}
                      className="rounded-md border border-[#D1D5DB] bg-white px-2 py-1 text-[10.5px] font-semibold text-[#374151] hover:bg-[#F3F4F6]"
                    >
                      ← Back to KPIs
                    </button>
                    <div className="relative" ref={mdExportMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowMdExportMenu((v) => !v)}
                        title="Download the selected project's ticked fields"
                        aria-expanded={showMdExportMenu}
                        disabled={mdExporting !== null || projectDetailQuery.isLoading}
                        className="rounded-md border border-[#D1D5DB] bg-white px-2 py-1 text-[10.5px] font-semibold text-[#374151] hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {mdExporting
                          ? `Exporting ${mdExporting === 'pdf' ? 'PDF' : 'PowerPoint'}…`
                          : '⬇ Download'}
                      </button>
                      {showMdExportMenu ? (
                        <div className="absolute left-0 top-full z-30 mt-1 w-40 rounded-lg border border-[#E5E7EB] bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => void runMdExport('pdf')}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs text-[#374151] hover:bg-[#F3F4F6]"
                          >
                            PDF (.pdf)
                          </button>
                          <button
                            type="button"
                            onClick={() => void runMdExport('pptx')}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs text-[#374151] hover:bg-[#F3F4F6]"
                          >
                            PowerPoint (.pptx)
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenPicker(openPicker === 'proj' ? null : 'proj')}
                      title="Customise project detail fields"
                      aria-pressed={openPicker === 'proj'}
                      className={cn(
                        'rounded-md border px-2 py-1 text-[10.5px] font-semibold transition-colors',
                        openPicker === 'proj'
                          ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                          : 'border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6]',
                      )}
                    >
                      ⚙️ Fields
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenPicker(openPicker === 'kpi' ? null : 'kpi')}
                    title="Customise KPI fields"
                    aria-pressed={openPicker === 'kpi'}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[10.5px] font-semibold transition-colors',
                      openPicker === 'kpi'
                        ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                        : 'border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6]',
                    )}
                  >
                    ⚙️ Fields
                  </button>
                )}
              </div>
            </div>

            {openPicker === 'kpi' && !activeProject ? (
              <FieldPickerPanel
                title="Customise KPI Fields"
                searchValue={kpiSearch}
                onSearch={setKpiSearch}
                searchRef={searchRef}
                onShowAll={() => setAllKpi(true)}
                onHideAll={() => setAllKpi(false)}
                onDone={() => { setOpenPicker(null); setKpiSearch(''); }}
                renderBody={() =>
                  filteredKpiGroups.length === 0 ? (
                    <p className="text-[12px] text-[#9CA3AF]">No fields match.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredKpiGroups.map((g) => (
                        <div key={g.group}>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                            {g.group}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {g.fields.map((f) => (
                              <Pill
                                key={f.key}
                                on={kpiVis[f.key]}
                                onToggle={() => toggleKpi(f.key)}
                                label={f.label}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              />
            ) : null}

            {openPicker === 'proj' && activeProject ? (
              <FieldPickerPanel
                title="Customise Project Detail Fields"
                searchValue={projSearch}
                onSearch={setProjSearch}
                searchRef={searchRef}
                onShowAll={() => setAllProj(true)}
                onHideAll={() => setAllProj(false)}
                onDone={() => { setOpenPicker(null); setProjSearch(''); }}
                renderBody={() =>
                  filteredProjGroups.length === 0 ? (
                    <p className="text-[12px] text-[#9CA3AF]">No fields match.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredProjGroups.map((g) => (
                        <div key={g.group}>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                            {g.group}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {g.fields.map((f) => (
                              <Pill
                                key={f.key}
                                on={projVis[f.key]}
                                onToggle={() => toggleProj(f.key)}
                                label={f.label}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              />
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {activeProject ? (
                <ProjectDetailsBody
                  listItem={activeProject}
                  detail={projectDetailQuery.data ?? null}
                  detailLoading={projectDetailQuery.isLoading}
                  vis={projVis}
                  districtsById={districtsById}
                  divisionsById={divisionsById}
                  sectorsById={sectorsById}
                  schemesById={schemesById}
                />
              ) : projectsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : !anyKpiOn ? (
                <EmptyPanelState
                  icon="⚙️"
                  title="No KPI fields visible"
                  hint="Open the Fields picker above and turn some on."
                />
              ) : (
                <PortfolioKpiBody
                  aggregate={aggregate}
                  vis={kpiVis}
                  hasAnyFilter={hasAnyFilter}
                  hitCap={hitCap}
                  needsAttentionList={needsAttentionList}
                  needsAttentionLoading={
                    kpiVis.needsAttention && (projectsQuery.isLoading || delayQuery.isLoading)
                  }
                />
              )}
            </div>
          </section>

          {/* ── Drag divider (desktop only) ─────────────────────────────── */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
            tabIndex={0}
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            onKeyDown={(e) => {
              // Keyboard resize: ←/→ nudges 2% at a time (Home/End = min/max).
              const step = e.shiftKey ? 5 : 2;
              if (e.key === 'ArrowLeft')  { e.preventDefault(); setLeftPct((v) => { const n = Math.max(DIVIDER_MIN_PCT, v - step); saveDividerPct(n); return n; }); }
              if (e.key === 'ArrowRight') { e.preventDefault(); setLeftPct((v) => { const n = Math.min(DIVIDER_MAX_PCT, v + step); saveDividerPct(n); return n; }); }
              if (e.key === 'Home')       { e.preventDefault(); setLeftPct(() => { saveDividerPct(DIVIDER_MIN_PCT); return DIVIDER_MIN_PCT; }); }
              if (e.key === 'End')        { e.preventDefault(); setLeftPct(() => { saveDividerPct(DIVIDER_MAX_PCT); return DIVIDER_MAX_PCT; }); }
            }}
            className="group relative hidden shrink-0 cursor-col-resize items-center justify-center bg-[#E5E7EB] transition-colors hover:bg-[#93C5FD] focus:bg-[#93C5FD] focus:outline-none lg:flex lg:w-[6px]"
            title="Drag to resize"
          >
            {/* Grip dots on hover */}
            <span className="pointer-events-none absolute inset-y-0 left-1/2 hidden -translate-x-1/2 items-center gap-[2px] group-hover:flex group-focus:flex">
              <span className="h-4 w-[2px] rounded bg-white/90" />
            </span>
          </div>

          {/* RIGHT — Filter row + project list */}
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2.5">
              <span className="truncate text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                Projects {projects.length > 0 ? `· ${projects.length}${hitCap ? '+' : ''}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setOpenPicker(openPicker === 'cols' ? null : 'cols')}
                title="Customise columns"
                aria-pressed={openPicker === 'cols'}
                className={cn(
                  'shrink-0 rounded-md border px-2 py-1 text-[10.5px] font-semibold transition-colors',
                  openPicker === 'cols'
                    ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                    : 'border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6]',
                )}
              >
                ☰ Columns
              </button>
            </div>

            {openPicker === 'cols' ? (
              <FieldPickerPanel
                title="Customise Project Columns"
                searchValue={colSearch}
                onSearch={setColSearch}
                searchRef={searchRef}
                onShowAll={() => setAllCols(true)}
                onHideAll={() => setAllCols(false)}
                onDone={() => { setOpenPicker(null); setColSearch(''); }}
                renderBody={() =>
                  filteredCols.length === 0 ? (
                    <p className="text-[12px] text-[#9CA3AF]">No columns match.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {filteredCols.map((c) => (
                        <Pill
                          key={c.key}
                          on={c.locked ? true : colVis[c.key]}
                          onToggle={() => c.locked ? undefined : toggleCol(c.key)}
                          label={c.label}
                          locked={!!c.locked}
                        />
                      ))}
                    </div>
                  )
                }
              />
            ) : null}

            {/* Filter row — Scheme, Sector, Division, Status */}
            <FilterRow
              lookups={lookupsQuery.data}
              filterSchemeId={filterSchemeId}
              filterSectorId={filterSectorId}
              filterDivisionId={filterDivisionId}
              filterStatus={filterStatus}
              onSchemeChange={setFilterSchemeId}
              onSectorChange={setFilterSectorId}
              onDivisionChange={setFilterDivisionId}
              onStatusChange={setFilterStatus}
              onClearAll={() => {
                setFilterSchemeId(null); setFilterSectorId(null);
                setFilterDivisionId(null); setFilterStatus(null);
              }}
              hasAnyFilter={hasAnyFilter}
            />

            {/* Project list — scrolls both axes inside */}
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {projectsQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : sortedProjects.length === 0 ? (
                <EmptyPanelState
                  icon="📄"
                  title="No projects"
                  hint={hasAnyFilter ? 'No projects match the current filters.' : 'No projects in the register.'}
                />
              ) : (
                <ProjectList
                  projects={sortedProjects}
                  columns={visibleCols}
                  activeProjectId={activeProjectId}
                  onSelect={setActiveProjectId}
                  onOpenRemarks={setRemarksProject}
                  districtsById={districtsById}
                  divisionsById={divisionsById}
                  sectorsById={sectorsById}
                  schemesById={schemesById}
                />
              )}
            </div>
          </section>
        </div>
      </div>

      {remarksProject ? (
        <RemarksDialog
          projectId={remarksProject.projectId}
          projectName={remarksProject.projectName}
          initialRemark={remarksProject.remark}
          onClose={() => setRemarksProject(null)}
        />
      ) : null}
    </div>
  );
}

// ── LEFT panel body ──────────────────────────────────────────────────────────
interface AggregateKpis {
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  onHold: number;
  notStarted: number;
  avgPhysicalPct: number | null;
  avgFinancialPct: number | null;
  financialUtilisationPct: number | null;
  totalAaCr: number;
  totalFinancialCr: number;
}

function PortfolioKpiBody({
  aggregate, vis, hasAnyFilter, hitCap, needsAttentionList, needsAttentionLoading,
}: {
  aggregate: AggregateKpis;
  vis: Record<KpiKey, boolean>;
  hasAnyFilter: boolean;
  hitCap: boolean;
  needsAttentionList: Array<{ projectId: string; projectName: string; uncoveredDelayDays: number | null }>;
  needsAttentionLoading: boolean;
}): JSX.Element {
  const statusKeys: Array<{ k: KpiKey; label: string; value: number; tone: string }> = [
    { k: 'total',      label: 'Total',       value: aggregate.total,      tone: 'brand'   },
    { k: 'completed',  label: 'Completed',   value: aggregate.completed,  tone: 'success' },
    { k: 'inProgress', label: 'In Progress', value: aggregate.inProgress, tone: 'info'    },
    { k: 'delayed',    label: 'Delayed',     value: aggregate.delayed,    tone: 'danger'  },
    { k: 'onHold',     label: 'On Hold',     value: aggregate.onHold,     tone: 'muted'   },
    { k: 'notStarted', label: 'Not Started', value: aggregate.notStarted, tone: 'amber'   },
  ];
  const visibleStatuses = statusKeys.filter((s) => vis[s.k]);
  // Alias `aggregate` → `active` for the field bodies below to minimise churn.
  const active = aggregate;

  const showProgress =
    vis.avgPhysicalPct || vis.avgFinancialPct || vis.financialUtilisationPct;
  const showFinancial =
    vis.totalAaCr || vis.totalFinancialCr;

  return (
    <div className="space-y-4">
      {/* Header — reflects filter state (fixed chrome, always shown) */}
      <div>
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
          {hasAnyFilter ? 'Filtered Portfolio' : 'Full Portfolio'}
        </p>
        <h3 className="text-[15px] font-bold text-[#111827]">
          {aggregate.total} project{aggregate.total === 1 ? '' : 's'}
          {hitCap ? ' (showing top 100)' : ''}
        </h3>
      </div>

      {/* Status Breakdown */}
      {visibleStatuses.length > 0 ? (
        <div className={cn(
          'grid gap-2',
          visibleStatuses.length <= 2 ? 'grid-cols-2' :
          visibleStatuses.length === 3 ? 'grid-cols-3' :
          'grid-cols-2 sm:grid-cols-3',
        )}>
          {visibleStatuses.map((s) => (
            <StatusKpi key={s.k} label={s.label} value={s.value} tone={s.tone as KpiTone} />
          ))}
        </div>
      ) : null}

      {/* Progress Metrics */}
      {showProgress ? (
        <div className="space-y-2 rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-sm">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
            Progress Metrics
          </p>
          {vis.avgPhysicalPct ? (
            <ProgressRow label="Avg Physical" value={active.avgPhysicalPct} color="#1D4ED8" />
          ) : null}
          {vis.avgFinancialPct ? (
            <ProgressRow label="Avg Financial" value={active.avgFinancialPct} color="#22C55E" />
          ) : null}
          {vis.financialUtilisationPct ? (
            <ProgressRow label="Financial Utilisation" value={active.financialUtilisationPct} color="#F59E0B" />
          ) : null}
        </div>
      ) : null}

      {/* Financial Totals */}
      {showFinancial ? (
        <div className="grid grid-cols-2 gap-2">
          {vis.totalAaCr ? (
            <MoneyKpi label="Total Sanctioned" value={active.totalAaCr} tone="brand" />
          ) : null}
          {vis.totalFinancialCr ? (
            <MoneyKpi label="Total Spent" value={active.totalFinancialCr} tone="success" />
          ) : null}
        </div>
      ) : null}

      {/* Needs-Attention list */}
      {vis.needsAttention ? (
        <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 shadow-sm">
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-[#B91C1C]">
            ⚠ Needs Attention (Top 3)
          </p>
          {needsAttentionLoading ? (
            <Skeleton className="h-14 w-full" />
          ) : needsAttentionList.length === 0 ? (
            <p className="text-[12px] text-[#6B7280]">Nothing critical right now.</p>
          ) : (
            <ul className="space-y-1.5 text-[12px]">
              {needsAttentionList.map((p) => (
                <li
                  key={p.projectId}
                  className="flex items-center justify-between rounded border border-[#FCA5A5] bg-white px-2 py-1.5"
                >
                  <span className="min-w-0 truncate font-semibold text-[#111827]">
                    {p.projectName}
                  </span>
                  <span className="ml-2 shrink-0 text-[11px] font-bold text-[#B91C1C]">
                    {p.uncoveredDelayDays !== null && p.uncoveredDelayDays > 0
                      ? `${p.uncoveredDelayDays}d late`
                      : 'High priority'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── RIGHT panel: project table ───────────────────────────────────────────────
/** Which columns get a Table Column Filter, and what kind. Computed/currency/
 *  progress/date/action columns are deliberately left unfiltered, matching
 *  the precedent set by every other table's column-filter treatment. */
const FILTERABLE_COLS: Partial<Record<ColKey, 'text' | 'select'>> = {
  projectName: 'text',
  city: 'text',
  district: 'select',
  division: 'select',
  region: 'select',
  contractor: 'text',
  pd: 'text',
  sector: 'select',
  schemes: 'text',
  status: 'select',
  contractType: 'select',
  priority: 'select',
};

function colFilterValue(
  key: ColKey,
  p: ProjectListItem,
  districtsById: Map<number, string>,
  divisionsById: Map<number, { name: string; regionName: string }>,
  sectorsById: Map<number, string>,
  schemesById: Map<number, string>,
): string {
  switch (key) {
    case 'projectName': return p.projectName;
    case 'city': return p.city ?? '';
    case 'district': return (p.districtId && districtsById.get(p.districtId)) || '';
    case 'division': return (p.divisionId && divisionsById.get(p.divisionId)?.name) || '';
    case 'region': return (p.divisionId && divisionsById.get(p.divisionId)?.regionName) || '';
    case 'contractor': return p.contractor ?? '';
    case 'pd': return p.pd ?? '';
    case 'sector': return (p.sectorId && sectorsById.get(p.sectorId)) || '';
    case 'schemes': return p.schemes.map((id) => schemesById.get(id) ?? '').join(', ');
    case 'status': return p.status;
    case 'contractType': return p.contractType ?? '';
    case 'priority': return p.priority ?? '';
    default: return '';
  }
}

function ProjectList({
  projects, columns, activeProjectId, onSelect, onOpenRemarks,
  districtsById, divisionsById, sectorsById, schemesById,
}: {
  projects: ProjectListItem[];
  columns: ColDef[];
  activeProjectId: string | null;
  onSelect: (id: string) => void;
  onOpenRemarks: (project: ProjectListItem) => void;
  districtsById: Map<number, string>;
  divisionsById: Map<number, { name: string; regionName: string }>;
  sectorsById: Map<number, string>;
  schemesById: Map<number, string>;
}): JSX.Element {
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (key: string, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const activeFilterCount = Object.values(colFilters).filter((v) => v.trim() !== '').length;

  const selectOptionsByKey = useMemo(() => {
    const result: Partial<Record<ColKey, string[]>> = {};
    for (const c of columns) {
      if (FILTERABLE_COLS[c.key] !== 'select') continue;
      const values = new Set<string>();
      for (const p of projects) {
        const v = colFilterValue(c.key, p, districtsById, divisionsById, sectorsById, schemesById);
        if (v) values.add(v);
      }
      result[c.key] = Array.from(values).sort();
    }
    return result;
  }, [columns, projects, districtsById, divisionsById, sectorsById, schemesById]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      for (const [key, kind] of Object.entries(FILTERABLE_COLS)) {
        const filterVal = colFilters[key] ?? '';
        if (!filterVal) continue;
        const cellVal = colFilterValue(key as ColKey, p, districtsById, divisionsById, sectorsById, schemesById);
        if (kind === 'select' ? !selectMatches(filterVal, cellVal) : !textMatches(filterVal, cellVal)) {
          return false;
        }
      }
      return true;
    });
  }, [projects, colFilters, districtsById, divisionsById, sectorsById, schemesById]);

  return (
    <div className="overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
      {activeFilterCount > 0 ? (
        <div className="flex items-center justify-between border-b border-[#F3F4F6] bg-[#F9FAFB] px-3 py-1.5 text-[11px] text-[#6B7280]">
          <span>{filteredProjects.length} of {projects.length} projects match {activeFilterCount} column filter{activeFilterCount === 1 ? '' : 's'}</span>
          <button
            type="button"
            onClick={() => setColFilters({})}
            className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
          >
            Clear column filters ({activeFilterCount})
          </button>
        </div>
      ) : null}
      <table className="w-full min-w-[720px] border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
            {columns.map((c) => {
              const kind = FILTERABLE_COLS[c.key];
              return (
                <th key={c.key} className="whitespace-nowrap px-3 py-2 text-left align-top">
                  <div>{c.label}</div>
                  {kind === 'text' ? (
                    <ColumnFilterText value={colFilters[c.key] ?? ''} onChange={(v) => setColFilter(c.key, v)} />
                  ) : kind === 'select' ? (
                    <ColumnFilterSelect
                      value={colFilters[c.key] ?? ''}
                      onChange={(v) => setColFilter(c.key, v)}
                      options={(selectOptionsByKey[c.key] ?? []).map((v) => ({ value: v, label: v }))}
                    />
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filteredProjects.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-[12.5px] text-[#6B7280]">
                No projects match the current column filters.
              </td>
            </tr>
          ) : filteredProjects.map((p, idx) => {
            const isActive = p.projectId === activeProjectId;
            return (
              <tr
                key={p.projectId}
                role="button"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => onSelect(p.projectId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(p.projectId);
                  }
                }}
                className={cn(
                  'cursor-pointer border-b border-[#F3F4F6] transition-colors focus:outline-none',
                  isActive
                    ? 'bg-[#EFF6FF] ring-1 ring-inset ring-[#93C5FD]'
                    : cn(
                        'hover:bg-[#F0F7FF] focus:bg-[#EFF6FF]',
                        idx % 2 === 1 && 'bg-[#FAFAFA]',
                      ),
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 align-middle">
                    {renderCell(c.key, p, districtsById, divisionsById, sectorsById, schemesById, onOpenRemarks)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── LEFT panel: customizable project details ────────────────────────────────
// Renders every visible field in PROJECT_FIELD_ORDER — the 12 spec-mandated
// core fields first (in their exact order), then extras. Falls back to the
// list item's data while the full ProjectDetail is still loading, so the panel
// paints instantly on click.
function ProjectDetailsBody({
  listItem, detail, detailLoading, vis,
  districtsById, divisionsById, sectorsById, schemesById,
}: {
  listItem: ProjectListItem;
  detail: ProjectDetail | null;
  detailLoading: boolean;
  vis: Record<ProjectFieldKey, boolean>;
  districtsById: Map<number, string>;
  divisionsById: Map<number, { name: string; regionName: string }>;
  sectorsById: Map<number, string>;
  schemesById: Map<number, string>;
}): JSX.Element {
  const p = detail ?? listItem;                            // prefer full detail
  const asDetail = detail as ProjectDetail | null;         // extra fields

  const districtName = p.districtId ? districtsById.get(p.districtId) ?? null : null;
  const divisionRow  = p.divisionId ? divisionsById.get(p.divisionId) ?? null : null;
  const divisionName = divisionRow?.name ?? null;
  const regionName   = divisionRow?.regionName ?? null;
  const sectorName   = p.sectorId   ? sectorsById.get(p.sectorId)     ?? null : null;
  const schemeNames  = p.schemes.map((id) => schemesById.get(id) ?? `#${id}`);

  const renderField = (key: ProjectFieldKey): FieldOutput | null => {
    switch (key) {
      case 'nameOfWork':
        return {
          label: 'Name of Work',
          value: asDetail?.mainWork ?? (detailLoading ? 'Loading…' : '—'),
          fullWidth: true,
          preserveNewlines: true,
        };
      case 'agreementNumber':
        return { label: 'Agreement Number', value: asDetail?.agreementNumber ?? (detailLoading ? '…' : '—') };
      case 'agreementDate':
        return { label: 'Agreement Date', value: formatDate(asDetail?.agreementDate) };
      case 'agreementAmount':
        return { label: 'Agreement Amount', value: formatCurrencyCr(p.agreementAmountCr), tone: 'strong' };
      case 'expectedCompletion': {
        const d = formatDate(p.expectedCompletionDate);
        return { label: 'Expected Date of Completion', value: d === '—' ? (p.expectedCompletionRaw ?? '—') : d };
      }
      case 'physicalProgress':
        return { label: 'Physical Progress', value: <ProgressCell value={p.effectivePhysicalPct} color="#1D4ED8" /> };
      case 'financialProgress':
        return { label: 'Financial Progress', value: <ProgressCell value={p.financialProgressPct} color="#22C55E" /> };
      case 'expenditureTillDate':
        return { label: 'Expenditure Till Date', value: formatCurrencyCr(p.financialProgressCr), tone: 'strong' };
      case 'geotagPhotographs':
        return {
          label: 'Geotag Photographs',
          value: <span className="italic text-[#6B7280]">— photos view is deferred</span>,
        };
      case 'issuesRemarks':
        return {
          label: 'Issues and Remarks',
          value: p.remark ?? '—',
          fullWidth: true,
          preserveNewlines: true,
          ...(p.remark ? { tone: 'warn' as const } : {}),
        };
      case 'agencyContractor':
        return { label: 'Name of Agency / Contractor', value: p.contractor ?? '—' };
      case 'pdName':
        return { label: 'Name of PD', value: p.pd ?? '—' };

      case 'city':                return { label: 'City',                 value: p.city ?? '—' };
      case 'district':            return { label: 'District',             value: districtName ?? '—' };
      case 'division':            return { label: 'Division',             value: divisionName ?? '—' };
      case 'region':              return { label: 'Region',               value: regionName ?? '—' };
      case 'sector':              return { label: 'Sector',               value: sectorName ?? '—' };
      case 'schemes':             return { label: 'Scheme(s)',            value: schemeNames.length ? schemeNames.join(', ') : '—' };
      case 'projectStageV2':      return { label: 'Project Stage',        value: p.projectStageV2 ?? '—' };
      case 'contractType':        return { label: 'Contract Type',        value: p.contractType ?? '—' };
      case 'status':              return { label: 'Execution Status',     value: <StatusBadge status={p.status} /> };
      case 'priority':            return { label: 'Priority',             value: <PriorityBadge priority={p.priority} /> };

      case 'sponsoringDept':      return { label: 'Sponsoring Department',value: asDetail?.sponsoringDept ?? '—' };
      case 'implementingAgency':  return { label: 'Implementing Agency',  value: asDetail?.implementingAgency ?? '—' };
      case 'sanctionDate':        return { label: 'Sanction Date',        value: formatDate(asDetail?.sanctionDate) };
      case 'plannedEndDate':      return { label: 'Planned End Date',     value: formatDate(p.plannedEndDate) };
      case 'revisedEndDate':      return { label: 'Revised End Date',     value: formatDate(p.revisedEndDate) };
      case 'scheduledProgressPct':return { label: 'Scheduled Progress %', value: formatPercent(asDetail?.scheduledProgressPct) };
      case 'delayReason':         return { label: 'Delay Reason',         value: asDetail?.delayReason ?? '—', fullWidth: true, preserveNewlines: true };
      case 'deptStuckAt':         return { label: 'Department Stuck At',  value: asDetail?.deptStuckAt ?? '—' };

      case 'aaAmount':              return { label: 'AA Amount',             value: formatCurrencyCr(p.aaAmountCr) };
      case 'revisedAaAmount':       return { label: 'Revised AA Amount',     value: formatCurrencyCr(p.revisedAaAmountCr) };
      case 'contractValueCr':       return { label: 'Contract Value',        value: formatCurrencyCr(asDetail?.contractValueCr) };
      case 'mobAdvanceIssuedCr':    return { label: 'Mob. Advance Issued',   value: formatCurrencyCr(asDetail?.mobAdvanceIssuedCr) };
      case 'mobAdvanceRecoveredCr': return { label: 'Mob. Advance Recovered', value: formatCurrencyCr(asDetail?.mobAdvanceRecoveredCr) };
      case 'advanceOutstandingCr':  return { label: 'Advance Outstanding',   value: formatCurrencyCr(asDetail?.advanceOutstandingCr) };
      case 'retentionMoneyHeldCr':  return { label: 'Retention Held',        value: formatCurrencyCr(asDetail?.retentionMoneyHeldCr) };
      case 'totalPaymentsCr':       return { label: 'Total Payments',        value: formatCurrencyCr(asDetail?.totalPaymentsCr) };
      case 'lastPaymentDate':       return { label: 'Last Payment Date',     value: formatDate(asDetail?.lastPaymentDate) };
      case 'lastRaBillNo':          return { label: 'Last RA Bill No.',       value: asDetail?.lastRaBillNo ?? '—' };

      case 'pbgNumber':      return { label: 'PBG Number',       value: asDetail?.pbgNumber ?? '—' };
      case 'pbgAmountCr':    return { label: 'PBG Amount',       value: formatCurrencyCr(asDetail?.pbgAmountCr) };
      case 'pbgIssuingBank': return { label: 'PBG Issuing Bank', value: asDetail?.pbgIssuingBank ?? '—' };
      case 'pbgExpiryDate':  return { label: 'PBG Expiry Date',  value: formatDate(p.pbgExpiryDate) };
      case 'emdAmountCr':    return { label: 'EMD Amount',       value: formatCurrencyCr(asDetail?.emdAmountCr) };
      case 'emdRefNumber':   return { label: 'EMD Reference',    value: asDetail?.emdRefNumber ?? '—' };
      case 'emdDate':        return { label: 'EMD Date',         value: formatDate(asDetail?.emdDate) };

      case 'omStartDate':    return { label: 'O&M Start Date',      value: formatDate(p.omStartDate) };
      case 'omEndDate':      return { label: 'O&M End Date',        value: formatDate(p.omEndDate) };
      case 'omPeriodMonths': return { label: 'O&M Period (months)', value: p.omPeriodMonths != null ? String(p.omPeriodMonths) : '—' };
      case 'omAgency':       return { label: 'O&M Agency',          value: asDetail?.omAgency ?? '—' };
      case 'omRemarks':      return { label: 'O&M Remarks',         value: asDetail?.omRemarks ?? '—', fullWidth: true, preserveNewlines: true };

      case 'projectBrief':       return { label: 'Project Brief',          value: asDetail?.projectBrief ?? '—', fullWidth: true, preserveNewlines: true };
      case 'mainComponentScope': return { label: 'Main Component / Scope', value: asDetail?.mainComponentScope ?? '—', fullWidth: true, preserveNewlines: true };
    }
  };

  const visibleFields = PROJECT_FIELD_ORDER
    .filter((k) => vis[k])
    .map((k) => ({ key: k, out: renderField(k) }))
    .filter((r): r is { key: ProjectFieldKey; out: FieldOutput } => r.out !== null);

  return (
    <div className="space-y-5">
      {/* Fixed chrome — project name + badges — always shown (§2 polish) */}
      <div className="min-w-0 border-b border-[#E5E7EB] pb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
          Selected Project
        </p>
        <h3 className="mt-1 break-words text-[19px] font-extrabold leading-tight text-[#111827]">
          {p.projectName}
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={p.status} />
          <PriorityBadge priority={p.priority} />
        </div>
      </div>

      {visibleFields.length === 0 ? (
        <EmptyPanelState
          icon="⚙️"
          title="No project fields visible"
          hint="Open the Fields picker above and turn some on."
        />
      ) : (
        <div className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <p className="mb-4 border-b border-[#F3F4F6] pb-2 text-[11.5px] font-bold uppercase tracking-wider text-[#1E3A5F]">
            Project Details
          </p>
          {/* Bigger, roomier grid — 1 col on narrow, 2 on ≥md, 3 on ≥xl for the
              wider desktop briefing panel (§2). fullWidth fields still span. */}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleFields.map(({ key, out }) => (
              <FieldRow key={key} field={out} />
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

interface FieldOutput {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
  preserveNewlines?: boolean;
  tone?: 'strong' | 'warn';
}

function FieldRow({ field }: { field: FieldOutput }): JSX.Element {
  const valueClass = cn(
    'text-[13.5px] leading-relaxed text-[#111827]',
    field.preserveNewlines && 'whitespace-pre-wrap break-words',
    field.tone === 'strong' && 'text-[15.5px] font-bold tabular-nums text-[#1E3A5F]',
    field.tone === 'warn'   && 'font-semibold text-[#B91C1C]',
  );
  return (
    <div
      className={cn(
        'min-w-0 rounded-md bg-[#F9FAFB] px-3 py-2.5',
        field.fullWidth && 'md:col-span-2 xl:col-span-3',
      )}
    >
      <dt className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
        {field.label}
      </dt>
      <dd className={valueClass}>{field.value}</dd>
    </div>
  );
}

function ProgressCell({ value, color }: { value: number | null | undefined; color: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="min-w-[50px] text-[13.5px] font-bold tabular-nums text-[#111827]">
        {formatPercent(value)}
      </span>
      <div className="flex-1"><ProgressBar value={value} color={color} showLabel={false} /></div>
    </div>
  );
}

function renderCell(
  key: ColKey,
  p: ProjectListItem,
  districtsById: Map<number, string>,
  divisionsById: Map<number, { name: string; regionName: string }>,
  sectorsById: Map<number, string>,
  schemesById: Map<number, string>,
  onOpenRemarks: (project: ProjectListItem) => void,
): React.ReactNode {
  switch (key) {
    case 'projectName':         return <span className="font-semibold text-[#1D4ED8]">{p.projectName}</span>;
    case 'city':                return <span className="text-[#374151]">{p.city ?? '—'}</span>;
    case 'district':            return <span className="text-[#374151]">{(p.districtId && districtsById.get(p.districtId)) ?? '—'}</span>;
    case 'division':            return <span className="text-[#374151]">{(p.divisionId && divisionsById.get(p.divisionId)?.name) ?? '—'}</span>;
    case 'region':              return <span className="text-[#374151]">{(p.divisionId && divisionsById.get(p.divisionId)?.regionName) ?? '—'}</span>;
    case 'contractor':          return <span className="text-[#374151]">{p.contractor ?? '—'}</span>;
    case 'pd':                  return <span className="text-[#374151]">{p.pd ?? '—'}</span>;
    case 'sector':              return <span className="text-[#374151]">{(p.sectorId && sectorsById.get(p.sectorId)) ?? '—'}</span>;
    case 'schemes': {
      const names = p.schemes.map((id) => schemesById.get(id) ?? `#${id}`);
      return <span className="text-[#374151]">{names.length ? names.join(', ') : '—'}</span>;
    }
    case 'aaAmount':            return <span className="tabular-nums text-[#111827]">{formatCurrencyCr(p.aaAmountCr)}</span>;
    case 'agreementAmount':     return <span className="tabular-nums text-[#111827]">{formatCurrencyCr(p.agreementAmountCr)}</span>;
    case 'physicalProgress':    return <ProgressBar value={p.effectivePhysicalPct} color="#3B82F6" />;
    case 'financialProgressCr': return <span className="tabular-nums text-[#111827]">{formatCurrencyCr(p.financialProgressCr)}</span>;
    case 'financialProgressPct':return <ProgressBar value={p.financialProgressPct} color="#22C55E" />;
    case 'expectedCompletion': {
      const d = formatDate(p.expectedCompletionDate);
      return <span className="tabular-nums text-[#374151]">{d === '—' ? (p.expectedCompletionRaw ?? '—') : d}</span>;
    }
    case 'status':              return <StatusBadge status={p.status} />;
    case 'contractType':        return <span className="text-[#374151]">{p.contractType ?? '—'}</span>;
    case 'outstandingGap':      return <span className="text-[12px] text-[#B91C1C]">{p.remark ?? '—'}</span>;
    case 'priority':            return <PriorityBadge priority={p.priority} />;
    case 'pbgAlert':            return <PbgAlertCell pbgExpiryDate={p.pbgExpiryDate} />;
    case 'omStatus':            return (
      <OmAlertCell
        status={p.status}
        omApplicable={p.omApplicable}
        omStartDate={p.omStartDate}
        omEndDate={p.omEndDate}
        omPeriodMonths={p.omPeriodMonths}
        omStatusOverride={p.omStatusOverride}
      />
    );
    case 'remarks': return (
      <RemarksButton remark={p.remark} onClick={() => onOpenRemarks(p)} stopRowActivation />
    );
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────
type KpiTone = 'brand' | 'success' | 'info' | 'danger' | 'muted' | 'amber';

function StatusKpi({ label, value, tone }: { label: string; value: number; tone: KpiTone }): JSX.Element {
  const palette: Record<KpiTone, { border: string; text: string; label: string }> = {
    brand:   { border: 'border-t-[#1E3A5F]', text: 'text-[#1E3A5F]', label: 'text-[#1E3A5F]' },
    success: { border: 'border-t-[#15803D]', text: 'text-[#15803D]', label: 'text-[#6B7280]' },
    info:    { border: 'border-t-[#1D4ED8]', text: 'text-[#1D4ED8]', label: 'text-[#6B7280]' },
    danger:  { border: 'border-t-[#B91C1C]', text: 'text-[#B91C1C]', label: 'text-[#6B7280]' },
    muted:   { border: 'border-t-[#9CA3AF]', text: 'text-[#374151]', label: 'text-[#6B7280]' },
    amber:   { border: 'border-t-[#B45309]', text: 'text-[#B45309]', label: 'text-[#6B7280]' },
  };
  const p = palette[tone];
  return (
    <div className={cn(
      'rounded border-x border-b border-[#E5E7EB] bg-white px-3 py-2 shadow-sm border-t-4',
      p.border,
    )}>
      <div className={cn('text-[10.5px] font-bold uppercase tracking-wider', p.label)}>{label}</div>
      <div className={cn('text-xl font-extrabold tabular-nums', p.text)}>{value}</div>
    </div>
  );
}

function MoneyKpi({ label, value, tone }: { label: string; value: number | null; tone: KpiTone }): JSX.Element {
  const palette: Record<KpiTone, string> = {
    brand:   'text-[#1E3A5F]',
    success: 'text-[#15803D]',
    info:    'text-[#1D4ED8]',
    danger:  'text-[#B91C1C]',
    muted:   'text-[#374151]',
    amber:   'text-[#B45309]',
  };
  return (
    <div className="rounded border border-[#E5E7EB] bg-white px-3 py-2 shadow-sm">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">{label}</div>
      <div className={cn('mt-0.5 text-[15px] font-extrabold tabular-nums', palette[tone])}>
        {formatCurrencyCr(value)}
      </div>
    </div>
  );
}

function ProgressRow({ label, value, color }: {
  label: string; value: number | null; color: string;
}): JSX.Element {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#374151]">{label}</span>
        <span className="text-[11px] font-bold tabular-nums text-[#111827]">{formatPercent(value)}</span>
      </div>
      <ProgressBar value={value} color={color} showLabel={false} />
    </div>
  );
}

// ── FilterRow — Scheme / Sector / Division / Status dropdowns ───────────────
function FilterRow({
  lookups, filterSchemeId, filterSectorId, filterDivisionId, filterStatus,
  onSchemeChange, onSectorChange, onDivisionChange, onStatusChange,
  onClearAll, hasAnyFilter,
}: {
  lookups: Lookups | undefined;
  filterSchemeId: number | null;
  filterSectorId: number | null;
  filterDivisionId: number | null;
  filterStatus: string | null;
  onSchemeChange:   (v: number | null) => void;
  onSectorChange:   (v: number | null) => void;
  onDivisionChange: (v: number | null) => void;
  onStatusChange:   (v: string | null) => void;
  onClearAll: () => void;
  hasAnyFilter: boolean;
}): JSX.Element {
  const schemes   = lookups?.schemes   ?? [];
  const sectors   = lookups?.sectors   ?? [];
  const divisions = lookups?.divisions ?? [];
  return (
    <div className="shrink-0 border-b border-[#E5E7EB] bg-white px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect
          label="Scheme"
          value={filterSchemeId === null ? '' : String(filterSchemeId)}
          onChange={(v) => onSchemeChange(v ? Number(v) : null)}
          options={schemes.map((s) => ({ value: String(s.schemeId), label: s.schemeName }))}
        />
        <FilterSelect
          label="Sector"
          value={filterSectorId === null ? '' : String(filterSectorId)}
          onChange={(v) => onSectorChange(v ? Number(v) : null)}
          options={sectors.map((s) => ({ value: String(s.sectorId), label: s.sectorName }))}
        />
        <FilterSelect
          label="Division"
          value={filterDivisionId === null ? '' : String(filterDivisionId)}
          onChange={(v) => onDivisionChange(v ? Number(v) : null)}
          options={divisions.map((d) => ({ value: String(d.divisionId), label: d.divisionName }))}
        />
        <FilterSelect
          label="Status"
          value={filterStatus ?? ''}
          onChange={(v) => onStatusChange(v || null)}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
        <button
          type="button"
          onClick={onClearAll}
          disabled={!hasAnyFilter}
          className={cn(
            'ml-auto self-end rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
            hasAnyFilter
              ? 'border-[#FCA5A5] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]'
              : 'cursor-not-allowed border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]',
          )}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}): JSX.Element {
  return (
    <label className="grid min-w-[140px] max-w-[220px] flex-1 gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full rounded-md border border-[#D1D5DB] bg-white px-2 text-[12.5px] text-[#111827]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A5F] focus-visible:ring-offset-1',
        )}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function EmptyPanelState({ icon, title, hint }: {
  icon: string; title: string; hint: string;
}): JSX.Element {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-[#D1D5DB] bg-[#F9FAFB] p-6 text-center">
      <div className="text-2xl">{icon}</div>
      <p className="mt-2 text-[13px] font-bold text-[#374151]">{title}</p>
      <p className="mt-1 text-[11.5px] text-[#6B7280]">{hint}</p>
    </div>
  );
}

function Pill({ on, onToggle, label, locked }: {
  on: boolean;
  onToggle: () => void;
  label: string;
  locked?: boolean;
}): JSX.Element {
  return (
    <label
      className={cn(
        'flex select-none items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
        locked
          ? 'cursor-not-allowed border-[#BFDBFE] bg-[#EFF6FF] font-semibold text-[#1E3A5F] opacity-90'
          : on
            ? 'cursor-pointer border-[#93C5FD] bg-[#EFF6FF] font-semibold text-[#1D4ED8]'
            : 'cursor-pointer border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]',
      )}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={locked}
        onChange={locked ? undefined : onToggle}
        className="cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
      />
      {label}{locked ? ' 🔒' : ''}
    </label>
  );
}

function FieldPickerPanel({
  title, searchValue, onSearch, searchRef,
  onShowAll, onHideAll, onDone, renderBody,
}: {
  title: string;
  searchValue: string;
  onSearch: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  onShowAll: () => void;
  onHideAll: () => void;
  onDone: () => void;
  renderBody: () => React.ReactNode;
}): JSX.Element {
  return (
    <div className="border-b border-[#E5E7EB] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F3F4F6] px-4 py-2.5">
        <span className="text-[12px] font-bold text-[#1E3A5F]">⚙️ {title}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onShowAll}
            className="rounded border border-[#D1D5DB] px-2.5 py-1 text-[10.5px] font-semibold text-[#374151] hover:bg-[#F9FAFB]"
          >Show All</button>
          <button
            type="button"
            onClick={onHideAll}
            className="rounded border border-[#FCA5A5] px-2.5 py-1 text-[10.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]"
          >Hide All</button>
          <button
            type="button"
            onClick={onDone}
            className="rounded bg-[#1E3A5F] px-3 py-1 text-[10.5px] font-semibold text-white hover:bg-[#1e3a5fe0]"
          >Done ✓</button>
        </div>
      </div>
      <div className="px-4 pb-3 pt-2.5">
        <input
          ref={searchRef}
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-[12px] text-[#111827] outline-none placeholder:text-[#9CA3AF] focus:border-[#93C5FD] focus:ring-1 focus:ring-[#93C5FD]"
        />
      </div>
      <div className="max-h-64 overflow-y-auto px-4 pb-3">
        {renderBody()}
      </div>
    </div>
  );
}
