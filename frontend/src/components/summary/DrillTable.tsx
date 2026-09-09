import { useMemo, useState } from 'react';
import { useListProjectsQuery } from '../../app/api/projectsApi';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches, minMatches } from '../ui/ColumnFilter';
import { ColumnsButton, ExportButton, useColumnVisibility, type ToolbarColumn } from '../ui/TableToolbar';
import { useTableExport, type ExportColumn, type ExportFormat } from '../../lib/tableExport';
import { PriorityBadge } from '../projects/PriorityBadge';
import { ProgressBar } from '../projects/ProgressBar';
import { ProjectProfileModal } from '../projects/ProjectProfileModal';
import { StatusBadge } from '../projects/StatusBadge';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';
import { formatPercent } from '../../lib/formatters';
import type { ProjectListItem } from '../../types/api';

interface Props {
  /** Scoping filters — any combination may be set; all combine with AND. */
  schemeId?: number;
  sectorId?: number;
  districtId?: number;
  divisionId?: number;
  /** Region roll-up (North/South Bihar) — the backend expands it to the
   *  region's divisions, so it combines with the other filters. */
  regionId?: number;
  /** Execution status (e.g. 'Completed', 'Delayed') — used by the
   *  clickable portfolio-metric blocks on Divisions/Schemes/etc. */
  status?: string;
  labelOfContext: string;
  onClose: () => void;
}

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Delayed'] as const;
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low', 'N/A'] as const;

interface ColFilters {
  project: string;
  city: string;
  contractor: string;
  status: string;
  priority: string;
  minPhysical: string;
  minFinancial: string;
}
const EMPTY_FILTERS: ColFilters = {
  project: '', city: '', contractor: '', status: '', priority: '', minPhysical: '', minFinancial: '',
};

// Task 8 — Customizable Fields / Download. One shared column-visibility
// preference across every drill-in (Sectors/Schemes/Divisions all show the
// same project-register slice), matching the Projects page's persisted
// ⚙ Columns picker.
const DRILL_COLUMNS: ToolbarColumn[] = [
  { key: 'sno', label: '#' },
  { key: 'project', label: 'Project' },
  { key: 'city', label: 'City' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'physicalPct', label: 'Physical %' },
  { key: 'financialPct', label: 'Financial %' },
];
const DRILL_STORAGE_KEY = 'buidco.drillTable.columns.v1';

const EXPORT_COLUMNS: ExportColumn<ProjectListItem>[] = [
  { key: 'sno', label: '#', align: 'right', exportValue: (_r, i) => i + 1 },
  { key: 'project', label: 'Project', exportValue: (r) => r.projectName || '—' },
  { key: 'city', label: 'City', exportValue: (r) => r.city ?? '—' },
  { key: 'contractor', label: 'Contractor', exportValue: (r) => r.contractor ?? '—' },
  { key: 'status', label: 'Status', exportValue: (r) => r.status ?? '—' },
  { key: 'priority', label: 'Priority', exportValue: (r) => r.priority ?? '—' },
  { key: 'physicalPct', label: 'Physical %', align: 'right', exportValue: (r) => formatPercent(r.effectivePhysicalPct) },
  { key: 'financialPct', label: 'Financial %', align: 'right', exportValue: (r) => formatPercent(r.financialProgressPct) },
];

