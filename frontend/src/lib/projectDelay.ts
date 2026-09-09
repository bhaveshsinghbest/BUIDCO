/**
 * One delay calculation for the whole app.
 *
 * This is the logic the Tender Dashboard's Delay column has always used,
 * lifted out of that component so the Projects section filters on exactly
 * the same numbers. A second, parallel definition must not be introduced —
 * two views disagreeing about whether a project is "90 days late" is worse
 * than having no filter at all.
 */

import { daysBetween } from './formatters';

/** The subset of a project this module needs — keeps it usable for both
 *  ProjectListItem and ProjectDetail without coupling to either. */
export interface DelayableProject {
  plannedEndDate?: string | null;
  expectedCompletionDate?: string | null;
}

/**
 * Days overdue against the project's planned (or, failing that, expected)
 * completion date. Positive means late by that many days; zero or negative
 * means on track. `null` when neither date is on file, which is different
 * from "not delayed" and must not be treated as 0.
 *
 * There is no stored delay-duration column anywhere in the schema — dates
 * are the only source of truth, so this is the underlying delay data the
 * filter is required to use rather than any displayed text.
 */
export function delayDaysOf(p: DelayableProject, now: Date = new Date()): number | null {
  const target = p.plannedEndDate ?? p.expectedCompletionDate;
  if (!target) return null;
  return daysBetween(target, now);
}

export type DelayUnit = 'days' | 'months' | 'years';

/**
 * The "Delayed Projects" dropdown options.
 *
 * Each is a LOWER bound: a project matches when it is delayed by MORE than
 * the stated amount. Thresholds are declared in their natural unit and
 * normalised to days at comparison time (see `thresholdDays`) — the task
 * requires mixed units to be normalised before comparing, and declaring
 * "6 months" as a literal 180 would quietly be wrong for half the year.
 */
export const DELAY_WINDOWS = [
  { key: '30d', label: 'More than 30 Days', amount: 30, unit: 'days' },
  { key: '60d', label: 'More than 60 Days', amount: 60, unit: 'days' },
  { key: '90d', label: 'More than 90 Days', amount: 90, unit: 'days' },
  { key: '6m', label: 'More than 6 Months', amount: 6, unit: 'months' },
  { key: '1y', label: 'More than 1 Year', amount: 1, unit: 'years' },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  amount: number;
  unit: DelayUnit;
}>;

export type DelayWindowKey = (typeof DELAY_WINDOWS)[number]['key'];

/**
 * Convert a threshold to whole days using the real calendar, measured back
 * from `now`.
 *
 * Calendar arithmetic rather than fixed multipliers: "6 months" is 181 days
 * across one half of the year and 184 across the other, and "1 year" is 366
 * across a leap boundary. Subtracting the interval from today and measuring
 * the gap gets that right; `amount * 30` does not.
 */
export function thresholdDays(
  window: { amount: number; unit: DelayUnit },
  now: Date = new Date(),
): number {
  const cutoff = new Date(now.getTime());
  if (window.unit === 'days') cutoff.setDate(cutoff.getDate() - window.amount);
  else if (window.unit === 'months') cutoff.setMonth(cutoff.getMonth() - window.amount);
  else cutoff.setFullYear(cutoff.getFullYear() - window.amount);
  return daysBetween(cutoff, now);
}

/**
 * True when the project is delayed by strictly more than the selected
 * window. On-track projects and those with no completion date on file never
 * match — neither is a delayed project, and an unknown date is not zero.
 */
export function matchesDelayWindow(
  p: DelayableProject,
  key: DelayWindowKey | '',
  now: Date = new Date(),
): boolean {
  if (!key) return true;
  const window = DELAY_WINDOWS.find((w) => w.key === key);
  if (!window) return true;
  // Both sides must be measured from the SAME instant. Threading `now`
  // through matters beyond tests: at a midnight rollover the two calls
  // would otherwise straddle different days and shift a boundary result.
  const days = delayDaysOf(p, now);
  if (days === null) return false;
  return days > thresholdDays(window, now);
}
