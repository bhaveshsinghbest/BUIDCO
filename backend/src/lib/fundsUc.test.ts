import { describe, expect, it } from 'vitest';
import {
  closingBalanceCr,
  computeUcInfo,
  effectiveUcStatus,
  isIsoCalendarDate,
  todayIst,
  UC_OVERDUE_DAYS,
} from './fundsUc.js';

const TODAY = '2026-11-13';
/** YYYY-MM-DD for `n` days before TODAY. */
const ago = (n: number): string => new Date(Date.UTC(2026, 10, 13) - n * 86_400_000).toISOString().slice(0, 10);

describe('closingBalanceCr (T-07)', () => {
  it('is opening + received − paid, rounded to 2 decimals', () => {
    expect(closingBalanceCr(5, 70, 62)).toBe(13);
    expect(closingBalanceCr(0.1, 0.2, 0)).toBe(0.3);
  });
  it('can go negative when payments exceed the money available', () => {
    expect(closingBalanceCr(0, 10, 12.5)).toBe(-2.5);
  });
});

describe('computeUcInfo (T-08)', () => {
  it('returns null with neither a submission date nor a manual status', () => {
    expect(computeUcInfo({ ucSubmittedDate: null, ucStatusOverride: null }, TODAY)).toBeNull();
  });
  it('surfaces a manual status when no UC has been submitted', () => {
    expect(computeUcInfo({ ucSubmittedDate: null, ucStatusOverride: 'Pending' }, TODAY)).toEqual({
      daysSince: null,
      autoStatus: 'Not Due',
      status: 'Pending',
    });
  });
  it('is Submitted within the quarterly window', () => {
    expect(computeUcInfo({ ucSubmittedDate: ago(40), ucStatusOverride: null }, TODAY)).toMatchObject({
      daysSince: 40,
      status: 'Submitted',
    });
    expect(computeUcInfo({ ucSubmittedDate: ago(UC_OVERDUE_DAYS), ucStatusOverride: null }, TODAY)?.status).toBe(
      'Submitted',
    );
  });
  it('is Overdue after more than 100 days', () => {
    expect(computeUcInfo({ ucSubmittedDate: ago(140), ucStatusOverride: null }, TODAY)).toMatchObject({
      daysSince: 140,
      autoStatus: 'Overdue',
      status: 'Overdue',
    });
  });
  it('lets a manual status win over Overdue', () => {
    expect(computeUcInfo({ ucSubmittedDate: ago(140), ucStatusOverride: 'Acknowledged' }, TODAY)?.status).toBe(
      'Acknowledged',
    );
  });
  it('never reports negative ageing for a future date', () => {
    expect(computeUcInfo({ ucSubmittedDate: '2026-12-01', ucStatusOverride: null }, TODAY)?.daysSince).toBe(0);
  });
  it('returns null for an invalid date', () => {
    expect(computeUcInfo({ ucSubmittedDate: '2026-02-30', ucStatusOverride: null }, TODAY)).toBeNull();
  });
});

describe('effectiveUcStatus (T-09 ucStatus)', () => {
  const base = { ucSubmittedDate: null, ucStatusOverride: null };
  it('is Pending once BUIDCo has received or paid funds without a UC', () => {
    expect(effectiveUcStatus({ ...base, grantReceivedCr: 55, expenditureIncurredCr: 48 }, TODAY)).toEqual({
      status: 'Pending',
      daysSince: null,
    });
  });
  it('is Not Due when nothing has reached BUIDCo', () => {
    expect(effectiveUcStatus({ ...base, grantReceivedCr: 0, expenditureIncurredCr: 0 }, TODAY).status).toBe('Not Due');
  });
  it('uses the UC ageing when a UC has been submitted', () => {
    expect(
      effectiveUcStatus({ ucSubmittedDate: ago(15), ucStatusOverride: null, grantReceivedCr: 1, expenditureIncurredCr: 1 }, TODAY),
    ).toEqual({ status: 'Submitted', daysSince: 15 });
  });
});

describe('date helpers', () => {
  it('formats today in IST as YYYY-MM-DD', () => {
    // 20:00 UTC on 13 Nov is already 14 Nov in India.
    expect(todayIst(new Date('2026-11-13T20:00:00Z'))).toBe('2026-11-14');
    expect(todayIst(new Date('2026-11-13T10:00:00Z'))).toBe('2026-11-13');
  });
  it('accepts only real calendar dates', () => {
    expect(isIsoCalendarDate('2026-02-28')).toBe(true);
    expect(isIsoCalendarDate('2026-02-30')).toBe(false);
    expect(isIsoCalendarDate('13/11/2026')).toBe(false);
  });
});
