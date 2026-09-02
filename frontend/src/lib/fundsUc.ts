import type { FundsUcStatus } from '../types/api';

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
