/**
 * Shared Zod schemas for `project` writes.
 *
 * - Numeric fields are `number | null` on the wire and get transformed
 *   to strings before Drizzle sees them, because drizzle's `numeric`
 *   column type expects strings (to avoid IEEE 754 loss).
 * - Date fields expect `YYYY-MM-DD`.
 * - Enum-constrained varchars are validated against the enum arrays in
 *   src/db/enums.ts so a bad status/priority is a 400 at the API edge,
 *   not a 500 from Postgres.
 */

import { z } from 'zod';
import {
  contractTypes,
  currentPhases,
  omStatusOverrides,
  priorities,
  projectStageV2Values,
  projectStages,
  projectStatuses,
  tenderSubStages,
  workTypes,
} from '../db/enums.js';

const numericField = () =>
  z
    .number()
    .finite()
    .nullable()
    .optional()
    .transform((v) => (typeof v === 'number' ? String(v) : v));

const percentField = () =>
  z
    .number()
    .finite()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .transform((v) => (typeof v === 'number' ? String(v) : v));

const dateField = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .nullable()
    .optional();

const stringField = (max: number) => z.string().min(1).max(max).nullable().optional();
const textField = () => z.string().min(1).max(20_000).nullable().optional();

export const createProjectSchema = z.object({
  projectName: z.string().min(1).max(300),

  sectorId: z.number().int().positive().nullable().optional(),
  city: stringField(100),
  districtId: z.number().int().positive().nullable().optional(),
  divisionId: z.number().int().positive().nullable().optional(),
  contractor: stringField(200),
  pd: stringField(120),
  mainWork: textField(),
  physicalWorkProgressNote: textField(),
  /** @deprecated Soft-removed from UI (Phase A). Accepted for legacy round-trip. */
  projectStage: z.enum(projectStages).nullable().optional(),
  /** @deprecated Soft-removed from UI (Phase A). Accepted for legacy round-trip. */
  workType: z.enum(workTypes).nullable().optional(),
  contractType: z.enum(contractTypes).nullable().optional(),
  sponsoringDept: stringField(150),
  implementingAgency: stringField(150),
  sanctionDate: dateField(),
  projectBrief: textField(),

  /** @deprecated Soft-removed from UI (Phase A). Accepted for legacy round-trip. */
  currentPhase: z.enum(currentPhases).nullable().optional(),
  status: z.enum(projectStatuses).default('Not Started'),
  projectStageV2: z.enum(projectStageV2Values).nullable().optional(),
  /**
   * Tender Dashboard sub-stage. Server auto-assigns the first sub-stage
   * when projectStageV2 flips to 'Tender' and clears it otherwise, so
   * clients don't need to send this on normal saves. Accepted here so the
   * bulk-transfer API and any future direct edits can round-trip through
   * the same shared schema.
   */
  tenderSubStage: z.enum(tenderSubStages).nullable().optional(),
  /**
   * NIT Number + NIT Date — accepted on the main upsert only for the
   * initial Tender creation flow. The Tender Dashboard's inline editor
   * uses the dedicated PATCH /projects/:id/nit endpoint which enforces
   * the sub-stage rule; edits from other paths are blocked server-side.
   */
  nitNumber: stringField(80),
  nitDate: dateField(),
  plannedEndDate: dateField(),
  revisedEndDate: dateField(),
  delayReason: textField(),
  deptStuckAt: stringField(150),
  expectedCompletionDate: dateField(),
  expectedCompletionRaw: textField(),

  priority: z.enum(priorities).nullable().optional(),
  sanctionedCostCr: numericField(),
  aaAmountCr: numericField(),
  revisedAaAmountCr: numericField(),
  agreementAmountCr: numericField(),
  physicalProgressPct: percentField(),
  financialProgressCr: numericField(),
  financialProgressPct: percentField(),
  scheduledProgressPct: percentField(),

  agreementNumber: stringField(80),
  agreementDate: dateField(),
  appointedDate: dateField(),
  contractValueCr: numericField(),
  mobAdvanceIssuedCr: numericField(),
  mobAdvanceRecoveredCr: numericField(),
  advanceOutstandingCr: numericField(),
  retentionMoneyHeldCr: numericField(),
  pbgNumber: stringField(80),
  pbgAmountCr: numericField(),
  pbgExpiryDate: dateField(),
  pbgIssuingBank: stringField(120),

  /* Insurance (Task 5) — same field kinds as the PBG block above, so
   * validation, nullability and error shape are identical. */
  insurancePolicyNo: stringField(80),
  insurer: stringField(120),
  insuredAmountCr: numericField(),
  insuranceStartDate: dateField(),
  insuranceExpiryDate: dateField(),
  emdAmountCr: numericField(),
  emdRefNumber: stringField(80),
  emdDate: dateField(),
  totalPaymentsCr: numericField(),
  lastPaymentDate: dateField(),
  lastRaBillNo: stringField(60),

  geoTaggingUrl: z.string().url().nullable().optional(),

  remark: textField(),

  omApplicable: z.boolean().optional(),
  omStartDate: dateField(),
  omPeriodMonths: numericField(),
  omEndDate: dateField(),
  omAgency: stringField(150),
  omStatusOverride: z.enum(omStatusOverrides).nullable().optional(),
  omRemarks: textField(),

  mprMonth: stringField(20),
  fundReceivedCr: numericField(),
  expenditureCentralRaw: textField(),
  expenditureStateRaw: textField(),
  manpowerEngagedRaw: textField(),
  mainComponentScope: textField(),
  progressPrevMonthRaw: textField(),
  progressThisMonthRaw: textField(),
  mprRemark: textField(),

  schemes: z.array(z.number().int().positive()).max(20).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * Task 3 (bhaveshTask.md) — Import Project. Each item is validated against
 * the exact same rules as a manual Create Project; the cap matches the
 * Excel template's row allowance and keeps a single import request bounded.
 */
export const importProjectsSchema = z.object({
  items: z.array(createProjectSchema).min(1).max(200),
});
export type ImportProjectsInput = z.infer<typeof importProjectsSchema>;
