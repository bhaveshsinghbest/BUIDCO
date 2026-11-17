import { describe, expect, it } from 'vitest';
import {
  aggregateFlow,
  breakupItems,
  computeFundFlow,
  computeUCClosingBalance,
  computeUCInfo,
  cr,
  emptyFundsForm,
  entryToFundProject,
  fmtD,
  formFromEntry,
  fundsFormsDiffer,
  getSanctionedCost,
  groupFundRows,
  isFundTracked,
  isoDate,
  makeDemoFundProjects,
  payloadFromForm,
  pctOf,
  primaryScheme,
  sharePercentsOf,
  stageSegments,
  summariseUc,
  toFundRows,
  toNum,
  validateFundsForm,
  withClosingBalance,
  type FundProject,
} from './fundsUc';
import type { FundsUcEntry } from '../types/api';

/** Fixed reference date so ageing is deterministic. */
const TODAY = new Date(2026, 10, 13, 15, 30);
const ago = (days: number): string => {
  const d = new Date(2026, 10, 13);
  d.setDate(d.getDate() - days);
  return isoDate(d);
};
const proj = (fields: Partial<FundProject>): FundProject => ({ id: 'P', projectName: 'Project', ...fields });

describe('T-05 formatters and helpers', () => {
  it('cr formats ₹ in Indian grouping with 2 decimals', () => {
    expect(cr(216.8)).toBe('₹216.80');
    expect(cr(1234567.891)).toBe('₹12,34,567.89');
    expect(cr('')).toBe('₹0.00');
    expect(cr(null)).toBe('₹0.00');
  });

  it('pctOf rounds and guards a zero base', () => {
    expect(pctOf(216.8, 223.45)).toBe(97);
    expect(pctOf(5, 0)).toBe(0);
  });

  it('fmtD shows en-IN dates and a dash when empty', () => {
    expect(fmtD('2023-05-10')).toBe('10/5/2023');
    expect(fmtD('')).toBe('—');
    expect(fmtD(null)).toBe('—');
  });

  it('primaryScheme takes the first scheme tag, then the category, then Unassigned', () => {
    expect(primaryScheme({ sector: ['Namami Gange', 'AMRUT 2.0'] })).toBe('Namami Gange');
    expect(primaryScheme({ sector: [], schemeCategory: 'Saat Nischay-2' })).toBe('Saat Nischay-2');
    expect(primaryScheme({})).toBe('Unassigned');
  });

  it('isFundTracked needs at least one funds field', () => {
    expect(isFundTracked(proj({}))).toBe(false);
    expect(isFundTracked(proj({ fundingSourceType: 'State Funded' }))).toBe(true);
    expect(isFundTracked(proj({ ucSubmissionDate: '2026-01-01' }))).toBe(true);
    expect(isFundTracked(proj({ ucAmountCertified: '5' }))).toBe(false);
  });

  it('toNum turns non-numeric text into 0', () => {
    expect(toNum('AMRUT 2.0 Under Tender')).toBe(0);
    expect(toNum('12.5')).toBe(12.5);
    expect(toNum(undefined)).toBe(0);
  });
});

describe('T-06 getSanctionedCost', () => {
  it('prefers a positive Revised AA, else the AA', () => {
    expect(getSanctionedCost({ revisedAAAmount: '7.25', aaAmount: '5.5' })).toBe(7.25);
    expect(getSanctionedCost({ revisedAAAmount: '0', aaAmount: '5.5' })).toBe(5.5);
    expect(getSanctionedCost({ revisedAAAmount: '', aaAmount: '' })).toBe(0);
    expect(getSanctionedCost(null)).toBe(0);
  });
});

describe('T-07 computeUCClosingBalance', () => {
  it('is opening + received − spent, to 2 decimals', () => {
    expect(computeUCClosingBalance({ ucOpeningBalance: '5', ucGrantReceived: '70', ucExpenditureIncurred: '62' })).toBe(13);
    expect(computeUCClosingBalance({ ucOpeningBalance: '0.1', ucGrantReceived: '0.2' })).toBe(0.3);
    expect(computeUCClosingBalance({ ucGrantReceived: '10', ucExpenditureIncurred: '12.5' })).toBe(-2.5);
  });
});

