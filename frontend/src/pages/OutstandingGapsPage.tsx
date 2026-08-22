import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useGetOutstandingGapsQuery } from '../app/api/kpisApi';
import { useGetLookupsQuery } from '../app/api/lookupsApi';
import { PriorityBadge } from '../components/projects/PriorityBadge';
import { StatusBadge } from '../components/projects/StatusBadge';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches } from '../components/ui/ColumnFilter';
import { cn } from '../lib/utils';
import type { Priority, ProjectStatus } from '../types/api';

const PRIORITY_FILTERS: Array<Priority | 'All'> = ['All', 'High', 'Medium', 'Low', 'N/A'];
const STATUS_OPTIONS: ProjectStatus[] = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Delayed'];

export function OutstandingGapsPage(): JSX.Element {
  const { data, isLoading } = useGetOutstandingGapsQuery();
  const lookups = useGetLookupsQuery();
  const [priority, setPriority] = useState<Priority | 'All'>('All');
  const [search, setSearch] = useState('');

  const districtsById = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of lookups.data?.districts ?? []) map.set(d.districtId, d.districtName);
    return map;
  }, [lookups.data]);
  const sectorsById = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of lookups.data?.sectors ?? []) map.set(s.sectorId, s.sectorName);
    return map;
  }, [lookups.data]);

  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (key: string, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const activeFilterCount = Object.values(colFilters).filter((v) => v.trim() !== '').length;

  const sectorFilterOptions = useMemo(() => {
    const names = new Set((lookups.data?.sectors ?? []).map((s) => s.sectorName));
    return Array.from(names).sort().map((n) => ({ value: n, label: n }));
  }, [lookups.data]);
  const districtFilterOptions = useMemo(() => {
    const names = new Set((lookups.data?.districts ?? []).map((d) => d.districtName));
    return Array.from(names).sort().map((n) => ({ value: n, label: n }));
  }, [lookups.data]);
  const priorityFilterOptions = (['High', 'Medium', 'Low', 'N/A'] as Priority[]).map((p) => ({ value: p, label: p }));
  const statusFilterOptions = STATUS_OPTIONS.map((s) => ({ value: s, label: s }));

  const rows = useMemo(() => {
    const all = data?.items ?? [];
    const term = search.trim().toLowerCase();
    let subset = all;
    if (priority !== 'All') subset = subset.filter((r) => (r.priority ?? 'N/A') === priority);
    if (term) {
      subset = subset.filter((r) => {
        const name = (r.projectName ?? '').toLowerCase();
        const remark = (r.remark ?? '').toLowerCase();
        return name.includes(term) || remark.includes(term);
      });
    }
    subset = subset.filter((r) => {
      const sectorName = r.sectorId ? sectorsById.get(r.sectorId) ?? '' : '';
      const districtName = r.districtId ? districtsById.get(r.districtId) ?? '' : '';
      if (!textMatches(colFilters.project ?? '', r.projectName)) return false;
      if (!selectMatches(colFilters.sector ?? '', sectorName)) return false;
      if (!selectMatches(colFilters.district ?? '', districtName)) return false;
      if (!selectMatches(colFilters.priority ?? '', r.priority ?? 'N/A')) return false;
      if (!selectMatches(colFilters.status ?? '', r.status)) return false;
      if (!textMatches(colFilters.remark ?? '', r.remark)) return false;
      return true;
    });
    return subset;
  }, [data, priority, search, colFilters, sectorsById, districtsById]);

  const counts = useMemo(() => {
    const all = data?.items ?? [];
    const byPri: Record<Priority, number> = { High: 0, Medium: 0, Low: 0, 'N/A': 0 };
    for (const r of all) {
      const key = (r.priority ?? 'N/A') as Priority;
      byPri[key] = (byPri[key] ?? 0) + 1;
    }
    return byPri;
  }, [data]);

  return (
    <article className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-[#111827]">Outstanding Gaps</h1>
        <p className="text-[12.5px] text-[#6B7280]">
          Projects flagged with an outstanding gap (Input Sheet → Section 07 → "Yes — Gap Exists").
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {PRIORITY_FILTERS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPriority(p)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors',
              priority === p
                ? 'border-[#B91C1C] bg-[#B91C1C] text-white'
                : 'border-[#D1D5DB] bg-white text-[#6B7280] hover:text-[#374151]',
            )}
          >
            {p}
            {p !== 'All' && counts[p] > 0 ? (
              <span className="ml-1 text-[10.5px] opacity-80">({counts[p]})</span>
            ) : null}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project or remark…"
          className="ml-auto h-8 w-72 rounded border border-[#D1D5DB] px-3 text-[12.5px]"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
              {priority === 'All' && !search && activeFilterCount === 0
                ? 'No outstanding gaps recorded. \u{1F389}'
                : 'No gaps match the current filter.'}
            </div>
          ) : (
            <>
              {activeFilterCount > 0 ? (
                <div className="flex items-center justify-end border-b border-[#F3F4F6] bg-[#F9FAFB] px-4 py-1.5">
                  <button
                    type="button"
                    onClick={() => setColFilters({})}
                    className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
                  >
                    Clear column filters ({activeFilterCount})
                  </button>
                </div>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left align-top">
                        <div>Project</div>
                        <ColumnFilterText value={colFilters.project ?? ''} onChange={(v) => setColFilter('project', v)} />
                      </th>
                      <th className="px-4 py-2 text-left align-top">
                        <div>Sector</div>
                        <ColumnFilterSelect value={colFilters.sector ?? ''} onChange={(v) => setColFilter('sector', v)} options={sectorFilterOptions} />
                      </th>
                      <th className="px-4 py-2 text-left align-top">
                        <div>District</div>
                        <ColumnFilterSelect value={colFilters.district ?? ''} onChange={(v) => setColFilter('district', v)} options={districtFilterOptions} />
                      </th>
                      <th className="px-4 py-2 text-left align-top">
                        <div>Priority</div>
                        <ColumnFilterSelect value={colFilters.priority ?? ''} onChange={(v) => setColFilter('priority', v)} options={priorityFilterOptions} />
                      </th>
                      <th className="px-4 py-2 text-left align-top">
                        <div>Status</div>
                        <ColumnFilterSelect value={colFilters.status ?? ''} onChange={(v) => setColFilter('status', v)} options={statusFilterOptions} />
                      </th>
                      <th className="px-4 py-2 text-left align-top">
                        <div>Gap / Remark</div>
                        <ColumnFilterText value={colFilters.remark ?? ''} onChange={(v) => setColFilter('remark', v)} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr
                        key={r.projectId}
                        className={cn(
                          'border-b border-[#F3F4F6] align-top hover:bg-[#F9FAFB]',
                          idx % 2 === 1 && 'bg-[#FAFAFA]',
                        )}
                      >
                        <td className="px-4 py-2 text-[#9CA3AF]">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <NavLink
                            to={`/projects/${r.projectId}`}
                            className="font-semibold text-[#1D4ED8] hover:underline"
                          >
                            {r.projectName ?? r.projectId}
                          </NavLink>
                        </td>
                        <td className="px-4 py-2 text-[#374151]">
                          {r.sectorId ? sectorsById.get(r.sectorId) ?? `#${r.sectorId}` : '—'}
                        </td>
                        <td className="px-4 py-2 text-[#374151]">
                          {r.districtId ? districtsById.get(r.districtId) ?? `#${r.districtId}` : '—'}
                        </td>
                        <td className="px-4 py-2">
                          <PriorityBadge priority={r.priority} />
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-2 text-[#B91C1C]">
                          <span className="mr-1">⚠</span>
                          <span className="whitespace-pre-line">{r.remark ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
