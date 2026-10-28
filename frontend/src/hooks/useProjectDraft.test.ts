import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, draftToPayload, useProjectDraft } from './useProjectDraft';
import type { ProjectDetail } from '../types/api';

function makeDetail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    projectId: 'proj-1',
    projectName: 'Test Project',
    status: 'In Progress',
    sectorId: 2,
    districtId: 5,
    divisionId: null,
    city: 'Patna',
    contractor: 'BUIDCO',
    pd: 'Kumar',
    projectStage: 'Construction',
    projectStageV2: 'Construction',
    tenderSubStage: null,
    nitNumber: null,
    nitDate: null,
    contractType: 'Work Contract',
    workType: 'Tender Work',
    priority: 'High',
    physicalProgressPct: 42,
    financialProgressPct: 30,
    financialProgressCr: 5,
    sanctionedCostCr: 12,
    aaAmountCr: 11,
    revisedAaAmountCr: null,
    agreementAmountCr: 10.5,
    plannedEndDate: '2027-01-15',
    revisedEndDate: null,
    expectedCompletionDate: null,
    expectedCompletionRaw: null,
    pbgExpiryDate: '2026-08-01',
    remark: null,
    omApplicable: false,
    omStartDate: null,
    omPeriodMonths: null,
    omEndDate: null,
    omStatusOverride: null,
    geoTaggingUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUpdated: null,
    effectivePhysicalPct: 42,
    isMilestoneWeighted: false,
    mainWork: null,
    physicalWorkProgressNote: null,
    sponsoringDept: null,
    implementingAgency: null,
    sanctionDate: null,
    projectBrief: null,
    currentPhase: null,
    delayReason: null,
    deptStuckAt: null,
    scheduledProgressPct: null,
    agreementNumber: null,
    agreementDate: null,
    appointedDate: null,
    contractValueCr: null,
    mobAdvanceIssuedCr: null,
    mobAdvanceRecoveredCr: null,
    advanceOutstandingCr: null,
    retentionMoneyHeldCr: null,
    pbgNumber: null,
    pbgAmountCr: null,
    pbgIssuingBank: null,
    insurancePolicyNo: null,
    insurer: null,
    insuredAmountCr: null,
    insuranceStartDate: null,
    insuranceExpiryDate: null,
    emdAmountCr: null,
    emdRefNumber: null,
    emdDate: null,
    totalPaymentsCr: null,
    lastPaymentDate: null,
    lastRaBillNo: null,
    omAgency: null,
    omRemarks: null,
    mprMonth: null,
    fundReceivedCr: null,
    expenditureCentralRaw: null,
    expenditureStateRaw: null,
    manpowerEngagedRaw: null,
    mainComponentScope: null,
    progressPrevMonthRaw: null,
    progressThisMonthRaw: null,
    mprRemark: null,
    schemes: [1, 3],
    ...overrides,
  };
}

describe('useProjectDraft', () => {
  it('starts empty when no seed is provided', () => {
    const { result } = renderHook(() => useProjectDraft(null));
    expect(result.current.draft).toEqual(EMPTY_DRAFT);
    expect(result.current.isDirty).toBe(false);
  });

  it('seeds fields from an existing project detail', () => {
    const detail = makeDetail();
    const { result } = renderHook(() => useProjectDraft(detail));
    expect(result.current.draft.projectName).toBe('Test Project');
    expect(result.current.draft.sectorId).toBe(2);
    expect(result.current.draft.status).toBe('In Progress');
    expect(result.current.draft.schemes).toEqual([1, 3]);
    expect(result.current.isDirty).toBe(false);
  });

  it('flips isDirty when a field is changed', () => {
    const detail = makeDetail();
    const { result } = renderHook(() => useProjectDraft(detail));
    act(() => result.current.setField('city', 'Gaya'));
    expect(result.current.draft.city).toBe('Gaya');
    expect(result.current.isDirty).toBe(true);
  });

  it('reset() restores the original draft and clears isDirty', () => {
    const detail = makeDetail();
    const { result } = renderHook(() => useProjectDraft(detail));
    act(() => result.current.setField('city', 'Muzaffarpur'));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.reset());
    expect(result.current.draft.city).toBe('Patna');
    expect(result.current.isDirty).toBe(false);
  });

  it('draftToPayload trims the project name and preserves schemes', () => {
    const draft = { ...EMPTY_DRAFT, projectName: '  New Project  ', schemes: [1, 4] };
    const payload = draftToPayload(draft);
    expect(payload.projectName).toBe('New Project');
    expect(payload.schemes).toEqual([1, 4]);
    expect(payload.status).toBe('Not Started');
  });

  it('draftToPayload drops invalid geoTaggingUrl values', () => {
    const draft = { ...EMPTY_DRAFT, projectName: 'X', geoTaggingUrl: 'not a url' };
    const payload = draftToPayload(draft);
    expect(payload.geoTaggingUrl).toBeNull();
  });

  it('draftToPayload keeps valid https URLs', () => {
    const draft = {
      ...EMPTY_DRAFT,
      projectName: 'X',
      geoTaggingUrl: 'https://maps.google.com/x',
    };
    const payload = draftToPayload(draft);
    expect(payload.geoTaggingUrl).toBe('https://maps.google.com/x');
  });
});