describe('T-08 computeUCInfo', () => {
  it('is null with neither a submission date nor a manual status', () => {
    expect(computeUCInfo(proj({}), TODAY)).toBeNull();
  });
  it('surfaces a manual status without a submission date', () => {
    expect(computeUCInfo(proj({ ucStatus: 'Pending' }), TODAY)).toEqual({
      submitted: null,
      daysSince: null,
      autoStatus: 'Not Due',
      status: 'Pending',
    });
  });
  it('ages a submitted UC: Submitted up to 100 days, then Overdue', () => {
    expect(computeUCInfo(proj({ ucSubmissionDate: ago(100) }), TODAY)).toMatchObject({ daysSince: 100, status: 'Submitted' });
    expect(computeUCInfo(proj({ ucSubmissionDate: ago(101) }), TODAY)).toMatchObject({ daysSince: 101, status: 'Overdue' });
  });
  it('lets a manual status override the ageing', () => {
    expect(computeUCInfo(proj({ ucSubmissionDate: ago(140), ucStatus: 'Acknowledged' }), TODAY)?.status).toBe('Acknowledged');
  });
  it('is null for an invalid date', () => {
    expect(computeUCInfo(proj({ ucSubmissionDate: 'not a date' }), TODAY)).toBeNull();
  });
});

/** The spec's unit-test table (T-10, demo set). */
describe('T-09 computeFundFlow — spec cases', () => {
  it('row 1: Sanct 120, Rel 90, Open 5, Recv 70, Paid 62, Cert 50, UC 40 days ago', () => {
    const f = computeFundFlow(
      proj({ fundSanctionedAmount: '120', fundReleasedToUDHD: '90', ucOpeningBalance: '5', ucGrantReceived: '70', ucExpenditureIncurred: '62', ucAmountCertified: '50', ucSubmissionDate: ago(40) }),
      TODAY,
    );
    expect(f).toMatchObject({ yetToRelease: 30, withUDHD: 20, balance: 13, ucUncovered: 12, ucSent: true, ucStatus: 'Submitted', ucDays: 40 });
  });

  it('row 2: Sanct 200, Rel 120, Open 10, Recv 80, Paid 75, Cert 40, UC 140 days ago', () => {
    const f = computeFundFlow(
      proj({ fundSanctionedAmount: '200', fundReleasedToUDHD: '120', ucOpeningBalance: '10', ucGrantReceived: '80', ucExpenditureIncurred: '75', ucAmountCertified: '40', ucSubmissionDate: ago(140) }),
      TODAY,
    );
    expect(f).toMatchObject({ yetToRelease: 80, withUDHD: 40, balance: 15, ucUncovered: 35, ucStatus: 'Overdue' });
  });

  it('row 3: as row 1 but UC 15 days ago and "Acknowledged"', () => {
    const f = computeFundFlow(
      proj({ fundSanctionedAmount: '120', fundReleasedToUDHD: '90', ucOpeningBalance: '5', ucGrantReceived: '70', ucExpenditureIncurred: '62', ucAmountCertified: '50', ucSubmissionDate: ago(15), ucStatus: 'Acknowledged' }),
      TODAY,
    );
    expect(f.ucStatus).toBe('Acknowledged');
  });

  it('row 4: Sanct 150, Rel 100, Recv 55, Paid 48, no UC date → Pending, not sent', () => {
    const f = computeFundFlow(proj({ fundSanctionedAmount: '150', fundReleasedToUDHD: '100', ucGrantReceived: '55', ucExpenditureIncurred: '48' }), TODAY);
    expect(f).toMatchObject({ ucStatus: 'Pending', ucSent: false });
  });

  it('row 5: Rel blank → assumed equal to received', () => {
    const f = computeFundFlow(proj({ fundSanctionedAmount: '40', fundReleasedToUDHD: '', ucOpeningBalance: '2', ucGrantReceived: '25', ucExpenditureIncurred: '20' }), TODAY);
    expect(f).toMatchObject({ relUDHD: 25, relAssumed: true, withUDHD: 0, balance: 7 });
  });

  it('row 6: nothing received or paid, no UC → Not Due and outside the UC tracker', () => {
    const p = proj({ fundSanctionedAmount: '95', fundReleasedToUDHD: '40', ucGrantReceived: '0', ucExpenditureIncurred: '0' });
    const f = computeFundFlow(p, TODAY);
    expect(f.ucStatus).toBe('Not Due');
    expect(summariseUc(toFundRows([p], TODAY)).relevant).toHaveLength(0);
  });

  it('row 7: Sanct blank, AA 5.5 → sanctioned 5.5 (assumed)', () => {
    const f = computeFundFlow(proj({ fundSanctionedAmount: '', aaAmount: '5.5' }), TODAY);
    expect(f).toMatchObject({ sanctioned: 5.5, sanctionedAssumed: true });
  });

  it('treats an entered 0 for Released to UDHD as entered, not assumed', () => {
    const f = computeFundFlow(proj({ fundSanctionedAmount: '50', fundReleasedToUDHD: 0, ucGrantReceived: '10' }), TODAY);
    expect(f).toMatchObject({ relUDHD: 0, relAssumed: false, yetToRelease: 50, withUDHD: 0 });
  });

  it('lets the balance go negative when payments exceed what was available', () => {
    expect(computeFundFlow(proj({ ucGrantReceived: '10', ucExpenditureIncurred: '12' }), TODAY).balance).toBe(-2);
  });
});

