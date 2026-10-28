import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ContractType,
  CurrentPhase,
  OmStatusOverride,
  Priority,
  ProjectDetail,
  ProjectStage,
  ProjectStageV2,
  ProjectStatus,
  ProjectUpsertPayload,
  TenderSubStage,
  WorkType,
} from '../types/api';

/**
 * All project fields the Input Sheet edits. Every value is either the
 * matching primitive (string/number) or `null`. Empty strings from the
 * form are normalized to `null` on save.
 */
export interface ProjectDraft {
  projectName: string;
  sectorId: number | null;
  city: string | null;
  districtId: number | null;
  divisionId: number | null;
  contractor: string | null;
  pd: string | null;
  mainWork: string | null;
  physicalWorkProgressNote: string | null;
  /** @deprecated Kept for legacy round-trip only; form no longer edits it. */
  projectStage: ProjectStage | null;
  /** @deprecated Kept for legacy round-trip only; form no longer edits it. */
  workType: WorkType | null;
  contractType: ContractType | null;
  sponsoringDept: string | null;
  implementingAgency: string | null;
  sanctionDate: string | null;
  projectBrief: string | null;

  /** @deprecated Kept for legacy round-trip only; form no longer edits it. */
  currentPhase: CurrentPhase | null;
  projectStageV2: ProjectStageV2 | null;
  /**
   * Server-owned tender workflow sub-stage. Not user-editable via the form —
   * moved by the Tender Dashboard modal — but round-trips through the draft
   * so the Input Sheet's stage gate can read the current value.
   */
  tenderSubStage: TenderSubStage | null;
  /**
   * NIT details — server-owned, editable ONLY from the Tender Dashboard's
   * NIT Published sub-stage. Present here for read-only display in views
   * that hydrate from ProjectDetail; the general PATCH strips these fields
   * so the draft-based save can't overwrite them accidentally.
   */
  nitNumber: string | null;
  nitDate: string | null;
  status: ProjectStatus;
  plannedEndDate: string | null;
  revisedEndDate: string | null;
  delayReason: string | null;
  deptStuckAt: string | null;
  expectedCompletionDate: string | null;
  expectedCompletionRaw: string | null;

  priority: Priority | null;
  sanctionedCostCr: number | null;
  aaAmountCr: number | null;
  revisedAaAmountCr: number | null;
  agreementAmountCr: number | null;
  physicalProgressPct: number | null;
  financialProgressCr: number | null;
  financialProgressPct: number | null;
  scheduledProgressPct: number | null;

  agreementNumber: string | null;
  agreementDate: string | null;
  appointedDate: string | null;
  contractValueCr: number | null;
  mobAdvanceIssuedCr: number | null;
  mobAdvanceRecoveredCr: number | null;
  advanceOutstandingCr: number | null;
  retentionMoneyHeldCr: number | null;
  pbgNumber: string | null;
  pbgAmountCr: number | null;
  pbgExpiryDate: string | null;
  pbgIssuingBank: string | null;
  insurancePolicyNo: string | null;
  insurer: string | null;
  insuredAmountCr: number | null;
  insuranceStartDate: string | null;
  insuranceExpiryDate: string | null;
  emdAmountCr: number | null;
  emdRefNumber: string | null;
  emdDate: string | null;
  totalPaymentsCr: number | null;
  lastPaymentDate: string | null;
  lastRaBillNo: string | null;

  geoTaggingUrl: string | null;
  remark: string | null;

  omApplicable: boolean;
  omStartDate: string | null;
  omPeriodMonths: number | null;
  omEndDate: string | null;
  omAgency: string | null;
  omStatusOverride: OmStatusOverride | null;
  omRemarks: string | null;

  mprMonth: string | null;
  fundReceivedCr: number | null;
  expenditureCentralRaw: string | null;
  expenditureStateRaw: string | null;
  manpowerEngagedRaw: string | null;
  mainComponentScope: string | null;
  progressPrevMonthRaw: string | null;
  progressThisMonthRaw: string | null;
  mprRemark: string | null;

  schemes: number[];
}

