/**
 * Delay filter — thresholds, unit normalisation and boundary behaviour.
 *
 * `now` is injected everywhere so these assert real calendar arithmetic on
 * fixed dates rather than drifting with the clock.
 */
import { describe, expect, it } from 'vitest';
import {
  DELAY_WINDOWS,
  delayDaysOf,
  matchesDelayWindow,
  thresholdDays,
  type DelayWindowKey,
} from './projectDelay';

/** Fixed reference point: 1 Sep 2026. */
const NOW = new Date('2026-09-01T00:00:00.000Z');

/** A project whose planned end date is `n` days before NOW. */
function lateBy(n: number): { plannedEndDate: string } {
  const d = new Date(NOW.getTime() - n * 86_400_000);
  return { plannedEndDate: d.toISOString().slice(0, 10) };
}

describe('delayDaysOf', () => {
  it('is positive when overdue and negative when on track', () => {
    expect(delayDaysOf({ plannedEndDate: '2026-08-01' })).toBeGreaterThan(0);
    expect(delayDaysOf({ plannedEndDate: '2099-01-01' })).toBeLessThan(0);
  });

  it('falls back to expectedCompletionDate only when planned is absent', () => {
    const both = { plannedEndDate: '2026-01-01', expectedCompletionDate: '2026-06-01' };
    const onlyExpected = { expectedCompletionDate: '2026-06-01' };
    // Planned is earlier, so it yields the larger delay — proving it wins.
    expect(delayDaysOf(both)!).toBeGreaterThan(delayDaysOf(onlyExpected)!);
  });

  it('returns null when no date is on file — unknown is not zero', () => {
    expect(delayDaysOf({})).toBeNull();
    expect(delayDaysOf({ plannedEndDate: null, expectedCompletionDate: null })).toBeNull();
  });
});

describe('thresholdDays — unit normalisation', () => {
  it('passes day amounts straight through', () => {
    expect(thresholdDays({ amount: 30, unit: 'days' }, NOW)).toBe(30);
    expect(thresholdDays({ amount: 90, unit: 'days' }, NOW)).toBe(90);
  });

  it('converts months using the real calendar, not a 30-day approximation', () => {
    // 1 Mar 2026 → 1 Sep 2026 is 184 days, not 180.
    expect(thresholdDays({ amount: 6, unit: 'months' }, NOW)).toBe(184);
  });

  it('converts years using the real calendar', () => {
    expect(thresholdDays({ amount: 1, unit: 'years' }, NOW)).toBe(365);
  });

  it('accounts for a leap day when the span crosses one', () => {
    // 1 Mar 2024 → 1 Mar 2025 spans 29 Feb 2024.
    const leapNow = new Date('2025-03-01T00:00:00.000Z');
    expect(thresholdDays({ amount: 1, unit: 'years' }, leapNow)).toBe(365);
    // 1 Jan 2024 → 1 Jan 2025 contains the leap day.
    const acrossLeap = new Date('2025-01-01T00:00:00.000Z');
    expect(thresholdDays({ amount: 1, unit: 'years' }, acrossLeap)).toBe(366);
  });
});

describe('matchesDelayWindow — boundaries', () => {
  it('is strictly "more than": the exact threshold does NOT match', () => {
    expect(matchesDelayWindow(lateBy(30), '30d', NOW)).toBe(false);
    expect(matchesDelayWindow(lateBy(31), '30d', NOW)).toBe(true);
    expect(matchesDelayWindow(lateBy(29), '30d', NOW)).toBe(false);
  });

  it('excludes below and includes above for every day-based window', () => {
    for (const [key, limit] of [['30d', 30], ['60d', 60], ['90d', 90]] as const) {
      expect(matchesDelayWindow(lateBy(limit - 1), key, NOW), `${key} below`).toBe(false);
      expect(matchesDelayWindow(lateBy(limit), key, NOW), `${key} exact`).toBe(false);
      expect(matchesDelayWindow(lateBy(limit + 1), key, NOW), `${key} above`).toBe(true);
    }
  });

  it('handles the 6-month boundary on real calendar days', () => {
    const sixMonths = thresholdDays({ amount: 6, unit: 'months' }, NOW); // 184
    expect(matchesDelayWindow(lateBy(sixMonths - 1), '6m', NOW)).toBe(false);
    expect(matchesDelayWindow(lateBy(sixMonths), '6m', NOW)).toBe(false);
    expect(matchesDelayWindow(lateBy(sixMonths + 1), '6m', NOW)).toBe(true);
    // A 180-day delay must NOT count as "more than 6 months" here — the
    // whole point of calendar normalisation.
    expect(matchesDelayWindow(lateBy(180), '6m', NOW)).toBe(false);
  });

  it('handles the 1-year boundary', () => {
    const year = thresholdDays({ amount: 1, unit: 'years' }, NOW);
    expect(matchesDelayWindow(lateBy(year), '1y', NOW)).toBe(false);
    expect(matchesDelayWindow(lateBy(year + 1), '1y', NOW)).toBe(true);
  });

  it('never matches on-track or dateless projects', () => {
    for (const w of DELAY_WINDOWS) {
      expect(matchesDelayWindow(lateBy(-10), w.key, NOW), `${w.key} on-track`).toBe(false);
      expect(matchesDelayWindow({}, w.key, NOW), `${w.key} no date`).toBe(false);
    }
  });

  it('an empty selection matches everything (filter cleared)', () => {
    expect(matchesDelayWindow(lateBy(5), '', NOW)).toBe(true);
    expect(matchesDelayWindow({}, '', NOW)).toBe(true);
  });

  it('windows nest: anything past 1 year is also past 30/60/90 days', () => {
    const veryLate = lateBy(500);
    for (const key of ['30d', '60d', '90d', '6m', '1y'] as DelayWindowKey[]) {
      expect(matchesDelayWindow(veryLate, key, NOW), key).toBe(true);
    }
  });
});

describe('DELAY_WINDOWS', () => {
  it('offers exactly the five required options, in order', () => {
    expect(DELAY_WINDOWS.map((w) => w.label)).toEqual([
      'More than 30 Days',
      'More than 60 Days',
      'More than 90 Days',
      'More than 6 Months',
      'More than 1 Year',
    ]);
  });

  it('thresholds increase monotonically', () => {
    const days = DELAY_WINDOWS.map((w) => thresholdDays(w, NOW));
    for (let i = 1; i < days.length; i++) {
      expect(days[i]!, `${DELAY_WINDOWS[i]!.label}`).toBeGreaterThan(days[i - 1]!);
    }
  });
});