export function DrillTable({
  schemeId,
  sectorId,
  districtId,
  divisionId,
  regionId,
  status,
  labelOfContext,
  onClose,
}: Props): JSX.Element {
  const args = {
    limit: 100,
    ...(schemeId ? { schemeId } : {}),
    ...(sectorId ? { sectorId } : {}),
    ...(districtId ? { districtId } : {}),
    ...(divisionId ? { divisionId } : {}),
    ...(regionId ? { regionId } : {}),
    ...(status ? { status } : {}),
  };
  const { data, isLoading } = useListProjectsQuery(args);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const [modalProjectId, setModalProjectId] = useState<string | null>(null);

  // Task 2/3/4 — Table Column Filter: each column narrows independently,
  // combined with AND, applied client-side on top of the server-scoped set.
  const [colFilters, setColFilters] = useState<ColFilters>(EMPTY_FILTERS);
  const setCol = <K extends keyof ColFilters>(key: K, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const anyColFilterActive = Object.values(colFilters).some((v) => v.trim() !== '');

  const { visibility, isVisible, toggle, showAll, hideAll } = useColumnVisibility(DRILL_STORAGE_KEY, DRILL_COLUMNS);
  const { exporting, error: exportError, run } = useTableExport<ProjectListItem>();

  const filteredItems = useMemo(() => {
    return items.filter((p) =>
      textMatches(colFilters.project, p.projectName) &&
      textMatches(colFilters.city, p.city) &&
      textMatches(colFilters.contractor, p.contractor) &&
      selectMatches(colFilters.status, p.status) &&
      selectMatches(colFilters.priority, p.priority) &&
      minMatches(colFilters.minPhysical, p.effectivePhysicalPct) &&
      minMatches(colFilters.minFinancial, p.financialProgressPct),
    );
  }, [items, colFilters]);

  const visibleColumnCount = DRILL_COLUMNS.filter((c) => isVisible(c.key)).length;

  const runExport = (format: ExportFormat): void => {
    void run(
      format,
      EXPORT_COLUMNS.filter((c) => isVisible(c.key)),
      filteredItems,
      { title: `BUIDCO - ${labelOfContext}`, sheetName: 'Projects', fileNamePrefix: 'Projects' },
    );
  };

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2">
          <div className="text-[13px] font-bold text-[#111827]">
            {labelOfContext}
            <span className="ml-2 text-[12px] font-normal text-[#6B7280]">
              — {filteredItems.length} of {items.length} project{items.length !== 1 ? 's' : ''}
              {data?.nextCursor ? ' (showing first page)' : ''} · click any row to open profile
            </span>
            {exportError ? <span className="ml-2 text-[12px] font-normal text-[#B91C1C]">{exportError}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            {anyColFilterActive ? (
              <button
                type="button"
                onClick={() => setColFilters(EMPTY_FILTERS)}
                className="text-[11px] font-semibold text-[#B91C1C] hover:underline"
              >
                Clear column filters
              </button>
            ) : null}
            <ColumnsButton
              columns={DRILL_COLUMNS}
              visibility={visibility}
              onToggle={toggle}
              onShowAll={showAll}
              onHideAll={hideAll}
            />
            <ExportButton onExport={runExport} exporting={exporting} />
            <button
              type="button"
              onClick={onClose}
              className="text-[18px] leading-none text-[#9CA3AF] hover:text-[#B91C1C]"
              aria-label="Close drill-in"
            >
              ×
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
            No projects in this bucket yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                  {isVisible('sno') ? <th className="px-3 py-2 text-left align-top">#</th> : null}
                  {isVisible('project') ? (
                    <th className="px-3 py-2 text-left align-top">
                      <div>Project</div>
                      <ColumnFilterText value={colFilters.project} onChange={(v) => setCol('project', v)} />
                    </th>
                  ) : null}
                  {isVisible('city') ? (
                    <th className="px-3 py-2 text-left align-top">
                      <div>City</div>
                      <ColumnFilterText value={colFilters.city} onChange={(v) => setCol('city', v)} />
                    </th>
                  ) : null}
                  {isVisible('contractor') ? (
                    <th className="px-3 py-2 text-left align-top">
                      <div>Contractor</div>
                      <ColumnFilterText value={colFilters.contractor} onChange={(v) => setCol('contractor', v)} />
                    </th>
                  ) : null}
                  {isVisible('status') ? (
                    <th className="px-3 py-2 text-left align-top">
                      <div>Status</div>
                      <ColumnFilterSelect
                        value={colFilters.status}
                        onChange={(v) => setCol('status', v)}
                        options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                      />
                    </th>
                  ) : null}
                  {isVisible('priority') ? (
                    <th className="px-3 py-2 text-left align-top">
                      <div>Priority</div>
                      <ColumnFilterSelect
                        value={colFilters.priority}
                        onChange={(v) => setCol('priority', v)}
                        options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
                      />
                    </th>
                  ) : null}
                  {isVisible('physicalPct') ? (
                    <th className="px-3 py-2 text-left align-top">
                      <div>Physical %</div>
                      <ColumnFilterText value={colFilters.minPhysical} onChange={(v) => setCol('minPhysical', v)} placeholder="≥ %" />
                    </th>
                  ) : null}
                  {isVisible('financialPct') ? (
                    <th className="px-3 py-2 text-left align-top">
                      <div>Financial %</div>
                      <ColumnFilterText value={colFilters.minFinancial} onChange={(v) => setCol('minFinancial', v)} placeholder="≥ %" />
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="px-3 py-6 text-center text-[#6B7280]">
                      No projects match the current column filters.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((p, idx) => (
                    <tr
                      key={p.projectId}
                      role="button"
                      tabIndex={0}
                      onClick={() => setModalProjectId(p.projectId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setModalProjectId(p.projectId);
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-b border-[#F3F4F6] hover:bg-[#F0F7FF] focus:bg-[#EFF6FF] focus:outline-none',
                        idx % 2 === 1 && 'bg-[#FAFAFA]',
                      )}
                    >
                      {isVisible('sno') ? <td className="px-3 py-2 text-[#9CA3AF]">{idx + 1}</td> : null}
                      {isVisible('project') ? (
                        <td className="px-3 py-2 font-semibold text-[#1D4ED8]">{p.projectName}</td>
                      ) : null}
                      {isVisible('city') ? <td className="px-3 py-2 text-[#374151]">{p.city ?? '—'}</td> : null}
                      {isVisible('contractor') ? (
                        <td className="px-3 py-2 text-[#374151]">{p.contractor ?? '—'}</td>
                      ) : null}
                      {isVisible('status') ? (
                        <td className="px-3 py-2">
                          <StatusBadge status={p.status} />
                        </td>
                      ) : null}
                      {isVisible('priority') ? (
                        <td className="px-3 py-2">
                          <PriorityBadge priority={p.priority} />
                        </td>
                      ) : null}
                      {isVisible('physicalPct') ? (
                        <td className="px-3 py-2">
                          <ProgressBar value={p.effectivePhysicalPct} color="#3B82F6" />
                        </td>
                      ) : null}
                      {isVisible('financialPct') ? (
                        <td className="px-3 py-2">
                          <ProgressBar value={p.financialProgressPct} color="#22C55E" />
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProjectProfileModal
        projectId={modalProjectId}
        onClose={() => setModalProjectId(null)}
      />
    </>
  );
}
