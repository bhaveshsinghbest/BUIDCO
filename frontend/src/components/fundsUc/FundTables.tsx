/**
 * Shared tables (T-22): the grouped summary used for Scheme-wise and
 * By Sanctioning Agency, and the project-wise ledger with a "where is the
 * money?" bar on every row.
 */
import { cr, FUND_COLORS, fmtD, isUcRelevant, type FundGroup, type FundProject, type FundRow } from '../../lib/fundsUc';
import { cn } from '../../lib/utils';
import { activateOnKey, StageBar, StageLegend, thClass } from './fundsUi';

const td = 'px-3 py-[9px] text-[#111827]';

export function GroupTable({
  groups,
  labelHead,
  total,
  onPick,
}: {
  groups: readonly FundGroup[];
  labelHead: string;
  total: FundGroup;
  /** Row click → select that group (Scheme-wise only). */
  onPick?: ((name: string) => void) | undefined;
}): JSX.Element {
  const heads = ['Projects', 'Sanctioned', 'Released to UDHD', 'Received by BUIDCo', 'Paid by BUIDCo', 'Balance with BUIDCo', 'Lying with UDHD', 'Yet to release'];

  const line = (g: FundGroup, isTotal: boolean): JSX.Element => {
    const a = g.agg;
    const rel = g.rows.filter(isUcRelevant);
    const sent = rel.filter(({ f }) => f.ucSent).length;
    const clickable = Boolean(onPick) && !isTotal;
    return (
      <tr
        key={isTotal ? '__total' : g.name}
        {...(clickable
          ? { onClick: () => onPick!(g.name), onKeyDown: activateOnKey(() => onPick!(g.name)), tabIndex: 0, title: `Show ${g.name}` }
          : {})}
        className={cn(
          'border-b border-[#F3F4F6]',
          isTotal && 'bg-[#F3F4F6] font-extrabold',
          clickable && 'cursor-pointer hover:bg-[#EFF6FF] focus-visible:bg-[#EFF6FF] focus-visible:outline-none',
        )}
      >
        <td className={cn(td, 'whitespace-nowrap font-bold')}>{g.name}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{a.n}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{cr(a.sanctioned)}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{cr(a.relUDHD)}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{cr(a.received)}</td>
        <td className={cn(td, 'text-right tabular-nums')}>{cr(a.paid)}</td>
        <td className={cn(td, 'text-right font-bold tabular-nums')} style={{ color: FUND_COLORS.balance }}>
          {cr(a.balance)}
        </td>
        <td className={cn(td, 'text-right tabular-nums')} style={{ color: FUND_COLORS.lyingUDHD }}>
          {cr(a.withUDHD)}
        </td>
        <td className={cn(td, 'text-right tabular-nums text-[#B45309]')}>{cr(a.yetToRelease)}</td>
        <td className={td}>
          <StageBar f={{ paid: a.paid, balance: a.balance, withUDHD: a.withUDHD, yetToRelease: a.yetToRelease }} />
        </td>
        <td
          className={cn(td, 'whitespace-nowrap font-semibold')}
          style={{ color: rel.length > 0 && sent < rel.length ? '#B91C1C' : '#15803D' }}
        >
          {rel.length > 0 ? `${sent}/${rel.length} sent` : '—'}
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={cn(thClass, 'text-left')}>{labelHead}</th>
              {heads.map((h) => (
                <th key={h} className={cn(thClass, 'text-right')}>
                  {h}
                </th>
              ))}
              <th className={cn(thClass, 'text-left')}>Where is the money?</th>
              <th className={cn(thClass, 'text-left')}>UC</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => line(g, false))}
            {line(total, true)}
          </tbody>
        </table>
      </div>
      <div className="px-3.5 py-2.5">
        <StageLegend />
      </div>
    </div>
  );
}

export function ProjectFundTable({
  rows,
  onPick,
  selectedId,
}: {
  rows: readonly FundRow[];
  onPick: (p: FundProject) => void;
  selectedId?: string | null;
}): JSX.Element {
  const heads: Array<[string, boolean]> = [
    ['#', false],
    ['Project', false],
    ['Scheme', false],
    ['Sanctioning Agency', false],
    ['Sanctioned', true],
    ['Released to UDHD', true],
    ['Received by BUIDCo', true],
    ['Paid by BUIDCo', true],
    ['Balance with BUIDCo', true],
    ['Where is the money?', false],
    ['UC to dept.', false],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]" data-testid="project-fund-table">
        <thead>
          <tr>
            {heads.map(([h, right]) => (
              <th key={h} className={cn(thClass, right ? 'text-right' : 'text-left')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={heads.length} className="p-7 text-center text-[#9CA3AF]">
                No projects match.
              </td>
            </tr>
          ) : null}
          {rows.map(({ p, f, scheme }, i) => {
            const selected = p.id === selectedId;
            return (
              <tr
                key={p.id}
                onClick={() => onPick(p)}
                onKeyDown={activateOnKey(() => onPick(p))}
                tabIndex={0}
                aria-selected={selected}
                title="Show this project's flow diagram"
                className="cursor-pointer border-b border-[#F3F4F6] hover:bg-[#EFF6FF] focus-visible:bg-[#EFF6FF] focus-visible:outline-none"
                style={{ background: selected ? '#EFF6FF' : i % 2 ? '#FAFAFA' : 'white' }}
              >
                <td className={cn(td, 'text-[#9CA3AF]')}>{i + 1}</td>
                <td className={cn(td, 'min-w-[220px] font-semibold')}>{p.projectName}</td>
                <td className={cn(td, 'whitespace-nowrap text-[#374151]')}>{scheme}</td>
                <td className={cn(td, 'min-w-[130px] text-[11.5px] text-[#374151]')}>{p.fundSanctionAgency || '—'}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{cr(f.sanctioned)}</td>
                <td className={cn(td, 'whitespace-nowrap text-right tabular-nums')}>
                  {cr(f.relUDHD)}
                  {f.relAssumed ? (
                    <span title="Not entered — assumed equal to amount received by BUIDCo" className="text-[#B45309]">
                      *
                    </span>
                  ) : null}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>{cr(f.received)}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{cr(f.paid)}</td>
                <td className={cn(td, 'text-right font-bold tabular-nums')} style={{ color: f.balance < -0.005 ? '#B91C1C' : FUND_COLORS.balance }}>
                  {cr(f.balance)}
                </td>
                <td className={td}>
                  <StageBar f={f} />
                </td>
                <td className={cn(td, 'whitespace-nowrap')}>
                  {f.ucSent ? (
                    <span className="text-[11.5px] font-semibold" style={{ color: f.ucStatus === 'Overdue' ? '#B91C1C' : '#15803D' }}>
                      ✅ {fmtD(p.ucSubmissionDate)}
                    </span>
                  ) : f.paid > 0 || f.received > 0 ? (
                    <span className="text-[11.5px] font-bold text-[#B91C1C]">❌ Not sent</span>
                  ) : (
                    <span className="text-[#9CA3AF]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
