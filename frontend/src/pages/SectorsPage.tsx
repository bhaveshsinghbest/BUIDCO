import { useMemo, useState } from 'react';
import { useGetSectorSummaryQuery } from '../app/api/kpisApi';
import { useCreateSectorMutation } from '../app/api/lookupsApi';
import { DrillTable } from '../components/summary/DrillTable';
import { SummaryCard } from '../components/summary/SummaryCard';
import { AddLookupItemDialog } from '../components/ui/AddLookupItemDialog';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { ColumnFilterText, textMatches, minMatches } from '../components/ui/ColumnFilter';
import { ColumnsButton, ExportButton, useColumnVisibility, type ToolbarColumn } from '../components/ui/TableToolbar';
import { useTableExport, type ExportColumn, type ExportFormat } from '../lib/tableExport';
import { cn } from '../lib/utils';
import type { SectorSummaryRow } from '../types/api';

const CARD_COLORS = [
  '#1E3A5F',
  '#2563EB',
  '#3B82F6',
  '#60A5FA',
  '#93C5FD',
];

/** The five portfolio-metric blocks (Task 2) — each drills into the
 *  matching slice of projects across every sector. */
type MetricKey = 'sectors' | 'projects' | 'completed' | 'inProgress' | 'delayed';

const METRIC_LABELS: Record<MetricKey, string> = {
  sectors: 'All sectors',
  projects: 'All projects',
  completed: 'Completed projects',
  inProgress: 'In-progress projects',
  delayed: 'Delayed projects',
};

const METRIC_STATUS: Partial<Record<MetricKey, string>> = {
  completed: 'Completed',
  inProgress: 'In Progress',
  delayed: 'Delayed',
};

