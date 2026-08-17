import { useGetOverviewKpisQuery, useGetSchemeChartQuery, useGetStatusDonutQuery } from '../app/api/kpisApi';
import { useAppSelector } from '../app/hooks';
import { SchemeBarChart } from '../components/charts/SchemeBarChart';
import { StatusDonut } from '../components/charts/StatusDonut';
import { DivisionSummaryCard } from '../components/overview/DivisionSummaryCard';
import { FinancialSecuritiesCard } from '../components/overview/FinancialSecuritiesCard';
import { KpiGrid, KPI_FIELDS, KPI_STORAGE_KEY } from '../components/overview/KpiGrid';
import { OmAlertsCard } from '../components/overview/OmAlertsCard';
import { PbgAlertsCard } from '../components/overview/PbgAlertsCard';
import { PbgExpiryBanner } from '../components/overview/PbgExpiryBanner';
import { ScheduleVsActualCard } from '../components/overview/ScheduleVsActualCard';
import { SectorSummaryCard } from '../components/overview/SectorSummaryCard';
import { StageBucketsCard } from '../components/overview/StageBucketsCard';
import { WorkTypeCountsCard } from '../components/overview/WorkTypeCountsCard';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { ColumnsButton, useColumnVisibility } from '../components/ui/TableToolbar';
import { selectCurrentUser } from '../features/auth/authSlice';

export function OverviewPage(): JSX.Element {
  const user = useAppSelector(selectCurrentUser);
  const overview = useGetOverviewKpisQuery();
  const donut = useGetStatusDonutQuery();
  const scheme = useGetSchemeChartQuery();
  const { visibility, isVisible, toggle, showAll, hideAll } = useColumnVisibility(KPI_STORAGE_KEY, KPI_FIELDS);

  const refetchAll = (): void => {
    void overview.refetch();
    void donut.refetch();
    void scheme.refetch();
  };

  const anyFetching = overview.isFetching || donut.isFetching || scheme.isFetching;

  return (
    <div className="space-y-5">
      <PbgExpiryBanner />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Welcome{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">
            Portfolio-wide view of every project managed by BUIDCO.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ColumnsButton
            columns={KPI_FIELDS}
            visibility={visibility}
            onToggle={toggle}
            onShowAll={showAll}
            onHideAll={hideAll}
            label="Customize Fields"
            panelTitle="Dashboard fields"
          />
          <Button variant="outline" size="sm" onClick={refetchAll} disabled={anyFetching}>
            <span className={anyFetching ? 'animate-spin' : ''} aria-hidden>
              ↻
            </span>{' '}
            {anyFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {overview.isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : overview.error ? (
        <ErrorPanel />
      ) : (
        <KpiGrid data={overview.data} isVisible={isVisible} />
      )}

      <StageBucketsCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <ScheduleVsActualCard />
        <WorkTypeCountsCard />
        <FinancialSecuritiesCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Physical vs Financial % by Scheme</CardTitle>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Click a bar to filter
            </span>
          </CardHeader>
          <CardContent>
            {scheme.isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : scheme.error ? (
              <p className="text-sm text-[#B91C1C]">Could not load scheme chart.</p>
            ) : (
              <SchemeBarChart data={scheme.data?.items ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Status Breakdown</CardTitle>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Click a slice to filter
            </span>
          </CardHeader>
          <CardContent>
            {donut.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : donut.error ? (
              <p className="text-sm text-[#B91C1C]">Could not load status data.</p>
            ) : (
              <StatusDonut data={donut.data?.items ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectorSummaryCard />
        <DivisionSummaryCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PbgAlertsCard />
        <OmAlertsCard />
      </div>
    </div>
  );
}

function ErrorPanel(): JSX.Element {
  return (
    <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C]">
      <p className="font-semibold">Could not load portfolio KPIs.</p>
      <p className="mt-1 text-[#7F1D1D]/80">
        Check that the API is reachable, then use the Refresh button.
      </p>
    </div>
  );
}
