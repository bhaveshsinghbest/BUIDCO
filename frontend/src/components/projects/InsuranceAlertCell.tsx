import { daysBetween } from '../../lib/formatters';

/**
 * Insurance Alert cell (bhaveshTask.md Task 9).
 *
 * A field-for-field mirror of PbgAlertCell — same thresholds, same colour
 * ramp, same wording, same em dash for "nothing to report". Keeping the two
 * identical is the point: a user reading the PBG column should not have to
 * learn a second convention for the column next to it.
 *
 *   days < 0            no badge  (policy already lapsed)
 *   days 0              "Expires TODAY"
 *   days 1..7           red
 *   days 8..15          orange
 *   days 16..30         yellow
 *   days > 30           no badge  (nothing to act on)
 *   no date on record   no badge
 */
export function InsuranceAlertCell({
  insuranceExpiryDate,
}: {
  insuranceExpiryDate: string | null | undefined;
}): JSX.Element {
  if (!insuranceExpiryDate) {
    return <span className="text-[#D1D5DB]">—</span>;
  }
  const days = daysBetween(new Date(), insuranceExpiryDate);
  if (days < 0 || days > 30) {
    return <span className="text-[#D1D5DB]">—</span>;
  }
  const color = days <= 7 ? '#DC2626' : days <= 15 ? '#F97316' : '#EAB308';
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold tabular-nums text-white whitespace-nowrap"
      style={{ backgroundColor: color }}
    >
      {days === 0 ? 'Expires TODAY' : `Expiring in ${days}d`}
    </span>
  );
}
