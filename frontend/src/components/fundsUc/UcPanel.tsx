/**
 * UC Tracker (T-26): has BUIDCo sent the Utilization Certificate to the
 * department, and how much of the money spent does a UC cover?
 */
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { cr, fmtD, pctOf, summariseUc, UC_OVERDUE_DAYS, UC_STATUS_PALETTE, type FundProject, type FundRow } from '../../lib/fundsUc';
import { cn } from '../../lib/utils';
import { activateOnKey, FundCard, FundCardHeader, FundEmptyState, thClass } from './fundsUi';

function Tile({ label, value, color, sub }: { label: string; value: string | number; color: string; sub: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2.5" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#6B7280]">{label}</div>
      <div className="text-[22px] font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10.5px] text-[#9CA3AF]">{sub}</div>
    </div>
  );
}

export function UcPanel({ rows, onPick }: { rows: readonly FundRow[]; onPick?: ((p: FundProject) => void) | undefined }): JSX.Element {
  const uc = summariseUc(rows);
  const coveredPct = pctOf(uc.covered, uc.paid);

  return (
    <FundCard testId="uc-tracker">
      <FundCardHeader
        icon="📄"
        title="Utilization Certificate (UC) Tracker"
        sub="Has BUIDCo sent the UC to the department? How much of the money spent is covered by a UC?"
      />
      <div className="flex flex-col gap-4 px-3 py-4 sm:px-[18px]">
        {uc.relevant.length === 0 ? (
          <FundEmptyState icon="📄" heading="No UC-relevant projects yet" message="UC applies once BUIDCo has received or paid funds." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="UC sent to department" value={`${uc.sent} / ${uc.relevant.length}`} color="#15803D" sub="projects with funds received/paid" />
              <Tile label="UC NOT sent" value={uc.notSent} color={uc.notSent ? '#DC2626' : '#6B7280'} sub="funds used, no UC on record" />
              <Tile label={`UC overdue (>${UC_OVERDUE_DAYS} days)`} value={uc.overdue} color={uc.overdue ? '#B91C1C' : '#6B7280'} sub="last UC older than a quarter" />
              <Tile
                label="Spent, not covered by UC"
                value={`${cr(uc.uncovered)} Cr.`}
                color={uc.uncovered > 0.005 ? '#DC2626' : '#15803D'}
                sub={`${coveredPct}% of payments covered`}
              />
            </div>

            <div>
              <div className="mb-1.5 text-[11.5px] font-bold text-[#374151]">Payments by BUIDCo vs amount covered by submitted UCs</div>
              <div
                className="flex h-[18px] overflow-hidden rounded-full bg-[#E5E7EB]"
                role="img"
                aria-label={`${coveredPct}% of payments covered by submitted UCs`}
              >
                {uc.covered > 0 ? (
                  <div
                    title={`Covered by UC: ${cr(uc.covered)} Cr.`}
                    className="flex items-center justify-center text-[10.5px] font-bold text-white"
                    style={{ width: `${Math.min(coveredPct, 100)}%`, background: '#16A34A' }}
                  >
                    {coveredPct}%
                  </div>
                ) : null}
                {uc.uncovered > 0.005 ? <div title={`Not covered: ${cr(uc.uncovered)} Cr.`} className="flex-1" style={{ background: '#EF4444' }} /> : null}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#4B5563]">
                <span>
                  🟩 Covered by UC: <b>{cr(uc.covered)}</b> Cr.
                </span>
                <span>
                  🟥 Not yet covered: <b>{cr(uc.uncovered)}</b> Cr.
                </span>
                <span>
                  Total paid: <b>{cr(uc.paid)}</b> Cr.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
              <div className="h-[170px]" data-testid="uc-status-donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={uc.statusCounts} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2} isAnimationActive={false}>
                      {uc.statusCounts.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [`${v} project${v === 1 ? '' : 's'}`, name]} />
                    <Legend verticalAlign="middle" align="right" layout="vertical" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-[12px] text-[#374151]">
                <div className="mb-1.5 font-bold">UC sent to (department)</div>
                {uc.sentTo.length === 0 ? (
                  <div className="text-[#9CA3AF]">No UC sent yet.</div>
                ) : (
                  uc.sentTo.map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-dashed border-[#E5E7EB] py-1">
                      <span>{k}</span>
                      <b>
                        {v} project{v > 1 ? 's' : ''}
                      </b>
                    </div>
                  ))
                )}
              </div>
            </div>

            {uc.watch.length > 0 ? (
              <div>
                <div className="mb-1.5 text-[12.5px] font-bold text-[#111827]">UC watch-list — action needed ({uc.watch.length})</div>
                <div className="max-h-[340px] overflow-auto rounded-lg border border-[#E5E7EB]" data-testid="uc-watch-list">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>
                        {['Project', 'Scheme', 'Paid (₹ Cr.)', 'UC covers (₹ Cr.)', 'Not covered (₹ Cr.)', 'UC sent?'].map((h, i) => (
                          <th key={h} className={cn(thClass, 'sticky top-0 z-[1] px-[11px] py-2', i >= 2 && i <= 4 ? 'text-right' : 'text-left')}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uc.watch.map(({ p, f, scheme }, i) => {
                        const pal = UC_STATUS_PALETTE[f.ucStatus] ?? UC_STATUS_PALETTE.Pending;
                        const sentTo = p.ucSentTo ? String(p.ucSentTo).split(',')[0] : '';
                        return (
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
                            <td className="px-[11px] py-2 text-right tabular-nums text-[#111827]">{cr(f.paid)}</td>
                            <td className="px-[11px] py-2 text-right tabular-nums text-[#111827]">{cr(Math.min(f.ucCertified, f.paid))}</td>
                            <td className="px-[11px] py-2 text-right font-bold tabular-nums" style={{ color: f.ucUncovered > 0.005 ? '#B91C1C' : '#15803D' }}>
                              {cr(f.ucUncovered)}
                            </td>
                            <td className="px-[11px] py-2">
                              {f.ucSent ? (
                                <span className="inline-block whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-semibold" style={{ background: pal.bg, color: pal.text }}>
                                  ✅ {fmtD(p.ucSubmissionDate)}
                                  {sentTo ? ` → ${sentTo}` : ''}
                                  {f.ucStatus === 'Overdue' ? ' · overdue' : ''}
                                </span>
                              ) : (
                                <span className="inline-block whitespace-nowrap rounded-full bg-[#FEF2F2] px-[9px] py-[3px] text-[11px] font-bold text-[#B91C1C]">
                                  ❌ Not sent
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </FundCard>
  );
}