describe('T-10 aggregateFlow', () => {
  it('sums per-project clamped gaps rather than recomputing them from totals', () => {
    const rows = toFundRows(
      [
        proj({ id: 'a', fundSanctionedAmount: '10', fundReleasedToUDHD: '30', ucGrantReceived: '30' }),
        proj({ id: 'b', fundSanctionedAmount: '20', fundReleasedToUDHD: '5', ucGrantReceived: '5' }),
      ],
      TODAY,
    );
    const t = aggregateFlow(rows);
    expect(t.relUDHD).toBeGreaterThan(t.sanctioned);
    expect(t.yetToRelease).toBe(15);
  });

  it('counts projects and assumptions', () => {
    const rows = toFundRows(
      [proj({ id: 'a', aaAmount: '5', ucGrantReceived: '3' }), proj({ id: 'b', fundSanctionedAmount: '9', fundReleasedToUDHD: '9' })],
      TODAY,
    );
    expect(aggregateFlow(rows)).toMatchObject({ n: 2, sanctioned: 14, sanctionedAssumed: 1, relAssumed: 1 });
  });
});

describe('demo data (T-18)', () => {
  it('overlays the 7 sample sets on the first 7 projects and computes the balance', () => {
    const base = Array.from({ length: 9 }, (_, i) => proj({ id: `p${i}`, projectName: `Project ${i}` }));
    const demo = makeDemoFundProjects(base, TODAY);
    expect(demo).toHaveLength(7);
    expect(demo[0]).toMatchObject({ projectName: 'Project 0', fundSanctionedAmount: '120', ucSubmissionDate: ago(40), ucClosingBalance: 13 });
    expect(demo[2]!.ucSubmissionDate).toBe(ago(140));
    const f = toFundRows(demo, TODAY);
    expect(f[1]!.f.ucStatus).toBe('Acknowledged');
    expect(f[2]!.f.ucStatus).toBe('Overdue');
    expect(f[3]!.f.ucStatus).toBe('Pending');
    expect(f[5]!.f.relAssumed).toBe(true);
  });
});

describe('grouping, breakups and the UC tracker', () => {
  const rows = toFundRows(makeDemoFundProjects(Array.from({ length: 7 }, (_, i) => proj({ id: `p${i}`, projectName: `P${i}`, sector: [i % 2 ? 'AMRUT 2.0' : 'Namami Gange'] })), TODAY), TODAY);

  it('groups by agency, largest sanctioned first, with "Not specified" for blanks', () => {
    const groups = groupFundRows(rows, (r) => (r.p.fundSanctionAgency ? String(r.p.fundSanctionAgency) : 'Not specified'));
    expect(groups[0]!.name).toBe('MoHUA – Govt. of India');
    expect(groups.reduce((s, g) => s + g.agg.n, 0)).toBe(7);
  });

  it('lists breakup items above 0.004, largest first, with their total', () => {
    const { items, total } = breakupItems('yet', rows);
    expect(items.every((r) => r.v > 0.004)).toBe(true);
    expect(items[0]!.v).toBeGreaterThanOrEqual(items[items.length - 1]!.v);
    expect(total).toBeCloseTo(aggregateFlow(rows).yetToRelease, 6);
  });

  it('summarises UC coverage and the watch-list', () => {
    const uc = summariseUc(rows);
    expect(uc.relevant).toHaveLength(6); // set 7 has nothing received or paid
    expect(uc.sent).toBe(4);
    expect(uc.notSent).toBe(2);
    expect(uc.overdue).toBe(1);
    expect(uc.paid).toBe(62 + 58 + 75 + 48 + 30 + 20);
    expect(uc.covered).toBe(50 + 58 + 40 + 30);
    expect(uc.sentTo).toEqual([['UDHD, Govt. of Bihar', 4]]);
    // Not sent, uncovered > 0, or overdue; largest uncovered first.
    expect(uc.watch.map((r) => r.p.id)).toEqual(['p3', 'p2', 'p5', 'p0']);
  });

  it('clamps a negative balance to 0 in the stage bar', () => {
    expect(stageSegments({ paid: 5, balance: -2, withUDHD: 1, yetToRelease: 0 })[1]!.v).toBe(0);
  });
});

