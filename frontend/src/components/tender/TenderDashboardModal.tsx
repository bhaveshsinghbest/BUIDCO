import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useGetLookupsQuery } from '../../app/api/lookupsApi';
import {
  useGetProjectQuery,
  useListProjectsQuery,
  useTransferTenderMutation,
  useUpdateProjectNitMutation,
} from '../../app/api/projectsApi';
import { useAppSelector } from '../../app/hooks';
import { selectCurrentUser } from '../../features/auth/authSlice';
import { useClickOutside } from '../../hooks/useClickOutside';
import {
  bucketByTenderSubStage,
  displayNitDate,
  displayNitNumber,
  FINAL_TENDER_SUB_STAGE,
  FIRST_TENDER_SUB_STAGE,
  TENDER_SUB_STAGES,
} from '../../features/tender/tenderWorkflow';
import type { Lookups, ProjectListItem, TenderSubStage } from '../../types/api';
import { cn } from '../../lib/utils';
import { daysBetween, formatDate } from '../../lib/formatters';
import { Button } from '../ui/button';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches } from '../ui/ColumnFilter';
import { RemarksButton, RemarksDialog } from '../projects/RemarksDialog';
import { Skeleton } from '../ui/skeleton';

interface Props {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'dashboard' | 'stages';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'stages', label: 'Project Stages' },
];

