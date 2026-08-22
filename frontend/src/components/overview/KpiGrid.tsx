import type { OverviewKpis } from '../../types/api';
import { formatCurrencyCr, formatInteger, formatPercent } from '../../lib/formatters';
import type { ToolbarColumn } from '../ui/TableToolbar';
import { StatCard } from './StatCard';

interface KpiGridProps {
  data: OverviewKpis | undefined;
  isVisible: (key: string) => boolean;
}

/**
 * Customize Fields (bhaveshTask.md) — every block below is individually
 * toggle-able. The picker button itself lives in OverviewPage now (beside
 * Refresh); this file just owns the field list so both stay in sync.
 */
export const KPI_FIELDS: ToolbarColumn[] = [
  { key: 'total', label: 'Total Projects' },
  { key: 'completed', label: 'Completed' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'notStarted', label: 'Not Started' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'onHold', label: 'On Hold' },
  { key: 'totalAa', label: 'Total AA' },
  { key: 'totalAgreement', label: 'Total Agreement' },
  { key: 'avgPhysical', label: 'Avg Physical Progress' },
  { key: 'avgFinancial', label: 'Avg Financial Progress' },
];
export const KPI_STORAGE_KEY = 'buidco.overview.kpiFields.v1';

export function KpiGrid({ data, isVisible }: KpiGridProps): JSX.Element {
  const total = data?.total ?? 0;
  const anyVisible = KPI_FIELDS.some((f) => isVisible(f.key));

  return (
    <section aria-label="Portfolio KPIs">
      {anyVisible ? (
        // One unified auto-fit grid instead of three fixed-column-count
        // rows: every visible tile is the same grid item type, so when
        // fields are hidden the rest reflow to fill the row (auto-fit
        // collapses the tracks that would've held them) instead of leaving
        // blank gaps where a fixed 6-column/2-column row would've had them.
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {isVisible('total') ? (
            <StatCard
              label="Total Projects"
              value={formatInteger(data?.total)}
              hint="All portfolios"
              tone="brand"
              icon="📊"
              to="/projects"
            />
          ) : null}
          {isVisible('completed') ? (
            <StatCard
              label="Completed"
              value={formatInteger(data?.completed)}
              hint={pctOfTotal(data?.completed, total)}
              tone="success"
              icon="✅"
              to="/projects?status=Completed"
            />
          ) : null}
          {isVisible('inProgress') ? (
            <StatCard
              label="In Progress"
              value={formatInteger(data?.inProgress)}
              hint={pctOfTotal(data?.inProgress, total)}
              tone="info"
              icon="🚧"
              to="/projects?status=In+Progress"
            />
          ) : null}
          {isVisible('notStarted') ? (
            <StatCard
              label="Not Started"
              value={formatInteger(data?.notStarted)}
              hint={pctOfTotal(data?.notStarted, total)}
              tone="neutral"
              icon="⏳"
              to="/projects?status=Not+Started"
            />
          ) : null}
          {isVisible('delayed') ? (
            <StatCard
              label="Delayed"
              value={formatInteger(data?.delayed)}
              hint={pctOfTotal(data?.delayed, total)}
              tone="danger"
              icon="⚠️"
              to="/projects?status=Delayed"
            />
          ) : null}
          {isVisible('onHold') ? (
            <StatCard
              label="On Hold"
              value={formatInteger(data?.onHold)}
              hint={pctOfTotal(data?.onHold, total)}
              tone="warning"
              icon="⏸️"
              to="/projects?status=On+Hold"
            />
          ) : null}
          {isVisible('totalAa') ? (
            <StatCard
              label="Total AA"
              value={formatCurrencyCr(data?.totalAaCr)}
              hint="Administrative approval"
              tone="brand"
              icon="₹"
              to="/projects"
            />
          ) : null}
          {isVisible('totalAgreement') ? (
            <StatCard
              label="Total Agreement"
              value={formatCurrencyCr(data?.totalAgreementCr)}
              hint="Contract value across portfolio"
              tone="info"
              icon="✍️"
              to="/projects"
            />
          ) : null}
          {isVisible('avgPhysical') ? (
            <StatCard
              label="Avg Physical Progress"
              value={formatPercent(data?.avgPhysicalPct)}
              hint="Milestone-weighted where available"
              tone="info"
              icon="🏗️"
              to="/projects"
            />
          ) : null}
          {isVisible('avgFinancial') ? (
            <StatCard
              label="Avg Financial Progress"
              value={formatPercent(data?.avgFinancialPct)}
              hint="Average across all projects"
              tone="success"
              icon="📈"
              to="/projects"
            />
          ) : null}
        </div>
      ) : (
        <p className="rounded border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-6 text-center text-sm text-[#6B7280]">
          All dashboard fields are hidden. Use Customize Fields above to show some again.
        </p>
      )}
    </section>
  );
}

function pctOfTotal(count: number | null | undefined, total: number): string {
  if (!count || !total) return '—';
  return `${((count / total) * 100).toFixed(1)}% of total`;
}
