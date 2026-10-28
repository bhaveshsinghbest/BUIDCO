/**
 * Cost overrun, defined once.
 *
 * The Projects table column and the project profile's snapshot box both
 * answer "is this project over its sanctioned cost?", and they must never
 * give different answers for the same project. The rule below is the one
 * the profile already applied — extracted here rather than reinvented, so
 * adding the column changed nothing about what the app reports.
 *
 * The comparison is the awarded contract value against the administrative
 * approval: a project is over its sanction when it was awarded for more
 * than was approved.
 *
 * `revisedAaAmountCr` is deliberately NOT used. A revised AA records that
 * the sanction was later raised — frequently *because* of the overrun — so
 * comparing against it would quietly make overruns disappear the moment
 * they were regularised. Comparing against the original AA keeps the
 * overrun visible, which is the point of showing it at all.
 */

/** What the Cost Overrun column shows. "N/A" when the figures to compare are absent. */
export type CostOverrunStatus = 'Yes' | 'No' | 'N/A';

export interface CostOverrunInput {
  aaAmountCr: number | null;
  agreementAmountCr: number | null;
}

/**
 * Agreement value minus AA, in Rs. Cr. Positive means over sanction.
 * Null when either side is missing — unknown, not zero.
 */
export function costOverrunAmountCr(project: CostOverrunInput): number | null {
  if (project.aaAmountCr == null || project.agreementAmountCr == null) return null;
  return project.agreementAmountCr - project.aaAmountCr;
}

/** Yes / No / N/A, for the column and its filter. */
export function costOverrunStatus(project: CostOverrunInput): CostOverrunStatus {
  const amount = costOverrunAmountCr(project);
  if (amount === null) return 'N/A';
  return amount > 0 ? 'Yes' : 'No';
}

/** The two values the Cost Overrun filter offers. "N/A" is not selectable —
 *  it means "no data to judge", not a third business state. */
export const COST_OVERRUN_FILTER_OPTIONS = ['Yes', 'No'] as const;
