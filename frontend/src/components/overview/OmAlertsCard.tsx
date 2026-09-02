import { NavLink } from 'react-router-dom';
import { useGetOmExpiryAlertsQuery } from '../../app/api/kpisApi';
import { formatDate } from '../../lib/formatters';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

export function OmAlertsCard(): JSX.Element {
  const { data, isLoading } = useGetOmExpiryAlertsQuery();
  const items = data?.items ?? [];

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>O&M Contracts Expiring</CardTitle>
        <Badge variant={items.length > 0 ? 'warning' : 'success'}>
          {items.length > 0 ? `${items.length} attention` : 'On track'}
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : items.length === 0 ? (
          <div className="rounded border border-dashed border-[#86EFAC] bg-[#F0FDF4] px-4 py-5 text-center">
            <p className="text-2xl" aria-hidden>
              🔧
            </p>
            <p className="mt-1 text-sm font-semibold text-[#15803D]">
              No O&M contracts nearing expiry.
            </p>
          </div>
        ) : (
          <ul className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
            {items.map((row) => (
              <li key={row.projectId}>
                <NavLink
                  to={`/projects/${row.projectId}`}
                  className="flex items-center gap-3 rounded border border-[#FDE68A]/70 bg-[#FFFBEB] px-3 py-2 text-sm transition-colors hover:border-[#B45309] hover:bg-[#FEF3C7]"
                >
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-white text-lg">🔧</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#111827]">{row.projectName}</p>
                    <p className="text-[11px] text-[#6B7280]">
                      Ends {formatDate(row.endDate)}
                      {row.omAgency ? ` · ${row.omAgency}` : ''}
                    </p>
                  </div>
                  <span className="flex-shrink-0 rounded bg-[#B45309] px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
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
