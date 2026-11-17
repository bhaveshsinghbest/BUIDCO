/**
 * Design primitives for the Funds Flow & UC module (bhaveshTask.md T-28),
 * plus the stage bar every table uses (T-22). Scoped to this module so the
 * rest of the app keeps its own Card / EmptyState styling.
 */
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { cr, stageSegments, UC_STATUS_PALETTE, FUND_COLORS, type FundFlow } from '../../lib/fundsUc';
import { cn } from '../../lib/utils';
import type { FundsUcStatus } from '../../types/api';

export function FundCard({
  children,
  className,
  style,
  testId,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}): JSX.Element {
  return (
    <section
      data-testid={testId}
      className={cn('overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]', className)}
      style={style}
    >
      {children}
    </section>
  );
}

export function FundCardHeader({ icon, title, sub, right }: { icon: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }): JSX.Element {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
      style={{ background: 'linear-gradient(100deg, #1E3A5F 0%, #2563EB 100%)' }}
    >
      <span className="text-[20px] leading-none" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-bold text-white">{title}</h2>
        {sub ? <div className="mt-0.5 text-[11px] text-[#93C5FD]">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function FundEmptyState({ icon, heading, message }: { icon: string; heading: string; message?: ReactNode }): JSX.Element {
  return (
    <div className="rounded-[10px] border-[1.5px] border-dashed border-[#E5E7EB] bg-[#FAFAFA] px-6 py-[52px] text-center">
      <div className="mb-2.5 text-[34px] leading-none" aria-hidden>
        {icon}
      </div>
      <div className="mb-1 text-[13px] font-semibold text-[#6B7280]">{heading}</div>
      {message ? <div className="text-[12px] text-[#9CA3AF]">{message}</div> : null}
    </div>
  );
}

/** Table header cell (T-28): 10.5px uppercase grey on #F9FAFB, never wraps. */
export const thClass =
  'whitespace-nowrap border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.02em] text-[#6B7280]';

/** Enter / Space activate a clickable row or box, like a button. */
export function activateOnKey(handler: () => void) {
  return (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };
}

export function UcStatusPill({ status, className }: { status: FundsUcStatus; className?: string }): JSX.Element {
  const pal = UC_STATUS_PALETTE[status];
  return (
    <span
      className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold', className)}
      style={{ background: pal.bg, color: pal.text }}
    >
      {status}
    </span>
  );
}

/** Where each rupee of the sanctioned amount sits right now (T-22). */
export function StageBar({
  f,
  height = 10,
  minWidth = 150,
}: {
  f: Pick<FundFlow, 'paid' | 'balance' | 'withUDHD' | 'yetToRelease'>;
  height?: number;
  minWidth?: number;
}): JSX.Element {
  const segs = stageSegments(f);
  const total = segs.reduce((s, x) => s + x.v, 0);
  if (total <= 0) return <span className="text-[11px] text-[#9CA3AF]">—</span>;
  return (
    <div
      className="flex overflow-hidden rounded-full bg-[#E5E7EB]"
      style={{ height, minWidth }}
      role="img"
      aria-label={segs.filter((s) => s.v > 0).map((s) => `${s.l}: ${cr(s.v)} Cr.`).join('; ')}
    >
      {segs.map((s) =>
        s.v > 0 ? <div key={s.k} title={`${s.l}: ${cr(s.v)} Cr.`} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} /> : null,
      )}
    </div>
  );
}

export function StageLegend(): JSX.Element {
  const items: Array<[string, string]> = [
    ['Paid by BUIDCo', FUND_COLORS.paid],
    ['Balance with BUIDCo', FUND_COLORS.balance],
    ['Lying with UDHD', FUND_COLORS.lyingUDHD],
    ['Yet to be released by agency', FUND_COLORS.yet],
  ];
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-[#4B5563]">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
