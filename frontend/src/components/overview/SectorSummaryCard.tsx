import { NavLink } from 'react-router-dom';
import { useGetSectorSummaryQuery } from '../../app/api/kpisApi';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

export function SectorSummaryCard(): JSX.Element {
  const { data, isLoading, error } = useGetSectorSummaryQuery();
  const rows = data?.items ?? [];
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Sector Snapshot</CardTitle>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
          {rows.length} sector{rows.length === 1 ? '' : 's'}
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-[#B91C1C]">Could not load sector summary.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No sector data.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => {
              const pctCompleted = row.total > 0 ? (row.completed / row.total) * 100 : 0;
              return (
                <li key={row.sectorId}>
                  <NavLink
                    to={`/projects?sectorId=${row.sectorId}`}
                    className="group grid grid-cols-[1fr_auto] gap-x-2 rounded-lg border border-[#E5E7EB] p-2.5 transition-all hover:-translate-y-0.5 hover:border-[#93C5FD] hover:bg-[#F9FAFB] hover:shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#111827] group-hover:text-[#1E3A5F]">
                        {row.sectorName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#6B7280]">
                      <span>
                        <span className="font-semibold text-[#15803D]">{row.completed}</span> /
                        <span className="font-semibold text-[#111827]"> {row.total}</span>
                      </span>
                    </div>
                    <div className="col-span-2 mt-1 flex h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
                      <div
                        className={cn('h-full bg-[#15803D] transition-all')}
                        style={{ width: `${pctCompleted}%` }}
                      />
                      <div
                        className={cn('h-full bg-[#1D4ED8]')}
                        style={{ width: `${(row.inProgress / row.total) * 100}%` }}
                      />
                      <div
                        className={cn('h-full bg-[#B91C1C]')}
                        style={{ width: `${(row.delayed / row.total) * 100}%` }}
                      />
                    </div>
                    <div className="col-span-2 mt-0.5 flex items-center gap-3 text-[10px] text-[#6B7280]">
                      <Chip color="#15803D">{row.completed} Done</Chip>
                      <Chip color="#1D4ED8">{row.inProgress} In progress</Chip>
                      {row.delayed > 0 ? <Chip color="#B91C1C">{row.delayed} Delayed</Chip> : null}
                    </div>
                  </NavLink>
                  <ProgressAria value={row.total} total={maxTotal} label={row.sectorName} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }): JSX.Element {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

function ProgressAria({ value, total, label }: { value: number; total: number; label: string }): JSX.Element {
  return (
    <span
      role="progressbar"
      aria-label={`${label} share`}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
      className="sr-only"
    />
  );
}
