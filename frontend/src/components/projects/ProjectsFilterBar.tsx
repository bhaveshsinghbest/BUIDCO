import { useEffect, useState } from 'react';
import { useGetLookupsQuery } from '../../app/api/lookupsApi';
import { useAppSelector } from '../../app/hooks';
import { selectCurrentUser } from '../../features/auth/authSlice';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import type { ProjectFilters } from '../../hooks/useProjectFilters';

interface Props {
  filters: ProjectFilters;
  setFilter: <K extends keyof ProjectFilters>(key: K, value: string) => void;
  clearAll: () => void;
  activeCount: number;
  totalRows: number | undefined;
}

const STATUSES = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Delayed'];
// New Project Stage options (Phase A §3.2).
const STAGES = ['Conceptualisation', 'Design', 'Pre-Tender', 'Tender', 'Construction', 'O&M', 'Other'];
const CONTRACT_TYPES = ['Work Contract', 'Service Contract', 'O&M Contract', 'Others'];

/**
 * Task 8 — searches used to fire on every keystroke, so typing "drainage"
 * issued eight requests and the first seven were already stale. 300 ms is
 * long enough to coalesce a burst of typing and short enough that the
 * results still feel immediate.
 */
const SEARCH_DEBOUNCE_MS = 300;
const PRIORITIES = ['High', 'Medium', 'Low', 'N/A'];

