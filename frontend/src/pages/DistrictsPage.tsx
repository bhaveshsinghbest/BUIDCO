import { useMemo, useState } from 'react';
import { useGetDistrictSummaryQuery } from '../app/api/kpisApi';
import { DrillTable } from '../components/summary/DrillTable';
import { SummaryCard } from '../components/summary/SummaryCard';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { formatPercent } from '../lib/formatters';

const CARD_COLORS = [
  '#1E3A5F',
  '#2563EB',
  '#3B82F6',
  '#60A5FA',
  '#93C5FD',
  '#A5B4FC',
];

type SortKey = 'total' | 'delayed' | 'completion' | 'name';

export function DistrictsPage(): JSX.Element {
  const summary = useGetDistrictSummaryQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [search, setSearch] = useState('');

  const items = useMemo(() => summary.data?.items ?? [], [summary.data?.items]);

  const totals = useMemo(
    () => ({
      districts: items.filter((d) => d.total > 0).length,
      projects: items.reduce((s, r) => s + r.total, 0),
      completed: items.reduce((s, r) => s + r.completed, 0),
      delayed: items.reduce((s, r) => s + r.delayed, 0),
    }),
    [items],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = term
      ? items.filter((d) => d.districtName.toLowerCase().includes(term))
      : items;
    list = [...list].sort((a, b) => {
      if (sortKey === 'name') return a.districtName.localeCompare(b.districtName);
      if (sortKey === 'delayed') return b.delayed - a.delayed;
      if (sortKey === 'completion') {
        return (b.completionRatePct ?? -1) - (a.completionRatePct ?? -1);
      }
      return b.total - a.total;
    });
    return list;
  }, [items, search, sortKey]);

  const selected = selectedId
    ? items.find((r) => r.districtId === selectedId) ?? null
    : null;

  return (
    <article className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-[#111827]">District-wise Summary</h1>
        <p className="text-[12.5px] text-[#6B7280]">
          Click a district card to drill into its projects.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Districts with projects" value={totals.districts} tone="brand" />
        <Metric label="Total projects" value={totals.projects} tone="brand" />
        <Metric label="Completed" value={totals.completed} tone="success" />
        <Metric label="Delayed" value={totals.delayed} tone="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'total', label: 'Sort: Total ↓' },
            { id: 'delayed', label: 'Sort: Delayed ↓' },
            { id: 'completion', label: 'Sort: Completion % ↓' },
            { id: 'name', label: 'Sort: A–Z' },
          ] satisfies Array<{ id: SortKey; label: string }>
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSortKey(s.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors',
              sortKey === s.id
                ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                : 'border-[#D1D5DB] bg-white text-[#6B7280] hover:text-[#374151]',
            )}
          >
            {s.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search district…"
          className="ml-auto h-8 w-64 rounded border border-[#D1D5DB] px-3 text-[12.5px]"
        />
      </div>

      {summary.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-[12.5px] text-[#6B7280]">
            {items.length === 0 ? 'No districts configured yet.' : 'No districts match the search.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((row, idx) => (
            <SummaryCard
              key={row.districtId}
              name={row.districtName}
              color={CARD_COLORS[idx % CARD_COLORS.length] ?? '#1E3A5F'}
              total={row.total}
              completed={row.completed}
              delayed={row.delayed}
              extraStat={
                row.completionRatePct !== null
                  ? { label: 'Completion', value: formatPercent(row.completionRatePct) }
                  : undefined
              }
              active={selectedId === row.districtId}
              onClick={() =>
                setSelectedId(selectedId === row.districtId ? null : row.districtId)
              }
            />
          ))}
        </div>
      )}

      {selected ? (
        <DrillTable
          districtId={selected.districtId}
          labelOfContext={selected.districtName}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </article>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'brand' | 'success' | 'danger';
}): JSX.Element {
  const palette: Record<typeof tone, { border: string; text: string }> = {
    brand: { border: 'border-t-[#1E3A5F]', text: 'text-[#1E3A5F]' },
    success: { border: 'border-t-[#15803D]', text: 'text-[#15803D]' },
    danger: { border: 'border-t-[#B91C1C]', text: 'text-[#B91C1C]' },
  };
  const p = palette[tone];
  return (
    <div
      className={cn(
        'rounded border-t-4 border-x border-b border-[#E5E7EB] bg-white px-3 py-2 shadow-sm',
        p.border,
      )}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
        {label}
      </div>
      <div className={cn('text-xl font-extrabold tabular-nums', p.text)}>{value}</div>
    </div>
  );
}
