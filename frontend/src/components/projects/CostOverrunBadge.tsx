import { formatCurrencyCr } from '../../lib/formatters';
import type { CostOverrunStatus } from '../../lib/projectCost';
import { cn } from '../../lib/utils';

/**
 * Cost Overrun cell for the Projects table.
 *
 * Styled to match PriorityBadge and StatusBadge so the column reads as part
 * of the existing table rather than something bolted on. "Yes" is red
 * because an overrun is an exception worth noticing; "No" is green.
 *
 * The overrun amount rides along in the tooltip rather than the cell: the
 * column answers a Yes/No question and must stay narrow, but "by how much"
 * is the obvious next question and is worth one hover away.
 */
const STYLES: Record<CostOverrunStatus, string> = {
  Yes: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5]',
  No: 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]',
  'N/A': 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]',
};

export function CostOverrunBadge({
  status,
  amountCr,
  className,
}: {
  status: CostOverrunStatus;
  amountCr: number | null;
  className?: string;
}): JSX.Element {
  // Nothing to compare — render the same em dash every other column uses
  // for "no data", rather than a badge implying a judgement was made.
  if (status === 'N/A') {
    return (
      <span className="text-[#D1D5DB]" title="Needs both AA and Agreement amounts to determine">
        —
      </span>
    );
  }

  const title =
    amountCr === null
      ? undefined
      : status === 'Yes'
        ? `Awarded ${formatCurrencyCr(amountCr)} above the AA amount`
        : `Within the AA amount by ${formatCurrencyCr(Math.abs(amountCr))}`;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold',
        STYLES[status],
        className,
      )}
      {...(title ? { title } : {})}
    >
      {status}
    </span>
  );
}