export function SectorsPage(): JSX.Element {
  const summary = useGetSectorSummaryQuery();
  const [createSector] = useCreateSectorMutation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const totals = useMemo(() => {
    const items = summary.data?.items ?? [];
    return {
      sectors: items.length,
      projects: items.reduce((s, r) => s + r.total, 0),
      completed: items.reduce((s, r) => s + r.completed, 0),
      inProgress: items.reduce((s, r) => s + r.inProgress, 0),
      delayed: items.reduce((s, r) => s + r.delayed, 0),
    };
  }, [summary.data]);

  const selected = selectedId
    ? summary.data?.items.find((r) => r.sectorId === selectedId) ?? null
    : null;

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#111827]">Sector-wise Summary</h1>
          <p className="text-[12.5px] text-[#6B7280]">
            Click a sector card to drill into its projects.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Add New Sector</Button>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric
          label="Sectors"
          value={totals.sectors}
          tone="brand"
          active={activeMetric === 'sectors'}
          onClick={() => {
            setSelectedId(null);
            setActiveMetric((k) => (k === 'sectors' ? null : 'sectors'));
          }}
        />
        <Metric
          label="Projects"
          value={totals.projects}
          tone="brand"
          active={activeMetric === 'projects'}
          onClick={() => {
            setSelectedId(null);
            setActiveMetric((k) => (k === 'projects' ? null : 'projects'));
          }}
        />
        <Metric
          label="Completed"
          value={totals.completed}
          tone="success"
          active={activeMetric === 'completed'}
          onClick={() => {
            setSelectedId(null);
            setActiveMetric((k) => (k === 'completed' ? null : 'completed'));
          }}
        />
        <Metric
          label="In Progress"
          value={totals.inProgress}
          tone="info"
          active={activeMetric === 'inProgress'}
          onClick={() => {
            setSelectedId(null);
            setActiveMetric((k) => (k === 'inProgress' ? null : 'inProgress'));
          }}
        />
        <Metric
          label="Delayed"
          value={totals.delayed}
          tone="danger"
          active={activeMetric === 'delayed'}
          onClick={() => {
            setSelectedId(null);
            setActiveMetric((k) => (k === 'delayed' ? null : 'delayed'));
          }}
        />
      </div>

      {activeMetric === 'sectors' ? (
        // Bug fix (Task 2, round 2): this used to render the exact same
        // unfiltered DrillTable as "Projects", so the two blocks showed
        // identical rows. "Sectors" now shows sector-level rows instead.
        <SectorsTable items={summary.data?.items ?? []} onClose={() => setActiveMetric(null)} />
      ) : activeMetric ? (
        <DrillTable
          {...(METRIC_STATUS[activeMetric] ? { status: METRIC_STATUS[activeMetric] } : {})}
          labelOfContext={METRIC_LABELS[activeMetric]}
          onClose={() => setActiveMetric(null)}
        />
      ) : null}

      {summary.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (summary.data?.items ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-[12.5px] text-[#6B7280]">
            No sectors configured yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(summary.data?.items ?? []).map((row, idx) => (
            <SummaryCard
              key={row.sectorId}
              name={row.sectorName}
              color={CARD_COLORS[idx % CARD_COLORS.length] ?? '#1E3A5F'}
              total={row.total}
              completed={row.completed}
              inProgress={row.inProgress}
              delayed={row.delayed}
              active={selectedId === row.sectorId}
              onClick={() => {
                setActiveMetric(null);
                setSelectedId(selectedId === row.sectorId ? null : row.sectorId);
              }}
            />
          ))}
        </div>
      )}

      {selected ? (
        <DrillTable
          sectorId={selected.sectorId}
          labelOfContext={selected.sectorName}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {addOpen ? (
        <AddLookupItemDialog
          title="Add New Sector"
          fieldLabel="Sector Name"
          placeholder="e.g. Water Supply"
          onSubmit={(name) => createSector(name).unwrap()}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </article>
  );
}

function Metric({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'brand' | 'info' | 'success' | 'danger';
  active?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const palette: Record<typeof tone, { border: string; text: string; activeBg: string }> = {
    brand: { border: 'border-t-[#1E3A5F]', text: 'text-[#1E3A5F]', activeBg: 'bg-[#1E3A5F]' },
    info: { border: 'border-t-[#1D4ED8]', text: 'text-[#1D4ED8]', activeBg: 'bg-[#1D4ED8]' },
    success: { border: 'border-t-[#15803D]', text: 'text-[#15803D]', activeBg: 'bg-[#15803D]' },
    danger: { border: 'border-t-[#B91C1C]', text: 'text-[#B91C1C]', activeBg: 'bg-[#B91C1C]' },
  };
  const p = palette[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded border-t-4 border-x border-b px-3 py-2 text-left shadow-sm transition-all',
        active
          ? cn(p.activeBg, p.border, 'border-x-transparent border-b-transparent text-white')
          : cn('border-[#E5E7EB] bg-white hover:-translate-y-0.5 hover:shadow-md', p.border),
      )}
    >
      <div
        className={cn(
          'text-[10.5px] font-bold uppercase tracking-wider',
          active ? 'text-white/80' : 'text-[#6B7280]',
        )}
      >
        {label}
      </div>
      <div className={cn('text-xl font-extrabold tabular-nums', active ? 'text-white' : p.text)}>
        {value}
      </div>
    </button>
  );
}

interface SectorColFilters {
  name: string;
  minTotal: string;
  minCompleted: string;
  minDelayed: string;
}
const EMPTY_SECTOR_FILTERS: SectorColFilters = { name: '', minTotal: '', minCompleted: '', minDelayed: '' };

const SECTOR_COLUMNS: ToolbarColumn[] = [
  { key: 'sector', label: 'Sector' },
  { key: 'total', label: 'Total' },
  { key: 'completed', label: 'Completed' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'delayed', label: 'Delayed' },
];
const SECTOR_STORAGE_KEY = 'buidco.sectorsTable.columns.v1';

const SECTOR_EXPORT_COLUMNS: ExportColumn<SectorSummaryRow>[] = [
  { key: 'sector', label: 'Sector', exportValue: (r) => r.sectorName },
  { key: 'total', label: 'Total', align: 'right', exportValue: (r) => r.total },
  { key: 'completed', label: 'Completed', align: 'right', exportValue: (r) => r.completed },
  { key: 'inProgress', label: 'In Progress', align: 'right', exportValue: (r) => r.inProgress },
  { key: 'delayed', label: 'Delayed', align: 'right', exportValue: (r) => r.delayed },
];

/**
 * Sector-level rows (name + status rollup) — the "Sectors" block's detail
 * table. Distinct from DrillTable (which lists individual projects) so it
 * no longer duplicates what "Projects" shows.
 */
function SectorsTable({
  items,
  onClose,
}: {
  items: SectorSummaryRow[];
  onClose: () => void;
}): JSX.Element {
  const [colFilters, setColFilters] = useState<SectorColFilters>(EMPTY_SECTOR_FILTERS);
  const setCol = <K extends keyof SectorColFilters>(key: K, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const anyActive = Object.values(colFilters).some((v) => v.trim() !== '');

  const { visibility, isVisible, toggle, showAll, hideAll } = useColumnVisibility(SECTOR_STORAGE_KEY, SECTOR_COLUMNS);
  const { exporting, error: exportError, run } = useTableExport<SectorSummaryRow>();

  const filtered = useMemo(() => {
    return items.filter(
      (r) =>
        textMatches(colFilters.name, r.sectorName) &&
        minMatches(colFilters.minTotal, r.total) &&
        minMatches(colFilters.minCompleted, r.completed) &&
        minMatches(colFilters.minDelayed, r.delayed),
    );
  }, [items, colFilters]);

  const visibleColumnCount = SECTOR_COLUMNS.filter((c) => isVisible(c.key)).length;

  const runExport = (format: ExportFormat): void => {
    void run(
      format,
      SECTOR_EXPORT_COLUMNS.filter((c) => isVisible(c.key)),
      filtered,
      { title: 'BUIDCO - Sector Summary', sheetName: 'Sectors', fileNamePrefix: 'Sectors' },
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2">
        <div className="text-[13px] font-bold text-[#111827]">
          All sectors
          <span className="ml-2 text-[12px] font-normal text-[#6B7280]">
            — {filtered.length} of {items.length} sector{items.length !== 1 ? 's' : ''}
          </span>
          {exportError ? <span className="ml-2 text-[12px] font-normal text-[#B91C1C]">{exportError}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {anyActive ? (
            <button
              type="button"
              onClick={() => setColFilters(EMPTY_SECTOR_FILTERS)}
              className="text-[11px] font-semibold text-[#B91C1C] hover:underline"
            >
              Clear column filters
            </button>
          ) : null}
          <ColumnsButton
            columns={SECTOR_COLUMNS}
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
      {items.length === 0 ? (
        <div className="p-6 text-center text-[12.5px] text-[#6B7280]">No sectors configured yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                {isVisible('sector') ? (
                  <th className="px-3 py-2 text-left align-top">
                    <div>Sector</div>
                    <ColumnFilterText value={colFilters.name} onChange={(v) => setCol('name', v)} />
                  </th>
                ) : null}
                {isVisible('total') ? (
                  <th className="px-3 py-2 text-right align-top">
                    <div>Total</div>
                    <ColumnFilterText value={colFilters.minTotal} onChange={(v) => setCol('minTotal', v)} placeholder="≥" align="right" />
                  </th>
                ) : null}
                {isVisible('completed') ? (
                  <th className="px-3 py-2 text-right align-top">
                    <div>Completed</div>
                    <ColumnFilterText value={colFilters.minCompleted} onChange={(v) => setCol('minCompleted', v)} placeholder="≥" align="right" />
                  </th>
                ) : null}
                {isVisible('inProgress') ? <th className="px-3 py-2 text-right align-top">In Progress</th> : null}
                {isVisible('delayed') ? (
                  <th className="px-3 py-2 text-right align-top">
                    <div>Delayed</div>
                    <ColumnFilterText value={colFilters.minDelayed} onChange={(v) => setCol('minDelayed', v)} placeholder="≥" align="right" />
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-3 py-6 text-center text-[#6B7280]">
                    No sectors match the current column filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr
                    key={r.sectorId}
                    className={cn('border-b border-[#F3F4F6]', idx % 2 === 1 && 'bg-[#FAFAFA]')}
                  >
                    {isVisible('sector') ? (
                      <td className="px-3 py-2 font-semibold text-[#1D4ED8]">{r.sectorName}</td>
                    ) : null}
                    {isVisible('total') ? (
                      <td className="px-3 py-2 text-right tabular-nums text-[#111827]">{r.total}</td>
                    ) : null}
                    {isVisible('completed') ? (
                      <td className="px-3 py-2 text-right tabular-nums text-[#15803D]">{r.completed}</td>
                    ) : null}
                    {isVisible('inProgress') ? (
                      <td className="px-3 py-2 text-right tabular-nums text-[#1D4ED8]">{r.inProgress}</td>
                    ) : null}
                    {isVisible('delayed') ? (
                      <td className="px-3 py-2 text-right tabular-nums text-[#B91C1C]">{r.delayed}</td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
