import { NavLink } from 'react-router-dom';
import { useGetPbgExpiryAlertsQuery } from '../../app/api/kpisApi';
import { formatDate } from '../../lib/formatters';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

export function PbgAlertsCard(): JSX.Element {
  const { data, isLoading, error } = useGetPbgExpiryAlertsQuery();
  const items = data?.items ?? [];

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>PBG Expiring ≤ 30 Days</CardTitle>
        <Badge variant={items.length > 0 ? 'danger' : 'success'}>
          {items.length > 0 ? `${items.length} alert${items.length === 1 ? '' : 's'}` : 'All clear'}
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-[#B91C1C]">Could not load PBG alerts.</p>
        ) : items.length === 0 ? (
          <EmptyAlerts kind="PBG" />
        ) : (
          <ul className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
            {items.map((row) => (
              <li key={row.projectId}>
                <NavLink
                  to={`/projects/${row.projectId}`}
                  className="flex items-center gap-3 rounded border border-[#FCA5A5]/60 bg-[#FEF2F2] px-3 py-2 text-sm transition-colors hover:border-[#B91C1C] hover:bg-[#FEE2E2]"
                >
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-white text-lg">⏰</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#111827]">{row.projectName}</p>
                    <p className="text-[11px] text-[#6B7280]">
                      Expires {formatDate(row.pbgExpiryDate)}
                      {row.city ? ` · ${row.city}` : ''}
                    </p>
                  </div>
                  <span className="flex-shrink-0 rounded bg-[#B91C1C] px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                    {row.daysLeft} d
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyAlerts({ kind }: { kind: string }): JSX.Element {
  return (
    <div className="rounded border border-dashed border-[#86EFAC] bg-[#F0FDF4] px-4 py-5 text-center">
      <p className="text-2xl" aria-hidden>
        ✓
      </p>
      <p className="mt-1 text-sm font-semibold text-[#15803D]">
        No {kind} expiries in the next 30 days.
      </p>
    </div>
  );
}
