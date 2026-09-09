import { cn } from '../../lib/utils';

export interface MoneyStrip {
  allotedCr: number | null;
  spentCr: number | null;
}

interface Props {
  name: string;
  color: string;
  total: number;
  completed?: number;
  inProgress?: number;
  delayed?: number;
  extraStat?: { label: string; value: string } | undefined;
  money?: MoneyStrip | undefined;
  active: boolean;
  onClick: () => void;
  /**
   * Optional permanent-delete action (Task 3). Rendered as a sibling overlay
   * rather than a nested control — the card itself is a <button>, and a
   * button inside a button is invalid HTML that browsers resolve
   * unpredictably.
   */
  onDelete?: (() => void) | undefined;
  deleteLabel?: string;
}

/**
 * Card used by the Schemes / Sectors / Districts summary grids. Matches
 * the reference JSX visual language (accent-tinted count, coloured status
 * pips underneath). Active state flips the card to solid navy.
 */
const inrShort = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function fmtCr(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `₹ ${inrShort.format(v)} Cr`;
}

export function SummaryCard({
  name,
  color,
  total,
  completed = 0,
  inProgress = 0,
  delayed = 0,
  extraStat,
  money,
  active,
  onClick,
  onDelete,
  deleteLabel = 'Delete',
}: Props): JSX.Element {
  const utilPct =
    money && money.allotedCr !== null && money.spentCr !== null && money.allotedCr > 0
      ? Math.round((money.spentCr / money.allotedCr) * 1000) / 10
      : null;
  const utilColor =
    utilPct === null
      ? '#9CA3AF'
      : utilPct < 40
        ? '#B91C1C'
        : utilPct < 70
          ? '#B45309'
          : '#15803D';

  return (
    <div className="relative">
      {onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={deleteLabel}
          aria-label={deleteLabel}
          className={cn(
            'absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border text-[13px] transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
            active
              ? 'border-white/30 bg-white/15 text-white hover:bg-white/25'
              : 'border-[#FCA5A5] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]',
          )}
        >
          <span aria-hidden>🗑</span>
        </button>
      ) : null}
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex w-full flex-col items-start rounded-lg border p-4 text-left shadow-sm transition-all',
        active
          ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
          : 'border-[#E5E7EB] bg-white hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <div
        className={cn(
          'text-[13px] font-bold',
          active ? 'text-white' : 'text-[#111827]',
        )}
      >
        {name}
      </div>
      <div
        className="mt-1 text-[30px] font-extrabold leading-none tabular-nums"
        style={{ color: active ? '#93C5FD' : color }}
      >
        {total}
      </div>
      <div
        className={cn(
          'mb-2 text-[11px]',
          active ? 'text-[#93C5FD]' : 'text-[#9CA3AF]',
        )}
      >
        projects
      </div>

      {total > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {completed > 0 ? (
            <Pip active={active} tone="success">
              ✓ {completed}
            </Pip>
          ) : null}
          {inProgress > 0 ? (
            <Pip active={active} tone="info">
              ⟳ {inProgress}
            </Pip>
          ) : null}
          {delayed > 0 ? (
            <Pip active={active} tone="danger">
              ! {delayed}
            </Pip>
          ) : null}
        </div>
      ) : null}

      {extraStat ? (
        <div
          className={cn(
            'mt-2 text-[10.5px] font-semibold uppercase tracking-wider',
            active ? 'text-[#93C5FD]' : 'text-[#6B7280]',
          )}
        >
          {extraStat.label}:{' '}
          <span className={active ? 'text-white' : 'text-[#111827]'}>{extraStat.value}</span>
        </div>
      ) : null}

      {money ? (
        <div
          className={cn(
            'mt-3 w-full space-y-1.5 border-t pt-2 text-[10.5px]',
            active ? 'border-white/30' : 'border-[#F3F4F6]',
          )}
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'font-bold uppercase tracking-wider',
                active ? 'text-[#93C5FD]' : 'text-[#6B7280]',
              )}
            >
              Alloted
            </span>
            <span
              className={cn(
                'font-bold tabular-nums',
                active ? 'text-white' : 'text-[#111827]',
              )}
            >
              {fmtCr(money.allotedCr)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'font-bold uppercase tracking-wider',
                active ? 'text-[#93C5FD]' : 'text-[#6B7280]',
              )}
            >
              Spent
            </span>
            <span
              className={cn(
                'font-bold tabular-nums',
                active ? 'text-white' : 'text-[#15803D]',
              )}
            >
              {fmtCr(money.spentCr)}
            </span>
          </div>
          {utilPct !== null ? (
            <div className="pt-0.5">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'font-bold uppercase tracking-wider',
                    active ? 'text-[#93C5FD]' : 'text-[#6B7280]',
                  )}
                >
                  Utilised
                </span>
                <span
                  className="font-extrabold tabular-nums"
                  style={{ color: active ? '#FCA5A5' : utilColor }}
                >
                  {utilPct.toFixed(1)}%
                </span>
              </div>
              <div
                className={cn(
                  'mt-1 h-1.5 w-full overflow-hidden rounded-full',
                  active ? 'bg-white/20' : 'bg-[#F3F4F6]',
                )}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, utilPct)}%`,
                    backgroundColor: active ? '#93C5FD' : utilColor,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </button>
    </div>
  );
}

function Pip({
  active,
  tone,
  children,
}: {
  active: boolean;
  tone: 'success' | 'info' | 'danger';
  children: React.ReactNode;
}): JSX.Element {
  const styles: Record<typeof tone, { bg: string; text: string; activeBg: string; activeText: string }> = {
    success: {
      bg: 'bg-[#DCFCE7]',
      text: 'text-[#15803D]',
      activeBg: 'bg-white/15',
      activeText: 'text-white',
    },
    info: {
      bg: 'bg-[#DBEAFE]',
      text: 'text-[#1D4ED8]',
      activeBg: 'bg-white/15',
      activeText: 'text-white',
    },
    danger: {
      bg: 'bg-[#FEE2E2]',
      text: 'text-[#B91C1C]',
      activeBg: 'bg-[#EF4444]/30',
      activeText: 'text-[#FCA5A5]',
    },
  };
  const s = styles[tone];
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-bold',
        active ? cn(s.activeBg, s.activeText) : cn(s.bg, s.text),
      )}
    >
      {children}
    </span>
  );
}