export function ProjectsFilterBar({
  filters,
  setFilter,
  clearAll,
  activeCount,
  totalRows,
}: Props): JSX.Element {
  const { data: lookups } = useGetLookupsQuery();

  /**
   * Task 8 — debounced search.
   *
   * The input is driven by local draft state so typing stays instant, while
   * the committed filter (which updates the URL and refetches) lags by
   * SEARCH_DEBOUNCE_MS. Two effects, deliberately:
   *
   *  - the sync effect accepts changes that arrive from OUTSIDE this
   *    component — the Universal Search bar navigates to
   *    /projects?search=..., and without this the box would still show
   *    whatever was last typed here.
   *  - the commit effect pushes local edits outward, and returns early when
   *    the two already agree, which is what stops the pair from ping-ponging.
   */
  const [draftSearch, setDraftSearch] = useState(filters.search);

  useEffect(() => {
    setDraftSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (draftSearch === filters.search) return undefined;
    const id = setTimeout(() => setFilter('search', draftSearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // setFilter is recreated per render by useProjectFilters; depending on it
    // would restart the timer on every render and defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSearch, filters.search]);
  const currentUser = useAppSelector(selectCurrentUser);

  // PDs are pinned to a division — their Region + Division filters lock to
  // whatever they picked at login. Backend enforces this too (sessionDivisionId
  // wins over query-string divisionId), but the UI shouldn't tease them with
  // a picker that can't change anything.
  const isPd = currentUser?.role === 'PD';
  const pdDivision = isPd && currentUser.divisionId !== undefined
    ? lookups?.divisions.find((d) => d.divisionId === currentUser.divisionId) ?? null
    : null;
  const pdRegion = pdDivision
    ? lookups?.regions.find((r) => r.regionId === pdDivision.regionId) ?? null
    : null;

  return (
    <div className="space-y-2 rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-sm">
      {/* Row 1 — search + 5 selects. Mobile: 1 col; sm: 2 cols; md: 3 cols;
          lg+: original single row with wider search. Search spans the full row
          up to md so the placeholder text isn't truncated. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.5fr_repeat(5,_1fr)]">
        <label className="grid gap-1 sm:col-span-2 md:col-span-3 lg:col-span-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Search</span>
          <Input
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="Name, NIT number, ID — Hindi or English"
          />
        </label>

        <Select
          label="Execution Status"
          value={filters.status}
          onChange={(v) => setFilter('status', v)}
          options={STATUSES}
        />
        <Select
          label="Stage"
          value={filters.projectStage}
          onChange={(v) => setFilter('projectStage', v)}
          options={STAGES}
        />
        <Select
          label="Contract Type"
          value={filters.contractType}
          onChange={(v) => setFilter('contractType', v)}
          options={CONTRACT_TYPES}
        />
        <Select
          label="Priority"
          value={filters.priority}
          onChange={(v) => setFilter('priority', v)}
          options={PRIORITIES}
        />
        <Select
          label="Sector"
          value={filters.sectorId}
          onChange={(v) => setFilter('sectorId', v)}
          options={
            lookups?.sectors.map((s) => ({ value: String(s.sectorId), label: s.sectorName })) ?? []
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {isPd ? (
          // PD's Region + Division are read-only, pinned to their session's
          // division from JWT. Show a locked pill for each so the context
          // is visible without inviting an interaction that can't succeed.
          <>
            <LockedPill label="Region" value={pdRegion?.regionName ?? '—'} />
            <LockedPill label="Division" value={pdDivision?.divisionName ?? '—'} />
          </>
        ) : (
          <>
            <Select
              label="Region"
              value={filters.regionId}
              onChange={(v) => {
                // Changing region resets division so the sub-filter doesn't
                // point at a division outside the newly-picked region.
                setFilter('regionId', v);
                if (filters.divisionId) setFilter('divisionId', '');
              }}
              options={
                lookups?.regions.map((r) => ({ value: String(r.regionId), label: r.regionName })) ?? []
              }
              compact
            />
            <Select
              label="Division"
              value={filters.divisionId}
              onChange={(v) => setFilter('divisionId', v)}
              options={
                (lookups?.divisions ?? [])
                  .filter((d) => !filters.regionId || String(d.regionId) === filters.regionId)
                  .map((d) => ({ value: String(d.divisionId), label: d.divisionName }))
              }
              compact
            />
          </>
        )}
        <Select
          label="Scheme"
          value={filters.schemeId}
          onChange={(v) => setFilter('schemeId', v)}
          options={
            lookups?.schemes.map((s) => ({ value: String(s.schemeId), label: s.schemeName })) ?? []
          }
          compact
        />
        <div className="flex w-full items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          <span className="text-xs text-[#6B7280]">
            {activeCount > 0 ? (
              <>
                <span className="font-semibold text-[#1E3A5F]">{activeCount}</span> filter
                {activeCount === 1 ? '' : 's'} active
              </>
            ) : (
              'No filters'
            )}
            {typeof totalRows === 'number' ? (
              <>
                {' '}
                · <span className="font-semibold tabular-nums">{totalRows}</span> shown
              </>
            ) : null}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAll}
            disabled={activeCount === 0}
            aria-label="Clear all filters"
          >
            Clear all
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<string | { value: string; label: string }>;
  compact?: boolean;
}

function Select({ label, value, onChange, options, compact }: SelectProps): JSX.Element {
  const normalized = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <label
      className={cn(
        'grid gap-1',
        // `compact` = row-2 selects (Region/Division/Scheme). They need width
        // for readable dropdown labels but must not push past the viewport on
        // phones — 100% on mobile, fixed 200px from sm+ where flex-wrap has
        // room to breathe.
        compact ? 'w-full sm:min-w-[200px] sm:w-auto' : '',
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full rounded border border-[#D1D5DB] bg-white px-2 text-sm text-[#111827]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A5F] focus-visible:ring-offset-1',
        )}
      >
        <option value="">All</option>
        {normalized.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Read-only counterpart to <Select> used when the filter is dictated by the
 * session (e.g. a PD's Region + Division from JWT). Visually mirrors the
 * disabled dropdown look but signals with a 🔒 that it's session-locked,
 * not just empty.
 */
function LockedPill({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="grid w-full gap-1 sm:min-w-[200px] sm:w-auto">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
        {label}
      </span>
      <div
        className="flex h-9 w-full items-center gap-1.5 rounded border border-[#E5E7EB] bg-[#F3F4F6] px-2 text-sm text-[#374151]"
        title={`${label} is locked to your assigned ${label.toLowerCase()} for this session.`}
        aria-label={`${label}: ${value} (locked)`}
      >
        <span aria-hidden className="text-[11px]">🔒</span>
        <span className="truncate font-semibold">{value}</span>
      </div>
    </div>
  );
}
