import { NavLink } from 'react-router-dom';
import { useGetDivisionSummaryQuery } from '../../app/api/kpisApi';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

/** Replaces DistrictSummaryCard on the Overview dashboard (bhaveshTask.md). */
export function DivisionSummaryCard(): JSX.Element {
  const { data, isLoading, error } = useGetDivisionSummaryQuery();
  const rows = [...(data?.items ?? [])].sort((a, b) => b.total - a.total).slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Divisions — Top {rows.length}</CardTitle>
        <NavLink
          to="/divisions"
          className="text-[11px] font-semibold uppercase tracking-wider text-[#1D4ED8] hover:underline"
        >
          View all →
        </NavLink>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <p className="text-sm text-[#B91C1C]">Could not load divisions.</p>
        ) : rows.length === 0 ? (
          <EmptyDivisions />
        ) : (
          <div className="overflow-x-auto rounded border border-[#E5E7EB]">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-[#F9FAFB] text-[10.5px] uppercase tracking-wider text-[#6B7280]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Division</th>
                  <th className="px-3 py-2 text-left font-semibold">Region</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                  <th className="px-3 py-2 text-right font-semibold">Done</th>
                  <th className="px-3 py-2 text-right font-semibold">Delayed</th>
                  <th className="px-3 py-2 text-right font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {rows.map((row) => (
                  <tr key={row.divisionId} className="hover:bg-[#F9FAFB]">
                    <td className="px-3 py-2">
                      <NavLink
                        to={`/projects?divisionId=${row.divisionId}`}
                        className="font-medium text-[#111827] hover:text-[#1D4ED8]"
                      >
                        {row.divisionName}
                      </NavLink>
                    </td>
                    <td className="px-3 py-2 text-[#6B7280]">{row.regionName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#15803D]">
                      {row.completed}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#B91C1C]">
                      {row.delayed}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {row.completionRatePct != null ? `${row.completionRatePct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyDivisions(): JSX.Element {
  return (
    <div className="rounded border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-6 text-center text-sm text-[#6B7280]">
      <p className="font-medium text-[#374151]">No division-level data yet.</p>
      <p className="mt-1 text-xs">
        Divisions populate once projects have a division assigned via the Input Sheet.
      </p>
    </div>
  );
}
