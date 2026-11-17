/**
 * Funds Flow & UC — server-side derivations (bhaveshTask.md T-07, T-08).
 *
 * The Funds page computes the full flow in the browser (frontend
 * lib/fundsUc.ts). The API still returns the closing balance and the
 * effective UC status on every entry, because the Project Profile, the
 * Project Details page and the MD portfolio show them without loading the
 * calculation engine. Both sides implement the same rules; the unit tests
 * on each side use the same cases.
 */
import type { FundsUcStatus } from '../db/enums.js';

/** UCs are filed quarterly: one quarter plus a grace window. */
export const UC_OVERDUE_DAYS = 100;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's calendar date in India (YYYY-MM-DD), whatever the server's TZ. */
export function todayIst(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Milliseconds for a YYYY-MM-DD calendar date, or null if it is not one. */
function dayValue(iso: string): number | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Rejects dates that roll over, e.g. 2026-02-30.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

export function isIsoCalendarDate(value: string): boolean {
  return dayValue(value) !== null;
}

/** GFR 12-A arithmetic: Opening + Received − Paid, to 2 decimals. Can be negative. */
export function closingBalanceCr(openingCr: number, receivedCr: number, paidCr: number): number {
  return Math.round((openingCr + receivedCr - paidCr) * 100) / 100;
}

export interface UcInfo {
  daysSince: number | null;
  autoStatus: FundsUcStatus;
  status: FundsUcStatus;
}

/**
 * T-08. No submission date and no manual status → null. A manual status
 * always wins over the date-based Submitted / Overdue (e.g. "Acknowledged"
 * suppresses "Overdue").
 */
export function computeUcInfo(
  entry: { ucSubmittedDate: string | null; ucStatusOverride: string | null },
  today: string = todayIst(),
): UcInfo | null {
  const override = (entry.ucStatusOverride || null) as FundsUcStatus | null;
  if (!entry.ucSubmittedDate) {
    if (!override) return null;
    return { daysSince: null, autoStatus: 'Not Due', status: override };
  }
  const submitted = dayValue(entry.ucSubmittedDate);
  const now = dayValue(today);
  if (submitted === null || now === null) return null;
  const daysSince = Math.max(0, Math.round((now - submitted) / DAY_MS));
  const autoStatus: FundsUcStatus = daysSince > UC_OVERDUE_DAYS ? 'Overdue' : 'Submitted';
  return { daysSince, autoStatus, status: override ?? autoStatus };
}

/**
 * T-09's ucStatus: the UC info's status, else "Pending" once BUIDCo has
 * received or paid anything, else "Not Due".
 */
export function effectiveUcStatus(
  entry: {
    ucSubmittedDate: string | null;
    ucStatusOverride: string | null;
    grantReceivedCr: number;
    expenditureIncurredCr: number;
  },
  today: string = todayIst(),
): { status: FundsUcStatus; daysSince: number | null } {
  const info = computeUcInfo(entry, today);
  if (info) return { status: info.status, daysSince: info.daysSince };
  const moved = entry.grantReceivedCr > 0 || entry.expenditureIncurredCr > 0;
  return { status: moved ? 'Pending' : 'Not Due', daysSince: null };
}
