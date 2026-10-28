import type { FundingSource, FundsUcStatus } from '../types/api';

/**
 * UC (Utilization Certificate) status, derived the same way everywhere a
 * Funds & UC entry is shown (bhaveshTask.md audit) — the Funds & UC page,
 * Project Details, Project Profile modal, and MD Portfolio all call this
 * instead of recomputing it, so the status can't drift between views.
 */
export function fundsUcStatusOf(entry: { ucSubmittedDate: string | null; expenditureIncurredCr: number }): FundsUcStatus {
  if (entry.ucSubmittedDate) return 'Submitted';
  if (entry.expenditureIncurredCr > 0) return 'Overdue';
  return 'Pending';
}

/**
 * Central / State share split for a Funds & UC entry, as percentages.
 *
 * Only "Central - State Share" funding carries a *stored* split: the entry
 * forms deliberately write NULL into central_share_pct / state_share_pct for
 * every other source (see FundsUcForm and FundingSourceSection), and the
 * migration that added the columns says they are "only meaningful when
 * funding_source = 'Central - State Share'".
 *
 * For the other sources the split is not missing data, it is implied by the
 * source itself — a centrally funded project is 100% central, a state funded
 * one is 100% state. Deriving it here means the ledger can show a figure for
 * every funding source instead of a dash for all but one (bhaveshTask.md
 * Task 4), without inventing a column in the database or back-filling rows.
 *
 * Returns null for a stored split that was never recorded, so a legacy row
 * still reads as "unknown" rather than a confident 0%.
 */
export function sharePercentsOf(entry: {
  fundingSource: FundingSource;
  centralSharePct: number | null;
  stateSharePct: number | null;
}): { centralPct: number | null; statePct: number | null } {
  switch (entry.fundingSource) {
    // An explicit split — whatever was recorded against the entry is the
    // only correct answer, so it is passed straight through.
    case 'Central - State Share':
      return { centralPct: entry.centralSharePct, statePct: entry.stateSharePct };

    // Centrally funded, whether or not the funding is externally aided.
    case 'Central - EAP':
    case 'Central - Non-EAP':
      return { centralPct: 100, statePct: 0 };

    case 'State Funded':
      return { centralPct: 0, statePct: 100 };

    default:
      return { centralPct: entry.centralSharePct, statePct: entry.stateSharePct };
  }
}
