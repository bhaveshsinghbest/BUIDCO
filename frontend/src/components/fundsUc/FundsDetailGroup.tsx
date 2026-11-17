import { useId, useState } from 'react';
import { formatCurrencyCr, formatDate, formatPercent } from '../../lib/formatters';
import { entryToFundProject, FUND_DETAIL_KEYS, FUND_FIELDS, type FundFieldKey } from '../../lib/fundsUc';
import type { FundsUcEntry } from '../../types/api';
import { Skeleton } from '../ui/skeleton';

/** One label/value box; "—" when empty. */
function Box({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-[#F9FAFB] px-3.5 py-2.5">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6B7280]">{label}</div>
      <div className="whitespace-pre-wrap break-words text-[12.5px] leading-normal text-[#111827]">{value}</div>
    </div>
  );
}

function display(key: FundFieldKey, entry: FundsUcEntry): string {
  const p = entryToFundProject(entry);
  // The derived balance comes from the API, so it is shown even before any edit.
  const raw = key === 'ucClosingBalance' ? entry.closingBalanceCr : p[key];
  if (raw === null || raw === undefined || raw === '') return '—';
  const type = FUND_FIELDS[key].type;
  if (type === 'number') return formatCurrencyCr(Number(raw));
  if (type === 'date') return formatDate(String(raw));
  return String(raw);
}

/**
 * Project detail → collapsible "Funds & Utilization Certificate (UC)" group
 * (bhaveshTask.md T-03): the 15 fields in the specified order as a 4-column
 * grid of label/value boxes. Opens expanded so the figures stay as visible
 * as the card it replaces; the Central/State split and the current UC
 * status follow the 15 fields.
 */
export function FundsDetailGroup({ entry, loading }: { entry: FundsUcEntry | null; loading: boolean }): JSX.Element {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const isSplit = entry?.fundingSource === 'Central - State Share';
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white" data-testid="funds-detail-group">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between bg-[#F9FAFB] px-4 py-3 text-left"
      >
        <span className="text-[13px] font-bold text-[#1E3A5F]">Funds &amp; Utilization Certificate (UC)</span>
        <span aria-hidden className="text-[13px] text-[#6B7280] transition-transform duration-150" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          ▾
        </span>
      </button>
      {open ? (
        <div id={panelId} className="px-4 py-3.5">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : !entry ? (
            <p className="text-[12.5px] text-[#6B7280]">No funds data recorded yet. Add it from the Input Sheet → 09 Funds &amp; UC.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {FUND_DETAIL_KEYS.map((key) => (
                <Box key={key} label={FUND_FIELDS[key].label} value={display(key, entry)} />
              ))}
              {isSplit ? (
                <>
                  <Box label="Central Share (%)" value={formatPercent(entry.centralSharePct, 0)} />
                  <Box label="State Share (%)" value={formatPercent(entry.stateSharePct, 0)} />
                </>
              ) : null}
              <Box label="UC Status (current)" value={entry.ucStatus} />
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
