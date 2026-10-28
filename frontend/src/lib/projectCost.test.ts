import { describe, expect, it } from 'vitest';
import { costOverrunAmountCr, costOverrunStatus } from './projectCost';

describe('costOverrunAmountCr', () => {
  it('is the amount awarded above the sanctioned AA', () => {
    expect(costOverrunAmountCr({ aaAmountCr: 100, agreementAmountCr: 125 })).toBe(25);
  });

  it('is negative when the award came in under the AA', () => {
    expect(costOverrunAmountCr({ aaAmountCr: 100, agreementAmountCr: 80 })).toBe(-20);
  });

  it('is null when either figure is missing — unknown, not zero', () => {
    expect(costOverrunAmountCr({ aaAmountCr: null, agreementAmountCr: 125 })).toBeNull();
    expect(costOverrunAmountCr({ aaAmountCr: 100, agreementAmountCr: null })).toBeNull();
    expect(costOverrunAmountCr({ aaAmountCr: null, agreementAmountCr: null })).toBeNull();
  });

  it('treats a zero AA as a real figure, not a missing one', () => {
    expect(costOverrunAmountCr({ aaAmountCr: 0, agreementAmountCr: 10 })).toBe(10);
  });
});

describe('costOverrunStatus', () => {
  it('is Yes only when the award exceeds the AA', () => {
    expect(costOverrunStatus({ aaAmountCr: 100, agreementAmountCr: 125 })).toBe('Yes');
  });

  it('is No when under the AA', () => {
    expect(costOverrunStatus({ aaAmountCr: 100, agreementAmountCr: 80 })).toBe('No');
  });

  it('is No when exactly on the AA — on budget is not an overrun', () => {
    expect(costOverrunStatus({ aaAmountCr: 100, agreementAmountCr: 100 })).toBe('No');
  });

  it('is N/A when there is nothing to compare', () => {
    expect(costOverrunStatus({ aaAmountCr: null, agreementAmountCr: 125 })).toBe('N/A');
    expect(costOverrunStatus({ aaAmountCr: 100, agreementAmountCr: null })).toBe('N/A');
  });

  it('handles fractional crore amounts without rounding a near-miss into Yes', () => {
    expect(costOverrunStatus({ aaAmountCr: 10.5, agreementAmountCr: 10.5 })).toBe('No');
    expect(costOverrunStatus({ aaAmountCr: 10.5, agreementAmountCr: 10.51 })).toBe('Yes');
  });

  it('ignores a revised AA — regularising an overrun must not hide it', () => {
    // revisedAaAmountCr is intentionally not part of the input type; this
    // documents that passing extra fields cannot change the verdict.
    const project = { aaAmountCr: 100, agreementAmountCr: 130, revisedAaAmountCr: 130 };
    expect(costOverrunStatus(project)).toBe('Yes');
  });
});
