import { describe, expect, it } from 'vitest';
import { fundsUcStatusOf, sharePercentsOf } from './fundsUc';

describe('fundsUcStatusOf', () => {
  it('is Submitted once a UC date exists, whatever the spend', () => {
    expect(fundsUcStatusOf({ ucSubmittedDate: '2026-01-01', expenditureIncurredCr: 0 })).toBe('Submitted');
    expect(fundsUcStatusOf({ ucSubmittedDate: '2026-01-01', expenditureIncurredCr: 50 })).toBe('Submitted');
  });

  it('is Overdue when money was spent but no UC was filed', () => {
    expect(fundsUcStatusOf({ ucSubmittedDate: null, expenditureIncurredCr: 12.5 })).toBe('Overdue');
  });

  it('is Pending when nothing has been spent yet', () => {
    expect(fundsUcStatusOf({ ucSubmittedDate: null, expenditureIncurredCr: 0 })).toBe('Pending');
  });
});

describe('sharePercentsOf', () => {
  /** The whole point of Task 4: every funding source yields a figure, not
   *  just the one that stores an explicit split. */
  it('passes through the recorded split for Central - State Share', () => {
    expect(
      sharePercentsOf({ fundingSource: 'Central - State Share', centralSharePct: 60, stateSharePct: 40 }),
    ).toEqual({ centralPct: 60, statePct: 40 });
  });

  it('treats both central funding sources as 100% central', () => {
    expect(
      sharePercentsOf({ fundingSource: 'Central - EAP', centralSharePct: null, stateSharePct: null }),
    ).toEqual({ centralPct: 100, statePct: 0 });
    expect(
      sharePercentsOf({ fundingSource: 'Central - Non-EAP', centralSharePct: null, stateSharePct: null }),
    ).toEqual({ centralPct: 100, statePct: 0 });
  });

  it('treats State Funded as 100% state', () => {
    expect(
      sharePercentsOf({ fundingSource: 'State Funded', centralSharePct: null, stateSharePct: null }),
    ).toEqual({ centralPct: 0, statePct: 100 });
  });

  it('derives the split even if stale values were stored against a non-split source', () => {
    // Guards the regression where a source was changed after the split was
    // entered: the source, not the leftover column, decides what is shown.
    expect(
      sharePercentsOf({ fundingSource: 'State Funded', centralSharePct: 70, stateSharePct: 30 }),
    ).toEqual({ centralPct: 0, statePct: 100 });
  });

  it('reports an unrecorded explicit split as unknown rather than zero', () => {
    expect(
      sharePercentsOf({ fundingSource: 'Central - State Share', centralSharePct: null, stateSharePct: null }),
    ).toEqual({ centralPct: null, statePct: null });
  });
});
