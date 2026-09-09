import { NavLink } from 'react-router-dom';
import { useGetStageBucketsQuery } from '../../app/api/kpisApi';
import { formatCurrencyCr, formatInteger } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

/**
 * Reads from v_stage_buckets — one row per pipeline stage. Stages missing
 * from the response are still rendered so the pipeline stays complete; they
 * just show 0.
 *
 * These keys must match `projectStageV2Values` in the backend's db/enums.ts
 * exactly. They previously mirrored the superseded `project_stage` vocabulary
 * — 'Conceptualization' with a -z-, and no Design/Other — so those projects
 * had no bucket to land in, and the drill-down links (which filter the
 * Projects list on projectStageV2) matched nothing. See drizzle/0014.
 */

interface StageConfig {
  key: string;
  icon: string;
  short: string;
  tone: 'brand' | 'info' | 'warning' | 'danger' | 'success';
}

const STAGES: StageConfig[] = [
  { key: 'Conceptualisation', icon: '💡', short: 'Concept', tone: 'brand' },
  { key: 'Design', icon: '📐', short: 'Design', tone: 'info' },
  { key: 'Pre-Tender', icon: '📄', short: 'Pre-tender', tone: 'info' },
  { key: 'Tender', icon: '🏷️', short: 'Tender', tone: 'warning' },
  { key: 'Construction', icon: '🚧', short: 'Construction', tone: 'danger' },
  { key: 'O&M', icon: '🔧', short: 'O&M', tone: 'success' },
  { key: 'Other', icon: '🗂️', short: 'Other', tone: 'brand' },
];

const TONE_STYLES: Record<
  StageConfig['tone'],
  { bg: string; border: string; text: string; bar: string; ring: string }
> = {
  brand: {
    bg: 'bg-[#EFF6FF]',
    border: 'border-[#BFDBFE]',
    text: 'text-[#1E3A5F]',
    bar: 'bg-[#1E3A5F]',
    ring: 'hover:ring-[#1E3A5F]/30',
  },
  info: {
    bg: 'bg-[#DBEAFE]',
    border: 'border-[#93C5FD]',
    text: 'text-[#1D4ED8]',
    bar: 'bg-[#1D4ED8]',
    ring: 'hover:ring-[#1D4ED8]/30',
  },
  warning: {
    bg: 'bg-[#FEF3C7]',
    border: 'border-[#FDE68A]',
    text: 'text-[#B45309]',
    bar: 'bg-[#B45309]',
    ring: 'hover:ring-[#B45309]/30',
  },
  danger: {
    bg: 'bg-[#FEE2E2]',
    border: 'border-[#FCA5A5]',
    text: 'text-[#B91C1C]',
    bar: 'bg-[#B91C1C]',
    ring: 'hover:ring-[#B91C1C]/30',
  },
  success: {
    bg: 'bg-[#DCFCE7]',
    border: 'border-[#86EFAC]',
    text: 'text-[#15803D]',
    bar: 'bg-[#15803D]',
    ring: 'hover:ring-[#15803D]/30',
  },
};

export function StageBucketsCard(): JSX.Element {
  const { data, isLoading, error } = useGetStageBucketsQuery();
  const rows = data?.items ?? [];

  const byStage = new Map<string, { count: number; totalAaCr: number | null }>();
  for (const r of rows) {
    byStage.set(r.stage, { count: r.projectCount, totalAaCr: r.totalAaCr });
  }
  const totalActive = STAGES.reduce((acc, s) => acc + (byStage.get(s.key)?.count ?? 0), 0);
  const totalAa = STAGES.reduce((acc, s) => acc + (byStage.get(s.key)?.totalAaCr ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="space-y-0.5">
          <CardTitle>Active Projects — Current Stage</CardTitle>
          <p className="text-[11px] normal-case tracking-normal text-[#6B7280]">
            Pipeline from concept through O&M · click a stage to filter projects
          </p>
        </div>
        <Badge variant={totalActive > 0 ? 'default' : 'neutral'}>
          {formatInteger(totalActive)} active · {formatCurrencyCr(totalAa || null)}
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {STAGES.map((s) => (
              <Skeleton key={s.key} className="h-24 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-[#B91C1C]">Could not load stage buckets.</p>
        ) : totalActive === 0 ? (
          <EmptyPipeline />
        ) : (
          <>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {STAGES.map((stage, idx) => {
                const bucket = byStage.get(stage.key);
                const count = bucket?.count ?? 0;
                const totalCr = bucket?.totalAaCr ?? null;
                const pct = totalActive > 0 ? (count / totalActive) * 100 : 0;
                const styles = TONE_STYLES[stage.tone];
                const isEmpty = count === 0;
                return (
                  <li key={stage.key} className="relative">
                    <NavLink
                      to={`/projects?projectStage=${encodeURIComponent(stage.key)}`}
                      aria-disabled={isEmpty}
                      className={cn(
                        'group flex h-full flex-col justify-between rounded-lg border p-3 transition-all',
                        styles.bg,
                        styles.border,
                        !isEmpty &&
                          cn(
                            'cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:ring-2',
                            styles.ring,
                          ),
                        isEmpty && 'opacity-60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white text-lg shadow-sm"
                          aria-hidden
                        >
                          {stage.icon}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-wider',
                            styles.text,
                          )}
                        >
                          {idx + 1} / {STAGES.length}
                        </span>
                      </div>
                      <div className="mt-2">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
                          {stage.short}
                        </p>
                        <p className={cn('mt-0.5 text-2xl font-bold tabular-nums leading-none', styles.text)}>
                          {formatInteger(count)}
                        </p>
                        <p className="mt-1 text-[10.5px] text-[#6B7280]">
                          {formatCurrencyCr(totalCr)}
                        </p>
                      </div>
                      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/70">
                        <div
                          className={cn('h-full transition-all', styles.bar)}
                          style={{ width: `${pct}%` }}
                          role="progressbar"
                          aria-label={`${stage.short} share`}
                          aria-valuenow={Math.round(pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                      <p className="mt-1 text-[10px] font-semibold tabular-nums text-[#6B7280]">
                        {pct.toFixed(1)}% of active
                      </p>
                    </NavLink>
                    {idx < STAGES.length - 1 ? (
                      <span
                        className="pointer-events-none absolute right-[-13px] top-1/2 hidden -translate-y-1/2 text-lg font-bold text-[#CBD5E1] sm:block"
                        aria-hidden
                      >
                        →
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyPipeline(): JSX.Element {
  return (
    <div className="rounded border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-6 text-center text-sm text-[#6B7280]">
      <p className="text-2xl" aria-hidden>
        🛠️
      </p>
      <p className="mt-2 font-medium text-[#374151]">No project-stage data yet.</p>
      <p className="mt-1 text-xs">
        Stages populate once Project Stage is set from the Input Sheet.
      </p>
    </div>
  );
}
