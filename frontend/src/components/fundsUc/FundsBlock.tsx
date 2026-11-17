/**
 * FundsBlock (T-19 – T-21): the four "Where is the money right now?" cards,
 * the click-through Breakup panel and the flow diagram, for any set of
 * project rows — the whole portfolio, one scheme or one project. It holds
 * its own open stage, so re-mounting it (a new `key`) closes any breakup.
 */
import { useEffect, useRef, useState } from 'react';
import {
  aggregateFlow,
  agencyOf,
  breakupItems,
  cr,
  FUND_COLORS,
  pctOf,
  STAGE_META,
  sumBy,
  type FundProject,
  type FundRow,
  type FundTotals,
  type StageKey,
} from '../../lib/fundsUc';
import { cn } from '../../lib/utils';
import { DataNotes, FundFlowDiagram } from './FundFlowDiagram';
import { activateOnKey, FundCard, FundCardHeader, FundEmptyState, thClass } from './fundsUi';

/* ───────────────────────── T-19 · WhereCards ───────────────────────── */

function WhereCards({ t, onStage, active }: { t: FundTotals; onStage: (k: StageKey) => void; active: StageKey | null }): JSX.Element {
  const cards: Array<{ key: StageKey; label: string; who: string; v: number; c: string; note: string }> = [
    { key: 'yet', label: 'Yet to be released', who: 'by Sanctioning Agency', v: t.yetToRelease, c: FUND_COLORS.yet, note: 'Sanctioned − Released to UDHD' },
    { key: 'withUDHD', label: 'Lying with UDHD', who: 'not yet passed to BUIDCo', v: t.withUDHD, c: FUND_COLORS.lyingUDHD, note: 'Released to UDHD − Received by BUIDCo' },
    { key: 'balance', label: 'Available with BUIDCo', who: 'unspent balance', v: t.balance, c: FUND_COLORS.balance, note: 'Opening + Received − Paid' },
    { key: 'paid', label: 'Paid out by BUIDCo', who: 'to contractors / payees', v: t.paid, c: FUND_COLORS.paid, note: `${pctOf(t.paid, t.sanctioned)}% of sanctioned` },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="where-cards">
      {cards.map((k) => {
        const isActive = active === k.key;
        return (
          <button
            key={k.key}
            type="button"
            onClick={() => onStage(k.key)}
            title="Click for breakup"
            aria-pressed={isActive}
            aria-controls="fund-breakup-panel"
            data-stage={k.key}
            className="rounded-[10px] px-4 py-3.5 text-left transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            style={{
              background: isActive ? '#F8FAFC' : 'white',
              // Per-side longhands: mixing `border` with `borderTop` makes React
              // drop the top colour when the active state toggles.
              borderStyle: 'solid',
              borderColor: isActive ? k.c : '#E5E7EB',
              borderTopColor: k.c,
              borderWidth: isActive ? 2 : 1,
              borderTopWidth: 4,
              boxShadow: isActive ? '0 6px 18px rgba(30,58,95,0.16)' : '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#6B7280]">{k.label}</div>
            <div className="mb-1.5 text-[11px] text-[#9CA3AF]">{k.who}</div>
            <div className="text-[24px] font-extrabold leading-tight" style={{ color: k.c }}>
              {cr(k.v)}
              <span className="ml-1 text-[11px] font-semibold">Cr.</span>
            </div>
            <div className="mt-1 text-[10.5px] text-[#6B7280]">{k.note}</div>
            <div className="mt-1.5 text-[10.5px] font-bold" style={{ color: k.c }}>
              VIEW BREAKUP →
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── T-20 · BreakupPanel ───────────────────────── */

function BreakupPanel({
  stage,
  rows,
  onClose,
  onPick,
}: {
  stage: StageKey;
  rows: readonly FundRow[];
  onClose: () => void;
  onPick?: ((p: FundProject) => void) | undefined;
}): JSX.Element {
  const m = STAGE_META[stage];
  const { items, total } = breakupItems(stage, rows);
  const byScheme = sumBy(items, (r) => r.scheme);
  const byAgency = sumBy(items, (r) => agencyOf(r.p));
  const right = 'text-right';

  const mini = (title: string, list: Array<[string, number]>): JSX.Element => (
    <div className="min-w-[240px] flex-[1_1_260px]">
      <div className="mb-1.5 text-[11px] font-bold uppercase text-[#6B7280]">{title}</div>
      {list.map(([k, v]) => (
        <div key={k} className="mb-[7px]">
          <div className="flex justify-between gap-3 text-[12px] text-[#111827]">
            <span>{k}</span>
            <b className="whitespace-nowrap">
              {cr(v)} <span className="font-medium text-[#9CA3AF]">({pctOf(v, total)}%)</span>
            </b>
          </div>
          <div className="h-1.5 rounded-full bg-[#E5E7EB]">
            <div className="h-1.5 rounded-full" style={{ background: m.color, width: `${Math.min(Math.max(pctOf(v, total), 0), 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <FundCard style={{ border: `2px solid ${m.color}` }} testId="fund-breakup-panel">
      <div id="fund-breakup-panel" className="flex items-center justify-between gap-3 px-[18px] py-3 text-white" style={{ background: m.color }}>
        <div className="min-w-0">
          <h3 className="text-[14px] font-extrabold">
            Breakup — {m.label}: {cr(total)} Cr.
          </h3>
          <div className="text-[11.5px] opacity-90">{m.formula}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-white/70 bg-transparent px-3 py-1 text-[12px] font-semibold text-white hover:bg-white/10"
        >
          ✕ Close
        </button>
      </div>
      <div className="flex flex-col gap-3.5 px-[18px] py-3.5">
        {items.length === 0 ? (
          <div className="text-[12.5px] text-[#6B7280]">Nothing recorded under this head.</div>
        ) : (
          <>
            {items.length > 1 ? (
              <div className="flex flex-wrap gap-6">
                {mini('By scheme', byScheme)}
                {mini('By sanctioning agency', byAgency)}
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <th className={cn(thClass, 'text-left')}>Project</th>
                    <th className={cn(thClass, 'text-left')}>Scheme</th>
                    <th className={cn(thClass, 'text-left')}>Agency</th>
                    {m.cols.map(([label]) => (
                      <th key={label} className={cn(thClass, right)}>
                        {label}
                      </th>
                    ))}
                    <th className={cn(thClass, right)}>{m.label} (₹ Cr.)</th>
                    <th className={cn(thClass, right)}>% of total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ p, f, scheme, v }, i) => (
                    <tr
                      key={p.id}
                      {...(onPick
                        ? { onClick: () => onPick(p), onKeyDown: activateOnKey(() => onPick(p)), tabIndex: 0, title: 'Open this project in Project-wise' }
                        : {})}
                      className={cn('border-b border-[#F3F4F6]', onPick && 'cursor-pointer hover:bg-[#EFF6FF] focus-visible:bg-[#EFF6FF] focus-visible:outline-none')}
                      style={{ background: i % 2 ? '#FAFAFA' : 'white' }}
                    >
                      <td className="px-[11px] py-2 font-semibold text-[#111827]">{p.projectName}</td>
                      <td className="px-[11px] py-2 text-[#4B5563]">{scheme}</td>
                      <td className="px-[11px] py-2 text-[11.5px] text-[#4B5563]">{p.fundSanctionAgency || '—'}</td>
                      {m.cols.map(([label, fn]) => (
                        <td key={label} className="px-[11px] py-2 text-right tabular-nums text-[#111827]">
                          {cr(fn(f))}
                        </td>
                      ))}
                      <td className="px-[11px] py-2 text-right font-extrabold tabular-nums" style={{ color: m.color }}>
                        {cr(v)}
                      </td>
                      <td className="px-[11px] py-2 text-right tabular-nums text-[#111827]">{pctOf(v, total)}%</td>
                    </tr>
                  ))}
                  {items.length > 1 ? (
                    <tr className="bg-[#F3F4F6] font-extrabold">
                      <td className="px-[11px] py-2 text-[#111827]" colSpan={3 + m.cols.length}>
                        TOTAL
                      </td>
                      <td className="px-[11px] py-2 text-right tabular-nums" style={{ color: m.color }}>
                        {cr(total)}
                      </td>
                      <td className="px-[11px] py-2 text-right text-[#111827]">100%</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </FundCard>
  );
}

/* ─────────────────────────── FundsBlock ─────────────────────────── */

export function FundsBlock({
  rows,
  title,
  sub,
  onPick,
}: {
  rows: readonly FundRow[];
  title: string;
  sub: string;
  /** Breakup row click → open that project (Overall and Scheme views). */
  onPick?: ((p: FundProject) => void) | undefined;
}): JSX.Element {
  const [stage, setStage] = useState<StageKey | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = aggregateFlow(rows);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Toggle a stage's breakup (the same stage again closes it) and bring it into view. */
  const open = (k: StageKey): void => {
    setStage((s) => (s === k ? null : k));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => panelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), 60);
  };
  const hasData = t.sanctioned + t.received + t.paid + t.opening + t.relUDHD > 0;

  return (
    <>
      <WhereCards t={t} onStage={open} active={stage} />
      {/* `hidden` while closed so the empty wrapper adds no gap to the page's column. */}
      <div ref={panelRef} hidden={!stage}>
        {stage ? <BreakupPanel stage={stage} rows={rows} onClose={() => setStage(null)} onPick={onPick} /> : null}
      </div>
      <FundCard testId="fund-flow-card">
        <FundCardHeader icon="🔀" title={title} sub={sub} />
        <div className="px-3 pb-4 pt-3.5 sm:px-[18px]">
          {hasData ? (
            <>
              <div className="mb-1 text-[11.5px] font-semibold text-[#2563EB]">👆 Click any bar or box to see the breakup of that amount</div>
              {/* Below ~600px the diagram scrolls inside its card rather than shrinking past legibility. */}
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  <FundFlowDiagram t={t} onStage={open} active={stage} />
                </div>
              </div>
            </>
          ) : (
            <FundEmptyState icon="💰" heading="No fund figures recorded" message="Enter them in Input Sheet → 09 Funds & UC." />
          )}
          <DataNotes t={t} />
        </div>
      </FundCard>
    </>
  );
}