export const EMPTY_DRAFT: ProjectDraft = {
  projectName: '',
  sectorId: null,
  city: null,
  districtId: null,
  divisionId: null,
  contractor: null,
  pd: null,
  mainWork: null,
  physicalWorkProgressNote: null,
  projectStage: null,
  workType: null,
  contractType: null,
  sponsoringDept: null,
  implementingAgency: null,
  sanctionDate: null,
  projectBrief: null,

  currentPhase: null,
  projectStageV2: null,
  tenderSubStage: null,
  nitNumber: null,
  nitDate: null,
  status: 'Not Started',
  plannedEndDate: null,
  revisedEndDate: null,
  delayReason: null,
  deptStuckAt: null,
  expectedCompletionDate: null,
  expectedCompletionRaw: null,

  priority: null,
  sanctionedCostCr: null,
  aaAmountCr: null,
  revisedAaAmountCr: null,
  agreementAmountCr: null,
  physicalProgressPct: null,
  financialProgressCr: null,
  financialProgressPct: null,
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
  pbgExpiryDate: null,
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

  geoTaggingUrl: null,
  remark: null,

  omApplicable: false,
  omStartDate: null,
  omPeriodMonths: null,
  omEndDate: null,
  omAgency: null,
  omStatusOverride: null,
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

  schemes: [],
};

const KEYS = Object.keys(EMPTY_DRAFT) as Array<keyof ProjectDraft>;

function draftFromDetail(detail: ProjectDetail): ProjectDraft {
  const out: Record<string, unknown> = { ...EMPTY_DRAFT };
  for (const k of KEYS) {
    const value = (detail as unknown as Record<string, unknown>)[k];
    if (value !== undefined) out[k] = value ?? EMPTY_DRAFT[k];
  }
  out.projectName = detail.projectName;
  out.status = detail.status as ProjectStatus;
  out.schemes = detail.schemes ?? [];
  out.omApplicable = Boolean(detail.omApplicable);
  return out as unknown as ProjectDraft;
}

/** Turn empty strings into null so the backend Zod schema accepts them. */
function normalize<T>(v: T): T | null {
  if (v === '' || v === undefined) return null;
  return v;
}

export function draftToPayload(draft: ProjectDraft): ProjectUpsertPayload {
  const result: Record<string, unknown> = {};
  for (const k of KEYS) {
    result[k] = normalize(draft[k]);
  }
  result.projectName = draft.projectName.trim();
  result.status = draft.status;
  result.schemes = draft.schemes;
  result.omApplicable = draft.omApplicable;
  // Phase A §4.2 — Sanctioned Cost is a derived, read-only field. Overwrite
  // whatever was in the draft with the auto-populated value so the DB column
  // stays consistent with what the UI shows.
  result.sanctionedCostCr = draft.revisedAaAmountCr ?? draft.aaAmountCr ?? null;
  if (draft.geoTaggingUrl && !/^https?:\/\//i.test(draft.geoTaggingUrl)) {
    // Backend uses z.string().url() — drop invalid values silently so the
    // rest of the save still succeeds; the user can fix and re-save.
    result.geoTaggingUrl = null;
  }
  return result as ProjectUpsertPayload;
}

export interface UseProjectDraftResult {
  draft: ProjectDraft;
  setField: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
  setDraft: (next: ProjectDraft) => void;
  reset: () => void;
  isDirty: boolean;
  original: ProjectDraft;
}

export function useProjectDraft(seed?: ProjectDetail | null): UseProjectDraftResult {
  const seeded = useMemo(() => (seed ? draftFromDetail(seed) : EMPTY_DRAFT), [seed]);
  const [draft, setDraftState] = useState<ProjectDraft>(seeded);

  useEffect(() => {
    setDraftState(seeded);
  }, [seeded]);

  const setField = useCallback(
    <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]): void => {
      setDraftState((d) => ({ ...d, [key]: value }));
    },
    [],
  );

  const setDraft = useCallback((next: ProjectDraft) => setDraftState(next), []);
  const reset = useCallback(() => setDraftState(seeded), [seeded]);

  const isDirty = useMemo(() => {
    for (const k of KEYS) {
      const a = draft[k];
      const b = seeded[k];
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) return true;
      } else if (a !== b) return true;
    }
    return false;
  }, [draft, seeded]);

  return { draft, setField, setDraft, reset, isDirty, original: seeded };
}
