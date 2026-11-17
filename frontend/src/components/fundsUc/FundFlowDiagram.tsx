/**
 * The picture (T-21): Sanctioned → Released to UDHD → Received by BUIDCo →
 * Paid. Band thickness is proportional to the amount; what does not flow
 * on drops into a labelled box underneath, so "stuck" money is visible.
 */
import type { MouseEvent } from 'react';
import { cr, FUND_COLORS, pctOf, type FundTotals, type StageKey } from '../../lib/fundsUc';
import { activateOnKey } from './fundsUi';

const XS = [14, 262, 510, 758] as const;
const BAR_W = 128;
const Y0 = 78;
const H = 190;
const CHIP_W = 112;
const CHIP_H = 58;
const CHIP_Y = Y0 + H + 46;

const HEADS: Array<[string, string, string]> = [
  ['① Sanctioned', 'by Central / State agency', FUND_COLORS.sanction],
  ['② Released to UDHD', 'by the sanctioning agency', FUND_COLORS.udhd],
  ['③ Received by BUIDCo', 'from UDHD (+ opening b/f)', FUND_COLORS.buidco],
  ['④ Paid by BUIDCo', 'to contractors / payees', FUND_COLORS.paid],
];
const BAR_KEYS: StageKey[] = ['sanctioned', 'relUDHD', 'received', 'paid'];

interface Props {
  t: FundTotals;
  onStage?: ((k: StageKey) => void) | undefined;
  active: StageKey | null;
}