const entry = (over: Partial<FundsUcEntry> = {}): FundsUcEntry => ({
  fundsUcId: 1,
  projectId: 'BUIDCO-1',
  fundingSource: 'Central - Non-EAP',
  fundSanctionAgency: 'NMCG – Govt. of India',
  fundSanctionedAmountCr: 120,
  sanctionNo: 'NMCG/1',
  sanctionDate: '2025-04-01',
  centralSharePct: null,
  stateSharePct: null,
  fundReleasedToUdhdCr: null,
  openingBalanceCr: 0,
  grantReceivedCr: 70,
  expenditureIncurredCr: 62,
  closingBalanceCr: 8,
  ucAmountCertifiedCr: 50,
  ucSentTo: 'UDHD, Govt. of Bihar',
  ucSubmittedDate: '2026-10-04',
  ucStatusOverride: null,
  ucStatus: 'Submitted',
  ucDaysSinceSubmission: 40,
  remarks: null,
  createdAt: '2026-01-01T00:00:00Z',
  lastUpdated: null,
  project: { projectName: 'Bakhtiyarpur STP', divisionId: 1, schemeNames: ['Namami Gange'], aaAmountCr: 32.45, revisedAaAmountCr: null },
  ...over,
});

describe('API adapters', () => {
  it('maps an entry to the spec keys, keeping a blank Released-to-UDHD blank', () => {
    const p = entryToFundProject(entry());
    expect(p).toMatchObject({ id: 'BUIDCO-1', projectName: 'Bakhtiyarpur STP', sector: ['Namami Gange'], ucGrantReceived: 70, fundReleasedToUDHD: '' });
    expect(computeFundFlow(p, TODAY).relAssumed).toBe(true);
    expect(computeFundFlow(entryToFundProject(entry({ fundReleasedToUdhdCr: 0 })), TODAY).relAssumed).toBe(false);
  });

  it('round-trips a form through the payload', () => {
    const form = formFromEntry(entry());
    expect(form.ucOpeningBalance).toBe(''); // a stored 0 on a NOT NULL ledger column shows blank
    expect(form.ucClosingBalance).toBe('8');
    expect(payloadFromForm(form)).toMatchObject({
      fundingSource: 'Central - Non-EAP',
      fundSanctionedAmountCr: 120,
      fundReleasedToUdhdCr: null,
      openingBalanceCr: 0,
      grantReceivedCr: 70,
      expenditureIncurredCr: 62,
      ucSubmittedDate: '2026-10-04',
      ucStatusOverride: null,
      centralSharePct: null,
    });
    expect(fundsFormsDiffer(form, formFromEntry(entry()))).toBe(false);
    expect(fundsFormsDiffer(form, { ...form, ucRemarks: 'x' })).toBe(true);
  });

  it('stores the auto balance as "" when it is 0 (T-13)', () => {
    expect(withClosingBalance({ ...emptyFundsForm(), ucGrantReceived: '5', ucExpenditureIncurred: '5' }).ucClosingBalance).toBe('');
    expect(withClosingBalance({ ...emptyFundsForm(), ucGrantReceived: '5', ucExpenditureIncurred: '7' }).ucClosingBalance).toBe('-2');
  });

  it('validates the form before saving', () => {
    expect(validateFundsForm(emptyFundsForm()).fundingSourceType).toBeTruthy();
    const ok = { ...emptyFundsForm(), fundingSourceType: 'State Funded' };
    expect(validateFundsForm(ok)).toEqual({});
    expect(validateFundsForm({ ...ok, ucGrantReceived: '-1' }).ucGrantReceived).toBe('Cannot be negative.');
    expect(validateFundsForm({ ...ok, ucGrantReceived: 'abc' }).ucGrantReceived).toBe('Enter a number.');
    const split = { ...ok, fundingSourceType: 'Central - State Share', centralSharePct: '70', stateSharePct: '40' };
    expect(validateFundsForm(split).stateSharePct).toMatch(/cannot exceed 100%/);
  });
});

describe('sharePercentsOf', () => {
  it('passes through the recorded split for Central - State Share', () => {
    expect(sharePercentsOf({ fundingSource: 'Central - State Share', centralSharePct: 60, stateSharePct: 40 })).toEqual({ centralPct: 60, statePct: 40 });
  });
  it('treats both central funding sources as 100% central', () => {
    expect(sharePercentsOf({ fundingSource: 'Central - EAP', centralSharePct: null, stateSharePct: null })).toEqual({ centralPct: 100, statePct: 0 });
    expect(sharePercentsOf({ fundingSource: 'Central - Non-EAP', centralSharePct: null, stateSharePct: null })).toEqual({ centralPct: 100, statePct: 0 });
  });
  it('treats State Funded as 100% state, ignoring stale stored values', () => {
    expect(sharePercentsOf({ fundingSource: 'State Funded', centralSharePct: 70, stateSharePct: 30 })).toEqual({ centralPct: 0, statePct: 100 });
  });
  it('reports an unrecorded explicit split as unknown rather than zero', () => {
    expect(sharePercentsOf({ fundingSource: 'Central - State Share', centralSharePct: null, stateSharePct: null })).toEqual({ centralPct: null, statePct: null });
  });
});
