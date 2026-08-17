import { useMemo, useState } from 'react';
import { useGetSchemeSummaryQuery, useGetSchemeChartQuery } from '../app/api/kpisApi';
import { useCreateSchemeMutation } from '../app/api/lookupsApi';
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
import { formatCurrencyCr, formatPercent } from '../lib/formatters';
import type { SchemeSummaryRow } from '../types/api';

const CARD_COLORS = [
  '#1E3A5F',
  '#2563EB',
  '#3B82F6',
  '#60A5FA',
  '#93C5FD',
  '#A5B4FC',
  '#C7D2FE',
  '#7C3AED',
];

/** The five portfolio-metric blocks (Task 4) — each drills into the
 *  matching slice of projects across every scheme. */
type MetricKey = 'schemes' | 'projects' | 'completed' | 'inProgress' | 'delayed';

const METRIC_LABELS: Record<MetricKey, string> = {
  schemes: 'All projects — across all schemes',
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

export function SchemesPage(): JSX.Element {
  const summary = useGetSchemeSummaryQuery();
  const chart = useGetSchemeChartQuery();
  const [createScheme] = useCreateSchemeMutation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const totals = useMemo(() => {
    const items = summary.data?.items ?? [];
    return {
      schemes: items.length,
      projects: items.reduce((s, r) => s + r.total, 0),
      completed: items.reduce((s, r) => s + r.completed, 0),
      inProgress: items.reduce((s, r) => s + r.inProgress, 0),
      delayed: items.reduce((s, r) => s + r.delayed, 0),
    };
  }, [summary.data]);

  const chartById = useMemo(() => {
    const map = new Map<
      number,
      {
        avgPhysicalPct: number | null;
        avgFinancialPct: number | null;
        totalAgreementCr: number | null;
        totalFinancialCr: number | null;
      }
    >();
    for (const c of chart.data?.items ?? []) {
      map.set(c.schemeId, {
        avgPhysicalPct: c.avgPhysicalPct,
        avgFinancialPct: c.avgFinancialPct,
        totalAgreementCr: c.totalAgreementCr,
        totalFinancialCr: c.totalFinancialCr,
      });
    }
    return map;
  }, [chart.data]);

  const selected = selectedId
    ? summary.data?.items.find((r) => r.schemeId === selectedId) ?? null
    : null;

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#111827]">Scheme-wise Summary</h1>
          <p className="text-[12.5px] text-[#6B7280]">
            Click a scheme card to drill into its projects.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Add New Scheme</Button>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric
          label="Schemes"
          value={totals.schemes}
          tone="brand"
          active={activeMetric === 'schemes'}
          onClick={() => {
            setSelectedId(null);
            setActiveMetric((k) => (k === 'schemes' ? null : 'schemes'));
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

      {activeMetric === 'schemes' ? (
        // Bug fix (Task 3): this used to render the exact same unfiltered
        // DrillTable as "Projects", so the two blocks showed identical rows.
        // "Schemes" now shows scheme-level rows instead of project rows.
        <SchemesTable
          items={summary.data?.items ?? []}
          chartById={chartById}
          onClose={() => setActiveMetric(null)}
          onSelectScheme={(id) => {
            setActiveMetric(null);
            setSelectedId(id);
          }}
        />
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
            No schemes configured yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(summary.data?.items ?? []).map((row, idx) => {
            const chartEntry = chartById.get(row.schemeId);
            return (
              <SummaryCard
                key={row.schemeId}
                name={row.schemeName}
                color={CARD_COLORS[idx % CARD_COLORS.length] ?? '#1E3A5F'}
                total={row.total}
                completed={row.completed}
                inProgress={row.inProgress}
                delayed={row.delayed}
                extraStat={
                  chartEntry?.avgPhysicalPct !== null && chartEntry?.avgPhysicalPct !== undefined
                    ? { label: 'Avg physical', value: formatPercent(chartEntry.avgPhysicalPct) }
                    : undefined
                }
                money={
                  chartEntry
                    ? {
                        allotedCr: chartEntry.totalAgreementCr,
                        spentCr: chartEntry.totalFinancialCr,
                      }
                    : undefined
                }
                active={selectedId === row.schemeId}
                onClick={() => {
                  setActiveMetric(null);
                  setSelectedId(selectedId === row.schemeId ? null : row.schemeId);
                }}
              />
            );
          })}
        </div>
      )}

      {selected ? (
        <DrillTable
          schemeId={selected.schemeId}
          labelOfContext={selected.schemeName}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {addOpen ? (
        <AddLookupItemDialog
          title="Add New Scheme"
          fieldLabel="Scheme Name"
          placeholder="e.g. Namami Gange"
          onSubmit={(name) => createScheme(name).unwrap()}
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

interface SchemeColFilters {
  name: string;
  minTotal: string;
  minCompleted: string;
  minDelayed: string;
  minPhysical: string;
}
const EMPTY_SCHEME_FILTERS: SchemeColFilters = {
  name: '', minTotal: '', minCompleted: '', minDelayed: '', minPhysical: '',
};

// Task 8 — Customizable Fields / Download for the "Schemes" block's table.
const SCHEME_COLUMNS: ToolbarColumn[] = [
  { key: 'scheme', label: 'Scheme' },
  { key: 'total', label: 'Total' },
  { key: 'completed', label: 'Completed' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'avgPhysical', label: 'Avg Physical %' },
  { key: 'alloted', label: 'Alloted' },
  { key: 'spent', label: 'Spent' },
];
const SCHEME_STORAGE_KEY = 'buidco.schemesTable.columns.v1';

interface SchemeExportRow {
  schemeName: string;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  avgPhysicalPct: number | null;
  alloted: number | null;
  spent: number | null;
}
const SCHEME_EXPORT_COLUMNS: ExportColumn<SchemeExportRow>[] = [
  { key: 'scheme', label: 'Scheme', exportValue: (r) => r.schemeName },
  { key: 'total', label: 'Total', align: 'right', exportValue: (r) => r.total },
  { key: 'completed', label: 'Completed', align: 'right', exportValue: (r) => r.completed },
  { key: 'inProgress', label: 'In Progress', align: 'right', exportValue: (r) => r.inProgress },
  { key: 'delayed', label: 'Delayed', align: 'right', exportValue: (r) => r.delayed },
  { key: 'avgPhysical', label: 'Avg Physical %', align: 'right', exportValue: (r) => formatPercent(r.avgPhysicalPct) },
  { key: 'alloted', label: 'Alloted', align: 'right', exportValue: (r) => formatCurrencyCr(r.alloted) },
  { key: 'spent', label: 'Spent', align: 'right', exportValue: (r) => formatCurrencyCr(r.spent) },
];

/**
 * Scheme-level rows (name + status/financial rollup) — the "Schemes" block's
 * detail table. Distinct from DrillTable (which lists individual projects)
 * so it no longer duplicates what "Projects" shows (Task 3 bug fix).
 */
function SchemesTable({
  items,
  chartById,
  onClose,
  onSelectScheme,
}: {
  items: SchemeSummaryRow[];
  chartById: Map<number, {
    avgPhysicalPct: number | null;
    avgFinancialPct: number | null;
    totalAgreementCr: number | null;
    totalFinancialCr: number | null;
  }>;
  onClose: () => void;
  onSelectScheme: (schemeId: number) => void;
}): JSX.Element {
  const [colFilters, setColFilters] = useState<SchemeColFilters>(EMPTY_SCHEME_FILTERS);
  const setCol = <K extends keyof SchemeColFilters>(key: K, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const anyActive = Object.values(colFilters).some((v) => v.trim() !== '');

  const { visibility, isVisible, toggle, showAll, hideAll } = useColumnVisibility(SCHEME_STORAGE_KEY, SCHEME_COLUMNS);
  const { exporting, error: exportError, run } = useTableExport<SchemeExportRow>();

  const filtered = useMemo(() => {
    return items.filter((r) => {
      const physical = chartById.get(r.schemeId)?.avgPhysicalPct ?? null;
      return (
        textMatches(colFilters.name, r.schemeName) &&
        minMatches(colFilters.minTotal, r.total) &&
        minMatches(colFilters.minCompleted, r.completed) &&
        minMatches(colFilters.minDelayed, r.delayed) &&
        minMatches(colFilters.minPhysical, physical)
      );
    });
  }, [items, chartById, colFilters]);

  const visibleColumnCount = SCHEME_COLUMNS.filter((c) => isVisible(c.key)).length;

  const runExport = (format: ExportFormat): void => {
    const exportRows: SchemeExportRow[] = filtered.map((r) => {
      const chartEntry = chartById.get(r.schemeId);
      return {
        schemeName: r.schemeName,
        total: r.total,
        completed: r.completed,
        inProgress: r.inProgress,
        delayed: r.delayed,
        avgPhysicalPct: chartEntry?.avgPhysicalPct ?? null,
        alloted: chartEntry?.totalAgreementCr ?? null,
        spent: chartEntry?.totalFinancialCr ?? null,
      };
    });
    void run(
      format,
      SCHEME_EXPORT_COLUMNS.filter((c) => isVisible(c.key)),
      exportRows,
      { title: 'BUIDCO - Scheme Summary', sheetName: 'Schemes', fileNamePrefix: 'Schemes' },
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2">
        <div className="text-[13px] font-bold text-[#111827]">
          All schemes
          <span className="ml-2 text-[12px] font-normal text-[#6B7280]">
            — {filtered.length} of {items.length} scheme{items.length !== 1 ? 's' : ''} · click any row to see its projects
          </span>
          {exportError ? <span className="ml-2 text-[12px] font-normal text-[#B91C1C]">{exportError}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {anyActive ? (
            <button
              type="button"
              onClick={() => setColFilters(EMPTY_SCHEME_FILTERS)}
              className="text-[11px] font-semibold text-[#B91C1C] hover:underline"
            >
              Clear column filters
            </button>
          ) : null}
          <ColumnsButton
            columns={SCHEME_COLUMNS}
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
        <div className="p-6 text-center text-[12.5px] text-[#6B7280]">No schemes configured yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                {isVisible('scheme') ? (
                  <th className="px-3 py-2 text-left align-top">
                    <div>Scheme</div>
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
                {isVisible('avgPhysical') ? (
                  <th className="px-3 py-2 text-right align-top">
                    <div>Avg Physical %</div>
                    <ColumnFilterText value={colFilters.minPhysical} onChange={(v) => setCol('minPhysical', v)} placeholder="≥ %" align="right" />
                  </th>
                ) : null}
                {isVisible('alloted') ? <th className="px-3 py-2 text-right align-top">Alloted</th> : null}
                {isVisible('spent') ? <th className="px-3 py-2 text-right align-top">Spent</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-3 py-6 text-center text-[#6B7280]">
                    No schemes match the current column filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const chartEntry = chartById.get(r.schemeId);
                  return (
                    <tr
                      key={r.schemeId}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectScheme(r.schemeId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectScheme(r.schemeId);
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-b border-[#F3F4F6] hover:bg-[#F0F7FF] focus:bg-[#EFF6FF] focus:outline-none',
                        idx % 2 === 1 && 'bg-[#FAFAFA]',
                      )}
                    >
                      {isVisible('scheme') ? (
                        <td className="px-3 py-2 font-semibold text-[#1D4ED8]">{r.schemeName}</td>
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
                      {isVisible('avgPhysical') ? (
                        <td className="px-3 py-2 text-right tabular-nums text-[#374151]">
                          {formatPercent(chartEntry?.avgPhysicalPct ?? null)}
                        </td>
                      ) : null}
                      {isVisible('alloted') ? (
                        <td className="px-3 py-2 text-right tabular-nums text-[#1E3A5F]">
                          {formatCurrencyCr(chartEntry?.totalAgreementCr ?? null)}
                        </td>
                      ) : null}
                      {isVisible('spent') ? (
                        <td className="px-3 py-2 text-right tabular-nums text-[#15803D]">
                          {formatCurrencyCr(chartEntry?.totalFinancialCr ?? null)}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