export function TenderDashboardModal({ open, onClose }: Props): JSX.Element | null {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [selectedStage, setSelectedStage] = useState<TenderSubStage | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [stagesActive, setStagesActive] = useState<TenderSubStage>(FIRST_TENDER_SUB_STAGE);
  const [flash, setFlash] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [remarksProject, setRemarksProject] = useState<ProjectListItem | null>(null);

  const lookupsQuery = useGetLookupsQuery(undefined, { skip: !open });
  // Backend listProjectsQuery caps `limit` at 100 (max page size). Anything
  // over that trips validation and the whole modal shows empty buckets.
  const projectsQuery = useListProjectsQuery(
    open ? { projectStage: 'Tender', limit: 100 } : { limit: 1 },
    { skip: !open },
  );
  const [transferTender, transferState] = useTransferTenderMutation();
  const currentUser = useAppSelector(selectCurrentUser);
  const canTransfer =
    currentUser?.role === 'MD' || Boolean(currentUser?.canUpdateProjects);

  const tenderProjects = useMemo(
    () => (projectsQuery.data?.items ?? []).filter((p) => p.projectStageV2 === 'Tender'),
    [projectsQuery.data],
  );

  // Reset transient state on close so re-opens start fresh.
  useEffect(() => {
    if (!open) {
      setSelectedStage(null);
      setSelectedIds(new Set());
      setStagesActive(FIRST_TENDER_SUB_STAGE);
      setTab('dashboard');
      setFlash(null);
      setRemarksProject(null);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [stagesActive, tab]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const byStage = bucketByTenderSubStage(tenderProjects);
  const drillProjects = selectedStage ? byStage.get(selectedStage) ?? [] : [];
  const activeStageProjects = byStage.get(stagesActive) ?? [];

  const toggleSelect = (projectId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };
  // Takes the ids to select rather than deriving them here, since StagesTab
  // may have its own column filters narrowing which rows are visible —
  // "Select all" should only select what's currently shown.
  const selectAllActive = (ids: string[]): void => {
    setSelectedIds(new Set(ids));
  };
  const clearSelection = (): void => setSelectedIds(new Set());

  const activeIdx = TENDER_SUB_STAGES.indexOf(stagesActive);
  const canPrev = activeIdx > 0;
  const canNext = activeIdx < TENDER_SUB_STAGES.length - 1;

  const runTransfer = async (direction: 'next' | 'prev'): Promise<void> => {
    if (!canTransfer || selectedIds.size === 0) return;
    // NIT_addition_instructions.md §2 — pre-flight validation: moving forward
    // out of NIT Published requires every selected project to have both
    // NIT Number AND NIT Date. Backend re-checks; this saves a round trip
    // and gives the user the exact spec-worded message.
    if (direction === 'next' && stagesActive === 'NIT Published') {
      const missing = tenderProjects
        .filter((p) => selectedIds.has(p.projectId))
        .filter((p) => !p.nitNumber || !p.nitDate);
      if (missing.length > 0) {
        setFlash({
          text:
            missing.length === 1
              ? `Please enter both NIT Number and NIT Date before transferring "${missing[0]!.projectName}" to the next Tender stage.`
              : `Please enter both NIT Number and NIT Date on ${missing.length} selected project${missing.length === 1 ? '' : 's'} before transferring to the next Tender stage.`,
          kind: 'err',
        });
        return;
      }
    }
    try {
      const result = await transferTender({
        projectIds: [...selectedIds],
        direction,
      }).unwrap();
      const movedCount = result.moved.length;
      const skippedCount = result.skipped.length;
      if (movedCount === 0) {
        setFlash({
          text: skippedCount > 0
            ? `No projects moved — ${skippedCount} skipped (${result.skipped[0]?.reason ?? 'unknown reason'}).`
            : 'No projects moved.',
          kind: 'err',
        });
      } else {
        setFlash({
          text: `Moved ${movedCount} project${movedCount === 1 ? '' : 's'} ${direction === 'next' ? 'forward' : 'back'}${
            skippedCount > 0 ? ` · ${skippedCount} skipped` : ''
          }.`,
          kind: 'ok',
        });
      }
      setSelectedIds(new Set());
    } catch (err) {
      setFlash({ text: readError(err), kind: 'err' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="Tender Dashboard"
    >
      <header
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5 sm:py-3.5"
        style={{ background: 'linear-gradient(100deg,#1E3A5F 0%,#2563EB 100%)' }}
      >
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#93C5FD]">
            ⚖ Tender Workflow
          </p>
          <h2 className="mt-0.5 text-[15px] font-bold text-white">Tender Dashboard</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            {tenderProjects.length} project{tenderProjects.length === 1 ? '' : 's'} in tender
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            aria-label="Close"
            className="border-white/40 bg-white/15 text-white hover:bg-white/25"
          >
            ✕ Close
          </Button>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="Tender Dashboard tabs"
        className="flex shrink-0 flex-wrap gap-0.5 border-b-2 border-[#E5E7EB] px-2 pt-2 sm:px-4"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-0.5 whitespace-nowrap border-b-2 px-4 py-2 text-[12px] font-semibold transition-colors',
              tab === t.key
                ? 'border-[#1E3A5F] text-[#1E3A5F]'
                : 'border-transparent text-[#6B7280] hover:text-[#374151]',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* flex-1 + its own overflow-y-auto — fills whatever height remains
          below the header/nav (whatever their actual rendered height is)
          instead of the old max-h-[calc(100vh-160px)] guess. */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
        {flash ? (
          <div
            className={cn(
              'mb-3 rounded border px-3 py-2 text-[12.5px]',
              flash.kind === 'ok'
                ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                : 'border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]',
            )}
            role="status"
          >
            {flash.text}
          </div>
        ) : null}

        {projectsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : tab === 'dashboard' ? (
          <DashboardTab
            byStage={byStage}
            selectedStage={selectedStage}
            onSelect={setSelectedStage}
            drillProjects={drillProjects}
            lookups={lookupsQuery.data}
            onOpenRemarks={setRemarksProject}
            onNavigateAway={onClose}
          />
        ) : (
          <StagesTab
            stagesActive={stagesActive}
            onStageChange={setStagesActive}
            byStage={byStage}
            projects={activeStageProjects}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAllActive}
            onClearSelection={clearSelection}
            canPrev={canPrev}
            canNext={canNext}
            canTransfer={canTransfer}
            busy={transferState.isLoading}
            onTransferPrev={() => void runTransfer('prev')}
            onTransferNext={() => void runTransfer('next')}
            lookups={lookupsQuery.data}
          />
        )}
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

/* ─────────────────────────────────────────────────────────────────────────
 * Dashboard tab
 * ──────────────────────────────────────────────────────────────────────── */

/** Days overdue against the project's planned (or expected) completion date
 *  — positive means delayed by that many days, non-positive means on track.
 *  `null` when neither date is set. Mirrors the sign convention used
 *  elsewhere in the app: `daysBetween(target, today)`. */
function delayDaysOf(p: ProjectListItem): number | null {
  const target = p.plannedEndDate ?? p.expectedCompletionDate;
  if (!target) return null;
  return daysBetween(target, new Date());
}

type DashboardSortKey = 'projectName' | 'division' | 'nitDate' | 'delay';

const EXECUTION_STATUSES = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Delayed'];

type DelayBucket = 15 | 30 | 60 | 90;
const DELAY_BUCKETS: Array<{ key: DelayBucket; label: string }> = [
  { key: 15, label: '> 15 Days' },
  { key: 30, label: '> 30 Days' },
  { key: 60, label: '> 60 Days' },
  { key: 90, label: '> 90 Days' },
];

/**
 * The Delay column's own filter (bhaveshTask.md) — a small "Delay ▾" toggle
 * embedded in the header, same spot every other column's filter control
 * sits, opening a compact checkbox panel instead of a single text/select
 * input since this one needs multiple tick-boxes.
 */
function DelayColumnFilter({
  buckets,
  onToggle,
}: {
  buckets: Set<DelayBucket>;
  onToggle: (b: DelayBucket) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  return (
    <div className="relative mt-1" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((p) => !p);
        }}
        aria-expanded={open}
        className="flex h-6 w-full min-w-[74px] items-center justify-between rounded border border-[#D1D5DB] bg-white px-1.5 text-[10.5px] font-normal normal-case tracking-normal text-[#111827] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1E3A5F]"
      >
        {buckets.size > 0 ? `${buckets.size} selected` : 'All'}
        <span aria-hidden className={cn('text-[8px] transition-transform', open && 'rotate-180')}>▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded border border-[#E5E7EB] bg-white p-1.5 normal-case tracking-normal shadow-lg">
          {DELAY_BUCKETS.map((b) => (
            <label
              key={b.key}
              className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-[11px] font-normal text-[#374151] hover:bg-[#F3F4F6]"
            >
              <input
                type="checkbox"
                checked={buckets.has(b.key)}
                onChange={() => onToggle(b.key)}
                className="h-3 w-3 cursor-pointer accent-[#1D4ED8]"
              />
              {b.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function schemeNamesOf(project: ProjectListItem, lookups: Lookups | undefined): string[] {
  if (!project.schemes || project.schemes.length === 0) return [];
  const byId = new Map((lookups?.schemes ?? []).map((s) => [s.schemeId, s.schemeName]));
  return project.schemes.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
}

function sectorNameOf(project: ProjectListItem, lookups: Lookups | undefined): string | null {
  return project.sectorId
    ? (lookups?.sectors.find((s) => s.sectorId === project.sectorId)?.sectorName ?? null)
    : null;
}

function DashboardTab({
  byStage, selectedStage, onSelect, drillProjects, lookups, onOpenRemarks, onNavigateAway,
}: {
  byStage: Map<TenderSubStage, ProjectListItem[]>;
  selectedStage: TenderSubStage | null;
  onSelect: (s: TenderSubStage | null) => void;
  drillProjects: ProjectListItem[];
  lookups: Lookups | undefined;
  onOpenRemarks: (project: ProjectListItem) => void;
  onNavigateAway: () => void;
}): JSX.Element {
  // Task: Table Column Filter for the stage drill-in table — same
  // independent-per-column pattern as StagesTab below.
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (key: string, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));

  // bhaveshTask.md — 4 prominent dropdown filters shown above the table,
  // independent of (and combined with) the per-column filters above.
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDivisionTop, setFilterDivisionTop] = useState('');
  const [filterScheme, setFilterScheme] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [delayBuckets, setDelayBuckets] = useState<Set<DelayBucket>>(() => new Set());
  const toggleDelayBucket = (b: DelayBucket): void => {
    setDelayBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  };

  const activeFilterCount =
    Object.values(colFilters).filter((v) => v.trim() !== '').length +
    (filterStatus ? 1 : 0) + (filterDivisionTop ? 1 : 0) + (filterScheme ? 1 : 0) + (filterSector ? 1 : 0) +
    delayBuckets.size;
  const clearAllFilters = (): void => {
    setColFilters({});
    setFilterStatus('');
    setFilterDivisionTop('');
    setFilterScheme('');
    setFilterSector('');
    setDelayBuckets(new Set());
  };

  // Standard table sorting — same click-header / arrow-indicator pattern as
  // the Projects section's table (bhaveshTask.md Task 3), applied here plus
  // a dedicated Delay column with its own Low→High / High→Low sort.
  const [sortKey, setSortKey] = useState<DashboardSortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const onSort = (key: DashboardSortKey): void => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const arrow = (key: DashboardSortKey): string => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const divisionOptions = useMemo(() => {
    const names = new Set((lookups?.divisions ?? []).map((d) => d.divisionName));
    return Array.from(names).sort();
  }, [lookups]);
  const schemeOptions = useMemo(() => {
    const names = new Set((lookups?.schemes ?? []).map((s) => s.schemeName));
    return Array.from(names).sort();
  }, [lookups]);
  const sectorOptions = useMemo(() => {
    const names = new Set((lookups?.sectors ?? []).map((s) => s.sectorName));
    return Array.from(names).sort();
  }, [lookups]);

  const filteredDrillProjects = useMemo(() => {
    return drillProjects.filter((p) => {
      // Per-column filters.
      if (!textMatches(colFilters.projectName ?? '', p.projectName)) return false;
      if (!selectMatches(colFilters.division ?? '', divisionNameOf(p, lookups))) return false;
      if (!textMatches(colFilters.contractor ?? '', p.contractor)) return false;
      if (!textMatches(colFilters.nitNumber ?? '', p.nitNumber)) return false;
      if (!textMatches(colFilters.nitDate ?? '', p.nitDate)) return false;
      if (!textMatches(colFilters.lastUpdated ?? '', p.lastUpdated?.slice(0, 10))) return false;
      if (!textMatches(colFilters.remark ?? '', p.remark)) return false;

      // Prominent above-table dropdown filters.
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterDivisionTop && divisionNameOf(p, lookups) !== filterDivisionTop) return false;
      if (filterScheme && !schemeNamesOf(p, lookups).includes(filterScheme)) return false;
      if (filterSector && sectorNameOf(p, lookups) !== filterSector) return false;

      // Delay bucket filter — OR across checked buckets (matches "at least
      // one selected threshold"), never double-counts a row either way
      // since this is an inclusion test per row, not a list concatenation.
      if (delayBuckets.size > 0) {
        const delay = delayDaysOf(p);
        const matchesAnyBucket = Array.from(delayBuckets).some((b) => delay !== null && delay > b);
        if (!matchesAnyBucket) return false;
      }
      return true;
    });
  }, [drillProjects, colFilters, lookups, filterStatus, filterDivisionTop, filterScheme, filterSector, delayBuckets]);

  const sortedDrillProjects = useMemo(() => {
    if (!sortKey) return filteredDrillProjects;
    const sortValue = (p: ProjectListItem): string | number | null => {
      switch (sortKey) {
        case 'projectName': return p.projectName;
        case 'division': return divisionNameOf(p, lookups);
        case 'nitDate': return p.nitDate;
        case 'delay': return delayDaysOf(p);
        default: return null;
      }
    };
    const arr = [...filteredDrillProjects];
    arr.sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredDrillProjects, sortKey, sortDir, lookups]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {TENDER_SUB_STAGES.map((stage) => {
          const count = byStage.get(stage)?.length ?? 0;
          const active = selectedStage === stage;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => onSelect(active ? null : stage)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left shadow-sm transition-colors',
                active
                  ? 'border-[#1E3A5F] bg-[#EFF6FF]'
                  : 'border-[#E5E7EB] bg-white hover:border-[#93C5FD] hover:bg-[#F0F7FF]',
              )}
              aria-pressed={active}
            >
              <span
                className={cn(
                  'text-[10.5px] font-bold uppercase tracking-wider',
                  active ? 'text-[#1E3A5F]' : 'text-[#6B7280]',
                )}
              >
                {stage}
              </span>
              <span className="text-[22px] font-extrabold tabular-nums text-[#111827]">
                {count}
              </span>
              <span className="text-[11px] text-[#6B7280]">
                {count === 1 ? 'Project' : 'Projects'}
              </span>
            </button>
          );
        })}
      </div>

      {selectedStage ? (
        <section className="rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#F3F4F6] bg-[#F9FAFB] px-3 py-2">
            <span className="text-[12px] font-bold text-[#111827]">
              {selectedStage}
              <span className="ml-2 text-[11px] font-normal text-[#6B7280]">
                — {activeFilterCount > 0
                  ? `${filteredDrillProjects.length} of ${drillProjects.length} project${drillProjects.length === 1 ? '' : 's'} match ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}`
                  : `${drillProjects.length} project${drillProjects.length === 1 ? '' : 's'}`}
              </span>
            </span>
            <div className="flex items-center gap-3">
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-[11px] font-semibold text-[#B91C1C] hover:underline"
                >
                  Clear/Reset Filters ({activeFilterCount})
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="text-[11px] font-semibold text-[#6B7280] hover:text-[#B91C1C]"
              >
                Clear
              </button>
            </div>
          </div>

          {/* bhaveshTask.md — 4 prominent dropdowns shown above the table,
              combined via AND with each other, the Delay column's own
              checkbox filter, and the per-column filters below. */}
          <div className="grid grid-cols-2 gap-2 border-b border-[#F3F4F6] bg-[#FAFBFC] px-3 py-3 sm:grid-cols-4">
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Execution Status</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-8 rounded border border-[#D1D5DB] bg-white px-2 text-[12px]"
              >
                <option value="">All</option>
                {EXECUTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Division</span>
              <select
                value={filterDivisionTop}
                onChange={(e) => setFilterDivisionTop(e.target.value)}
                className="h-8 rounded border border-[#D1D5DB] bg-white px-2 text-[12px]"
              >
                <option value="">All</option>
                {divisionOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Scheme</span>
              <select
                value={filterScheme}
                onChange={(e) => setFilterScheme(e.target.value)}
                className="h-8 rounded border border-[#D1D5DB] bg-white px-2 text-[12px]"
              >
                <option value="">All</option>
                {schemeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Sector</span>
              <select
                value={filterSector}
                onChange={(e) => setFilterSector(e.target.value)}
                className="h-8 rounded border border-[#D1D5DB] bg-white px-2 text-[12px]"
              >
                <option value="">All</option>
                {sectorOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {drillProjects.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-[#6B7280]">
              No projects currently in this sub-stage.
            </p>
          ) : filteredDrillProjects.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-[#6B7280]">
              No projects match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                    <th className="px-3 py-2 text-left align-top">
                      <button type="button" onClick={() => onSort('projectName')} className="cursor-pointer hover:text-[#1E3A5F]">
                        Project Name<span aria-hidden>{arrow('projectName')}</span>
                      </button>
                      <ColumnFilterText value={colFilters.projectName ?? ''} onChange={(v) => setColFilter('projectName', v)} />
                    </th>
                    <th className="px-3 py-2 text-left align-top">
                      <button type="button" onClick={() => onSort('division')} className="cursor-pointer hover:text-[#1E3A5F]">
                        Division<span aria-hidden>{arrow('division')}</span>
                      </button>
                      <ColumnFilterSelect
                        value={colFilters.division ?? ''}
                        onChange={(v) => setColFilter('division', v)}
                        options={divisionOptions.map((d) => ({ value: d, label: d }))}
                      />
                    </th>
                    {/* Department / Agreement Number come from a per-row ProjectDetail
                        fetch (not the list payload) — filtering on them would mean
                        pre-fetching every row's detail just to filter, which the task's
                        own "avoid unnecessary/inefficient API calls" guidance rules out. */}
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Agreement Number</th>
                    <th className="px-3 py-2 text-left align-top">
                      <div>Contractor</div>
                      <ColumnFilterText value={colFilters.contractor ?? ''} onChange={(v) => setColFilter('contractor', v)} />
                    </th>
                    <th className="px-3 py-2 text-left align-top">
                      <div>NIT Number</div>
                      <ColumnFilterText value={colFilters.nitNumber ?? ''} onChange={(v) => setColFilter('nitNumber', v)} />
                    </th>
                    <th className="px-3 py-2 text-left align-top">
                      <button type="button" onClick={() => onSort('nitDate')} className="cursor-pointer hover:text-[#1E3A5F]">
                        NIT Date<span aria-hidden>{arrow('nitDate')}</span>
                      </button>
                      <ColumnFilterText
                        value={colFilters.nitDate ?? ''}
                        onChange={(v) => setColFilter('nitDate', v)}
                        placeholder="e.g. 2026-08"
                      />
                    </th>
                    {/* Every row already shares the same value (drillProjects is
                        pre-scoped to `selectedStage`) — a filter here would only
                        ever be all-or-nothing, so it's left as a plain header. */}
                    <th className="px-3 py-2 text-left">Current Sub-Stage</th>
                    <th className="px-3 py-2 text-left align-top">
                      <button type="button" onClick={() => onSort('delay')} className="cursor-pointer hover:text-[#1E3A5F]" title="Sort by delay — Low to High / High to Low">
                        Delay<span aria-hidden>{arrow('delay')}</span>
                      </button>
                      <DelayColumnFilter buckets={delayBuckets} onToggle={toggleDelayBucket} />
                    </th>
                    <th className="px-3 py-2 text-left align-top">
                      <div>Last Updated</div>
                      <ColumnFilterText
                        value={colFilters.lastUpdated ?? ''}
                        onChange={(v) => setColFilter('lastUpdated', v)}
                        placeholder="e.g. 2026-08"
                      />
                    </th>
                    <th className="px-3 py-2 text-left align-top">
                      <div>Remarks</div>
                      <ColumnFilterText value={colFilters.remark ?? ''} onChange={(v) => setColFilter('remark', v)} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDrillProjects.map((p) => (
                    <ProjectDrillRow
                      key={p.projectId}
                      project={p}
                      lookups={lookups}
                      subStage={selectedStage}
                      onOpenRemarks={onOpenRemarks}
                      onNavigateAway={onNavigateAway}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <p className="rounded border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-4 text-center text-[12px] text-[#6B7280]">
          Click a sub-stage card above to see the projects in that stage.
        </p>
      )}
    </div>
  );
}

/**
 * Department + Agreement Number are on ProjectDetail (not on the list
 * endpoint) — pull them per row via cached RTK Query fetches.
 */
function ProjectDrillRow({
  project, lookups, subStage, onOpenRemarks, onNavigateAway,
}: {
  project: ProjectListItem;
  lookups: Lookups | undefined;
  subStage: TenderSubStage;
  onOpenRemarks: (project: ProjectListItem) => void;
  onNavigateAway: () => void;
}): JSX.Element {
  const detail = useGetProjectQuery(project.projectId);
  const division = project.divisionId
    ? lookups?.divisions.find((d) => d.divisionId === project.divisionId)?.divisionName ?? '—'
    : '—';
  const delayDays = delayDaysOf(project);
  return (
    <tr className="border-b border-[#F3F4F6] hover:bg-[#F0F7FF]">
      <td className="px-3 py-2 font-semibold">
        <NavLink
          to={`/projects/${project.projectId}`}
          onClick={onNavigateAway}
          className="text-[#1D4ED8] hover:underline"
          title="Open project details"
        >
          {project.projectName}
        </NavLink>
      </td>
      <td className="px-3 py-2 text-[#374151]">{division}</td>
      <td className="px-3 py-2 text-[#374151]">
        {detail.isLoading ? '…' : detail.data?.sponsoringDept ?? '—'}
      </td>
      <td className="px-3 py-2 text-[#374151]">
        {detail.isLoading ? '…' : detail.data?.agreementNumber ?? '—'}
      </td>
      <td className="px-3 py-2 text-[#374151]">{project.contractor ?? '—'}</td>
      <td className="px-3 py-2">
        <NitReadOnly value={project.nitNumber} kind="number" />
      </td>
      <td className="px-3 py-2">
        <NitReadOnly value={project.nitDate} kind="date" />
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10.5px] font-semibold text-[#1D4ED8]">
          {subStage}
        </span>
      </td>
      <td className="px-3 py-2 tabular-nums">
        {delayDays === null ? (
          <span className="text-[#D1D5DB]">—</span>
        ) : delayDays > 0 ? (
          <span className="font-semibold text-[#B91C1C]">{delayDays}d overdue</span>
        ) : (
          <span className="text-[#15803D]">On track</span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-[#6B7280]">
        {project.lastUpdated ? formatDate(project.lastUpdated.slice(0, 10)) : '—'}
      </td>
      <td className="px-3 py-2">
        <RemarksButton remark={project.remark} onClick={() => onOpenRemarks(project)} />
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Project Stages tab
 * ──────────────────────────────────────────────────────────────────────── */

/** Division name for a project, resolved via the lookups list (same as the row cells use). */
function divisionNameOf(project: ProjectListItem, lookups: Lookups | undefined): string | null {
  return project.divisionId
    ? (lookups?.divisions.find((d) => d.divisionId === project.divisionId)?.divisionName ?? null)
    : null;
}

function StagesTab({
  stagesActive, onStageChange, byStage, projects, selectedIds,
  onToggleSelect, onSelectAll, onClearSelection,
  canPrev, canNext, canTransfer, busy, onTransferPrev, onTransferNext,
  lookups,
}: {
  stagesActive: TenderSubStage;
  onStageChange: (s: TenderSubStage) => void;
  byStage: Map<TenderSubStage, ProjectListItem[]>;
  projects: ProjectListItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  canPrev: boolean;
  canNext: boolean;
  canTransfer: boolean;
  busy: boolean;
  onTransferPrev: () => void;
  onTransferNext: () => void;
  lookups: Lookups | undefined;
}): JSX.Element {
  const selectionCount = selectedIds.size;

  // Task: Table Column Filter for the Project Stages table — same
  // independent-per-column pattern as every other table in the app.
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (key: string, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const activeFilterCount = Object.values(colFilters).filter((v) => v.trim() !== '').length;

  const divisionOptions = useMemo(() => {
    const names = new Set((lookups?.divisions ?? []).map((d) => d.divisionName));
    return Array.from(names).sort();
  }, [lookups]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (!textMatches(colFilters.projectName ?? '', p.projectName)) return false;
      if (!selectMatches(colFilters.division ?? '', divisionNameOf(p, lookups))) return false;
      if (!textMatches(colFilters.contractor ?? '', p.contractor)) return false;
      if (!textMatches(colFilters.nitNumber ?? '', p.nitNumber)) return false;
      return true;
    });
  }, [projects, colFilters, lookups]);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-1.5">
          {TENDER_SUB_STAGES.map((stage, i) => {
            const count = byStage.get(stage)?.length ?? 0;
            const active = stage === stagesActive;
            return (
              <li key={stage} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onStageChange(stage)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
                    active
                      ? 'bg-[#1E3A5F] text-white shadow'
                      : 'bg-white text-[#374151] hover:bg-[#EFF6FF] hover:text-[#1E3A5F]',
                  )}
                  aria-pressed={active}
                >
                  <span className="whitespace-nowrap">{stage}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[9.5px] font-bold tabular-nums',
                      active ? 'bg-white/20 text-white' : 'bg-[#E5E7EB] text-[#6B7280]',
                    )}
                  >
                    {count}
                  </span>
                </button>
                {i < TENDER_SUB_STAGES.length - 1 ? (
                  <span aria-hidden className="text-[14px] text-[#9CA3AF]">
                    →
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-semibold text-[#111827]">Selected:</span>
          <span className="tabular-nums text-[#374151]">
            {selectionCount} of {filteredProjects.length}
          </span>
          {filteredProjects.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => onSelectAll(filteredProjects.map((p) => p.projectId))}
                className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
                disabled={busy}
              >
                Select all
              </button>
              {selectionCount > 0 ? (
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="text-[11px] font-semibold text-[#6B7280] hover:text-[#B91C1C] hover:underline"
                  disabled={busy}
                >
                  Clear
                </button>
              ) : null}
            </>
          ) : null}
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={() => setColFilters({})}
              className="text-[11px] font-semibold text-[#B91C1C] hover:underline"
            >
              Clear column filters ({activeFilterCount})
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!canTransfer ? (
            <span className="text-[11px] italic text-[#B45309]">
              Read-only — needs Update Projects permission.
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={onTransferPrev}
            disabled={!canTransfer || !canPrev || selectionCount === 0 || busy}
            title={!canPrev ? 'Already at the first sub-stage' : undefined}
          >
            ← Transfer to Previous Stage
          </Button>
          <Button
            size="sm"
            onClick={onTransferNext}
            disabled={!canTransfer || !canNext || selectionCount === 0 || busy}
            title={!canNext ? 'Already at the final sub-stage' : undefined}
          >
            Transfer to Next Stage →
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#F3F4F6] bg-[#F9FAFB] px-3 py-2 text-[12px] font-bold text-[#111827]">
          {stagesActive}
          <span className="ml-2 text-[11px] font-normal text-[#6B7280]">
            — {activeFilterCount > 0
              ? `${filteredProjects.length} of ${projects.length} project${projects.length === 1 ? '' : 's'} match ${activeFilterCount} column filter${activeFilterCount === 1 ? '' : 's'}`
              : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
            {stagesActive === FINAL_TENDER_SUB_STAGE ? (
              <span className="ml-2 rounded bg-[#F0FDF4] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803D]">
                ✓ Tender complete — eligible for Construction
              </span>
            ) : null}
          </span>
        </div>
        {projects.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-[#6B7280]">
            No projects currently in this sub-stage.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                  <th className="w-8 px-2 py-2 align-top">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 py-2 text-left align-top">
                    <div>Project Name</div>
                    <ColumnFilterText value={colFilters.projectName ?? ''} onChange={(v) => setColFilter('projectName', v)} />
                  </th>
                  <th className="px-3 py-2 text-left align-top">
                    <div>Division</div>
                    <ColumnFilterSelect
                      value={colFilters.division ?? ''}
                      onChange={(v) => setColFilter('division', v)}
                      options={divisionOptions.map((d) => ({ value: d, label: d }))}
                    />
                  </th>
                  <th className="px-3 py-2 text-left align-top">
                    <div>Contractor</div>
                    <ColumnFilterText value={colFilters.contractor ?? ''} onChange={(v) => setColFilter('contractor', v)} />
                  </th>
                  <th className="px-3 py-2 text-left align-top">
                    <div>NIT Number</div>
                    <ColumnFilterText value={colFilters.nitNumber ?? ''} onChange={(v) => setColFilter('nitNumber', v)} />
                  </th>
                  <th className="px-3 py-2 text-left align-top">NIT Date</th>
                  {stagesActive === 'NIT Published' ? (
                    <th className="px-3 py-2 text-left align-top">
                      <span className="sr-only">NIT actions</span>
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-left align-top">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={stagesActive === 'NIT Published' ? 8 : 7}
                      className="px-3 py-6 text-center text-[#6B7280]"
                    >
                      No projects match the current column filters.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((p) => (
                    <StageProjectRow
                      key={p.projectId}
                      project={p}
                      lookups={lookups}
                      checked={selectedIds.has(p.projectId)}
                      onToggle={() => onToggleSelect(p.projectId)}
                      disableCheckbox={!canTransfer || busy}
                      isNitPublished={stagesActive === 'NIT Published'}
                      canEditNit={canTransfer}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * StageProjectRow — one row inside the Project Stages tab's table.
 *
 * Splits out its own state so NIT edits stay local (no lifting drafts up
 * to the parent). When the active sub-stage is NIT Published we render an
 * inline text + date input pair + a Save button that only lights up when
 * the row is dirty. Elsewhere the NIT columns render read-only with the
 * "Yet to be Published / Yet to Declare" placeholders.
 * ──────────────────────────────────────────────────────────────────────── */

function StageProjectRow({
  project, lookups, checked, onToggle, disableCheckbox,
  isNitPublished, canEditNit,
}: {
  project: ProjectListItem;
  lookups: Lookups | undefined;
  checked: boolean;
  onToggle: () => void;
  disableCheckbox: boolean;
  isNitPublished: boolean;
  canEditNit: boolean;
}): JSX.Element {
  const division = project.divisionId
    ? lookups?.divisions.find((d) => d.divisionId === project.divisionId)?.divisionName ?? '—'
    : '—';
  const [updateNit, nitState] = useUpdateProjectNitMutation();
  const [nitNumber, setNitNumber] = useState<string>(project.nitNumber ?? '');
  const [nitDate, setNitDate] = useState<string>(project.nitDate ?? '');
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Server value can shift under us (e.g. after a bulk transfer refetch or
  // audit tag invalidation). Re-hydrate the row's local edits from the
  // authoritative list-item so the display stays consistent.
  useEffect(() => {
    setNitNumber(project.nitNumber ?? '');
    setNitDate(project.nitDate ?? '');
  }, [project.nitNumber, project.nitDate]);

  const dirty =
    (project.nitNumber ?? '') !== nitNumber || (project.nitDate ?? '') !== nitDate;

  const handleSave = async (): Promise<void> => {
    setSaveErr(null);
    try {
      await updateNit({
        projectId: project.projectId,
        body: {
          nitNumber: nitNumber.trim() === '' ? null : nitNumber.trim(),
          nitDate: nitDate === '' ? null : nitDate,
        },
      }).unwrap();
    } catch (err) {
      setSaveErr(readError(err));
    }
  };

  return (
    <tr
      className={cn(
        'border-b border-[#F3F4F6]',
        checked ? 'bg-[#EFF6FF]' : 'hover:bg-[#F0F7FF]',
      )}
    >
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${project.projectName}`}
          className="h-3.5 w-3.5 cursor-pointer accent-[#1D4ED8]"
          disabled={disableCheckbox}
        />
      </td>
      <td className="px-3 py-2 font-semibold text-[#1D4ED8]">
        {project.projectName}
      </td>
      <td className="px-3 py-2 text-[#374151]">{division}</td>
      <td className="px-3 py-2 text-[#374151]">{project.contractor ?? '—'}</td>

      {/* NIT Number cell — editable only during NIT Published */}
      <td className="px-3 py-2">
        {isNitPublished ? (
          <input
            type="text"
            value={nitNumber}
            onChange={(e) => setNitNumber(e.target.value)}
            placeholder="e.g. NIT/BUIDCO/2026/07"
            className="h-8 w-40 rounded border border-[#D1D5DB] bg-white px-2 text-[12px] disabled:cursor-not-allowed disabled:bg-[#F9FAFB]"
            disabled={!canEditNit || nitState.isLoading}
          />
        ) : (
          <NitReadOnly value={project.nitNumber} kind="number" />
        )}
      </td>

      {/* NIT Date cell — editable only during NIT Published */}
      <td className="px-3 py-2">
        {isNitPublished ? (
          <input
            type="date"
            value={nitDate}
            onChange={(e) => setNitDate(e.target.value)}
            className="h-8 w-36 rounded border border-[#D1D5DB] bg-white px-2 text-[12px] disabled:cursor-not-allowed disabled:bg-[#F9FAFB]"
            disabled={!canEditNit || nitState.isLoading}
          />
        ) : (
          <NitReadOnly value={project.nitDate} kind="date" />
        )}
      </td>

      {/* Save button — only rendered during NIT Published */}
      {isNitPublished ? (
        <td className="px-3 py-2">
          <div className="flex flex-col items-start gap-1">
            <Button
              size="xs"
              onClick={() => void handleSave()}
              disabled={!canEditNit || nitState.isLoading || !dirty}
              title={
                !canEditNit
                  ? 'Read-only — needs Update Projects permission'
                  : !dirty
                    ? 'No changes to save'
                    : undefined
              }
            >
              {nitState.isLoading ? 'Saving…' : dirty ? 'Save' : '✓ Saved'}
            </Button>
            {saveErr ? (
              <span className="text-[10.5px] text-[#B91C1C]">{saveErr}</span>
            ) : null}
          </div>
        </td>
      ) : null}

      <td className="px-3 py-2 tabular-nums text-[#6B7280]">
        {project.lastUpdated ? formatDate(project.lastUpdated.slice(0, 10)) : '—'}
      </td>
    </tr>
  );
}

/**
 * Render helper — actual NIT value in text-000 or the placeholder styled in
 * amber italic so users see the difference between "not yet entered" and
 * a real value at a glance.
 */
function NitReadOnly({
  value,
  kind,
}: {
  value: string | null;
  kind: 'number' | 'date';
}): JSX.Element {
  if (!value || value.trim() === '') {
    const placeholder = kind === 'number' ? displayNitNumber(null) : displayNitDate(null);
    return <span className="italic text-[#B45309]">{placeholder}</span>;
  }
  if (kind === 'date') {
    return <span className="tabular-nums text-[#111827]">{formatDate(value)}</span>;
  }
  return <span className="text-[#111827]">{value}</span>;
}

function readError(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const e = (data as { error?: { message?: string } }).error;
      if (e?.message) return e.message;
    }
  }
  return 'Bulk transfer failed. Please retry.';
}