export function FundFlowDiagram({ t, onStage, active }: Props): JSX.Element {
  const mx = Math.max(t.sanctioned, t.relUDHD, t.received + t.opening, t.paid, 1);
  const sc = H / mx;
  // Anything above zero stays visible.
  const hh = (v: number): number => (v > 0 ? Math.max(v * sc, 3) : 0);
  const h1 = hh(t.sanctioned);
  const h2 = hh(t.relUDHD);
  const hr = hh(t.received);
  const ho = hh(t.opening);
  const h3 = hr + ho;
  const h4 = hh(t.paid);
  const f12 = Math.min(h1, h2);
  const f23 = Math.min(h2, hr);
  const f34 = Math.min(h3, h4);
  const L12 = h1 - f12;
  const L23 = h2 - f23;
  const L34 = h3 - f34;
  const xr = (i: number): number => XS[i]! + BAR_W;
  const cx = (i: number): number => (xr(i) + XS[i + 1]!) / 2;

  const flow = (i: number, f: number, color: string): JSX.Element | null =>
    f > 0 ? <rect x={xr(i)} y={Y0} width={XS[i + 1]! - xr(i)} height={f} fill={color} opacity={0.32} /> : null;

  const drop = (i: number, top: number, L: number, color: string): JSX.Element | null => {
    if (L < 0.5) return null;
    const we = Math.min(Math.max(L, 6), CHIP_W - 14);
    const xl = cx(i) - we / 2;
    const xrr = cx(i) + we / 2;
    const yE = top + L;
    const x0 = xr(i);
    return (
      <path
        d={`M ${x0} ${top} C ${x0 + 45} ${top}, ${xl} ${CHIP_Y - 70}, ${xl} ${CHIP_Y} L ${xrr} ${CHIP_Y} C ${xrr} ${CHIP_Y - 70}, ${x0 + 45} ${yE}, ${x0} ${yE} Z`}
        fill={color}
        opacity={0.38}
      />
    );
  };

  const vals = [t.sanctioned, t.relUDHD, t.received + t.opening, t.paid];
  const hs = [h1, h2, h3, h4];

  /** Click / keyboard props for a clickable part of the picture. */
  const clk = (k: StageKey, label: string) =>
    onStage
      ? {
          onClick: (e: MouseEvent) => {
            // The opening segment sits inside the "received" column; without
            // this the column's own handler would replace the opening breakup.
            e.stopPropagation();
            onStage(k);
          },
          onKeyDown: activateOnKey(() => onStage(k)),
          role: 'button',
          tabIndex: 0,
          'aria-label': `${label} — show breakup`,
          'aria-pressed': active === k,
          className: 'cursor-pointer outline-none transition-opacity hover:opacity-90 focus-visible:opacity-80',
        }
      : {};

  const chips: Array<{ i: number; k: StageKey; label: string; v: number; c: string }> = [
    { i: 0, k: 'yet', label: 'Yet to be released by agency', v: t.yetToRelease, c: FUND_COLORS.yet },
    { i: 1, k: 'withUDHD', label: 'Lying with UDHD (not passed to BUIDCo)', v: t.withUDHD, c: FUND_COLORS.lyingUDHD },
    { i: 2, k: 'balance', label: 'Balance available with BUIDCo', v: t.balance, c: FUND_COLORS.balance },
  ];

  return (
    <svg
      viewBox="0 0 900 384"
      className="block h-auto w-full"
      style={{ fontFamily: 'inherit' }}
      role="group"
      aria-label="Flow of funds from sanction to payment"
      data-testid="fund-flow-diagram"
    >
      {flow(0, f12, FUND_COLORS.udhd)}
      {flow(1, f23, FUND_COLORS.buidco)}
      {flow(2, f34, FUND_COLORS.paid)}
      {drop(0, Y0 + f12, L12, FUND_COLORS.yet)}
      {drop(1, Y0 + f23, L23, FUND_COLORS.lyingUDHD)}
      {drop(2, Y0 + f34, L34, FUND_COLORS.balance)}

      {XS.map((x, i) => {
        const [title, sub, color] = HEADS[i]!;
        const key = BAR_KEYS[i]!;
        return (
          <g key={key} data-stage={key} {...clk(key, `${title.slice(2)}: ${cr(vals[i])} Cr.`)}>
            <foreignObject x={x - 6} y={4} width={BAR_W + 12} height={44}>
              <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color }}>{title}</div>
                <div style={{ fontSize: 9.5, color: '#6B7280' }}>{sub}</div>
              </div>
            </foreignObject>
            <text x={x + BAR_W / 2} y={Y0 - 9} textAnchor="middle" fontSize="15" fontWeight="800" fill={color}>
              {cr(vals[i])}
            </text>
            {i === 2 ? (
              <>
                <rect x={x} y={Y0} width={BAR_W} height={hr} rx="3" fill={FUND_COLORS.buidco} stroke={active === 'received' ? '#111827' : 'none'} strokeWidth="2" />
                {ho > 0 ? (
                  <g data-stage="opening" {...clk('opening', `Opening balance b/f: ${cr(t.opening)} Cr.`)}>
                    <rect x={x} y={Y0 + hr} width={BAR_W} height={ho} rx="3" fill={FUND_COLORS.opening} stroke={active === 'opening' ? '#111827' : 'none'} strokeWidth="2" />
                    {ho > 14 ? (
                      <text x={x + BAR_W / 2} y={Y0 + hr + ho / 2 + 3} textAnchor="middle" fontSize="9.5" fill="white" fontWeight="700">
                        Opening b/f {cr(t.opening)}
                      </text>
                    ) : null}
                  </g>
                ) : null}
              </>
            ) : (
              <rect x={x} y={Y0} width={BAR_W} height={hs[i]} rx="3" fill={color} stroke={active === key ? '#111827' : 'none'} strokeWidth="2" />
            )}
            <text x={x + BAR_W / 2} y={Y0 + hs[i]! + 15} textAnchor="middle" fontSize="10.5" fill="#6B7280">
              {i === 0 ? '100%' : `${pctOf(vals[i]!, t.sanctioned)}% of sanctioned`}
            </text>
          </g>
        );
      })}

      {chips.map((ch) => {
        const hasValue = ch.v > 0.005;
        return (
          <foreignObject key={ch.k} x={cx(ch.i) - CHIP_W / 2} y={CHIP_Y} width={CHIP_W} height={CHIP_H}>
            <div
              data-stage={ch.k}
              title="Click for breakup"
              {...(onStage
                ? {
                    onClick: () => onStage(ch.k),
                    onKeyDown: activateOnKey(() => onStage(ch.k)),
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `${ch.label}: ${hasValue ? `${cr(ch.v)} Cr.` : 'Nil'} — show breakup`,
                    'aria-pressed': active === ch.k,
                  }
                : {})}
              style={{
                cursor: onStage ? 'pointer' : 'default',
                boxShadow: active === ch.k ? `0 0 0 3px ${ch.c}55` : 'none',
                height: CHIP_H - 4,
                boxSizing: 'border-box',
                background: 'white',
                border: `1.5px solid ${ch.c}`,
                borderRadius: 8,
                padding: '4px 6px',
                textAlign: 'center',
                opacity: hasValue ? 1 : 0.55,
                outline: 'none',
              }}
            >
              <div style={{ fontSize: 9, lineHeight: 1.2, color: '#374151', fontWeight: 600 }}>{ch.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: ch.c, marginTop: 2 }}>{hasValue ? cr(ch.v) : 'Nil'}</div>
            </div>
          </foreignObject>
        );
      })}
    </svg>
  );
}

/** Amber data-quality notes under the diagram. */
export function DataNotes({ t }: { t: FundTotals }): JSX.Element | null {
  const notes: string[] = [];
  if (t.sanctionedAssumed > 0) {
    notes.push(`${t.sanctionedAssumed} project(s): "Amount Sanctioned" not entered — project Sanctioned Cost (AA) is used instead.`);
  }
  if (t.relAssumed > 0) {
    notes.push(`${t.relAssumed} project(s): "Released to UDHD" not entered — assumed equal to the amount received by BUIDCo (nothing parked at UDHD).`);
  }
  if (t.balance < -0.005) notes.push('Payments exceed opening balance + receipts — please check the figures.');
  if (notes.length === 0) return null;
  return (
    <div
      role="note"
      className="mt-2.5 rounded-lg border border-[#FCD34D] bg-[#FFFBEB] px-3 py-2 text-[11.5px] text-[#92400E]"
      data-testid="fund-data-notes"
    >
      ⚠ {notes.join('  •  ')}
    </div>
  );
}
