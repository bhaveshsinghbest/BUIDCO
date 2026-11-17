import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { fundingSources, fundSanctionAgencies, fundsUcStatuses, ucSentToOptions } from '../db/enums.js';
import type { FundsUcStatus } from '../db/enums.js';
import { project, projectFundsUc, projectScheme, scheme } from '../db/schema.js';
import type { ProjectFundsUc } from '../db/schema.js';
import { recordAudit, type AuditActor } from '../lib/audit.js';
import { diffFundsUc } from '../lib/auditLabels.js';
import { closingBalanceCr, effectiveUcStatus, isIsoCalendarDate, todayIst } from '../lib/fundsUc.js';
import { HttpError } from '../middleware/errorHandler.js';
import { toNumberOrNull, toNumberOrZero } from '../lib/numbers.js';
import { assertPdCanAccessProject } from './projectsService.js';

/** What the Funds Flow & UC tracker needs from the project itself. */
export interface FundsUcProjectInfo {
  projectName: string;
  divisionId: number | null;
  /** The project's scheme tags, in the order the Projects API lists them.
   *  The tracker counts a project once, under the first one. */
  schemeNames: string[];
  /** Fallback for "Amount Sanctioned" (Revised AA if > 0, else AA). */
  aaAmountCr: number | null;
  revisedAaAmountCr: number | null;
}

type NumericKeys =
  | 'fundSanctionedAmountCr'
  | 'fundReleasedToUdhdCr'
  | 'openingBalanceCr'
  | 'grantReceivedCr'
  | 'expenditureIncurredCr'
  | 'ucAmountCertifiedCr'
  | 'centralSharePct'
  | 'stateSharePct';

export type FundsUcEntry = Omit<ProjectFundsUc, NumericKeys> & {
  fundSanctionedAmountCr: number | null;
  fundReleasedToUdhdCr: number | null;
  openingBalanceCr: number;
  grantReceivedCr: number;
  expenditureIncurredCr: number;
  ucAmountCertifiedCr: number | null;
  centralSharePct: number | null;
  stateSharePct: number | null;
  /** Derived: Opening + Received by BUIDCo − Paid by BUIDCo. */
  closingBalanceCr: number;
  /** Derived: manual override, else Submitted / Overdue from the UC date,
   *  else Pending (funds received or paid) / Not Due. */
  ucStatus: FundsUcStatus;
  /** Days since the UC was submitted (IST calendar days), null if none. */
  ucDaysSinceSubmission: number | null;
  project: FundsUcProjectInfo | null;
};

function toEntry(row: ProjectFundsUc, info: FundsUcProjectInfo | null, today: string): FundsUcEntry {
  const openingBalanceCr = toNumberOrZero(row.openingBalanceCr);
  const grantReceivedCr = toNumberOrZero(row.grantReceivedCr);
  const expenditureIncurredCr = toNumberOrZero(row.expenditureIncurredCr);
  const uc = effectiveUcStatus(
    { ucSubmittedDate: row.ucSubmittedDate, ucStatusOverride: row.ucStatusOverride, grantReceivedCr, expenditureIncurredCr },
    today,
  );
  return {
    ...row,
    fundSanctionedAmountCr: toNumberOrNull(row.fundSanctionedAmountCr),
    fundReleasedToUdhdCr: toNumberOrNull(row.fundReleasedToUdhdCr),
    openingBalanceCr,
    grantReceivedCr,
    expenditureIncurredCr,
    ucAmountCertifiedCr: toNumberOrNull(row.ucAmountCertifiedCr),
    centralSharePct: toNumberOrNull(row.centralSharePct),
    stateSharePct: toNumberOrNull(row.stateSharePct),
    closingBalanceCr: closingBalanceCr(openingBalanceCr, grantReceivedCr, expenditureIncurredCr),
    ucStatus: uc.status,
    ucDaysSinceSubmission: uc.daysSince,
    project: info,
  };
}

/** Name, division, scheme names and AA figures for a set of projects. */
async function loadProjectInfo(projectIds: string[]): Promise<Map<string, FundsUcProjectInfo>> {
  const out = new Map<string, FundsUcProjectInfo>();
  if (projectIds.length === 0) return out;
  const [projects, schemes] = await Promise.all([
    db
      .select({
        projectId: project.projectId,
        projectName: project.projectName,
        divisionId: project.divisionId,
        aaAmountCr: project.aaAmountCr,
        revisedAaAmountCr: project.revisedAaAmountCr,
      })
      .from(project)
      .where(inArray(project.projectId, projectIds)),
    // Same unordered junction read as the Projects API, so "first-listed
    // scheme" here is the scheme listed first everywhere else.
    db
      .select({ projectId: projectScheme.projectId, schemeName: scheme.schemeName })
      .from(projectScheme)
      .innerJoin(scheme, eq(scheme.schemeId, projectScheme.schemeId))
      .where(inArray(projectScheme.projectId, projectIds)),
  ]);
  const schemesByProject = new Map<string, string[]>();
  for (const s of schemes) {
    const list = schemesByProject.get(s.projectId);
    if (list) list.push(s.schemeName);
    else schemesByProject.set(s.projectId, [s.schemeName]);
  }
  for (const p of projects) {
    out.set(p.projectId, {
      projectName: p.projectName,
      divisionId: p.divisionId,
      schemeNames: schemesByProject.get(p.projectId) ?? [],
      aaAmountCr: toNumberOrNull(p.aaAmountCr),
      revisedAaAmountCr: toNumberOrNull(p.revisedAaAmountCr),
    });
  }
  return out;
}

async function withProjectInfo(rows: ProjectFundsUc[]): Promise<FundsUcEntry[]> {
  const info = await loadProjectInfo(rows.map((r) => r.projectId));
  const today = todayIst();
  return rows.map((r) => toEntry(r, info.get(r.projectId) ?? null, today));
}

const CENTRAL_STATE_SHARE = 'Central - State Share';

/** A ₹ Cr figure. Absent leaves the column alone; null clears it (see
 *  columnValues: 0 on the NOT NULL ledger columns, NULL = "not entered" on
 *  the others, where 0 is a real value). */
const moneyField = () => z.coerce.number().min(0).max(999_999).nullable().optional();
const percentField = () => z.coerce.number().min(0).max(100).optional();
const dateField = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .refine(isIsoCalendarDate, 'Not a valid date')
    .nullable()
    .optional();

const fundsUcBaseFields = {
  // ① Sanction
  fundingSource: z.enum(fundingSources),
  fundSanctionAgency: z.enum(fundSanctionAgencies).nullable().optional(),
  fundSanctionedAmountCr: moneyField(),
  sanctionNo: z.string().trim().max(80).nullable().optional(),
  sanctionDate: dateField(),
  /** Only meaningful when fundingSource = 'Central - State Share'; a % of
   *  the combined share (0-100), not a ₹ Cr amount. Cleared server-side
   *  otherwise (see clearShareFieldsIfNotApplicable below). */
  centralSharePct: percentField().nullable(),
  stateSharePct: percentField().nullable(),
  // ② Released by the agency to UDHD
  fundReleasedToUdhdCr: moneyField(),
  // ③ Released by UDHD to BUIDCo
  openingBalanceCr: moneyField(),
  grantReceivedCr: moneyField(),
  // ④ Paid by BUIDCo
  expenditureIncurredCr: moneyField(),
  // ⑤ UC back to the department
  ucSubmittedDate: dateField(),
  ucSentTo: z.enum(ucSentToOptions).nullable().optional(),
  ucAmountCertifiedCr: moneyField(),
  ucStatusOverride: z.enum(fundsUcStatuses).nullable().optional(),
  remarks: z.string().max(20_000).nullable().optional(),
};

export const fundsUcCreateSchema = z.object({
  projectId: z.string().min(1),
  ...fundsUcBaseFields,
});
export const fundsUcUpdateSchema = z.object(fundsUcBaseFields).partial();

export type FundsUcCreateInput = z.infer<typeof fundsUcCreateSchema>;
export type FundsUcUpdateInput = z.infer<typeof fundsUcUpdateSchema>;

/** Central/State Share only apply to the 'Central - State Share' funding
 *  source — null them out when a different source is (or ends up) selected,
 *  so stale values from an earlier selection can't linger. Also enforces
 *  that the two percentages (when both given) don't exceed a combined 100%. */
function clearShareFieldsIfNotApplicable(
  fundingSource: string,
  centralSharePct: number | null | undefined,
  stateSharePct: number | null | undefined,
): { centralSharePct: number | null; stateSharePct: number | null } {
  if (fundingSource !== CENTRAL_STATE_SHARE) return { centralSharePct: null, stateSharePct: null };
  const central = centralSharePct ?? null;
  const state = stateSharePct ?? null;
  if (central !== null && state !== null && central + state > 100) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Central Share (${central}%) + State Share (${state}%) cannot exceed 100%.`,
    );
  }
  return { centralSharePct: central, stateSharePct: state };
}

const NOT_NULL_MONEY = new Set(['openingBalanceCr', 'grantReceivedCr', 'expenditureIncurredCr']);
const NULLABLE_MONEY = new Set(['fundSanctionedAmountCr', 'fundReleasedToUdhdCr', 'ucAmountCertifiedCr']);
const TEXT_KEYS = new Set(['sanctionNo', 'remarks']);

/**
 * Column values for the keys present in `input`. Numbers become the strings
 * Drizzle expects for NUMERIC; blank text becomes NULL so "cleared" and
 * "never entered" read the same.
 */
function columnValues(input: FundsUcUpdateInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === 'centralSharePct' || key === 'stateSharePct') continue;
    if (NOT_NULL_MONEY.has(key)) out[key] = String(value ?? 0);
    else if (NULLABLE_MONEY.has(key)) out[key] = value === null ? null : String(value);
    else if (TEXT_KEYS.has(key)) out[key] = typeof value === 'string' && value.trim() !== '' ? value : null;
    else out[key] = value;
  }
  return out;
}

/**
 * `pdDivisionId` mirrors the scoping already applied to /api/projects and
 * /api/kpis — a PD only sees funds/UC entries for projects in their own
 * assigned division (T-02). Null (MD/Admin/Viewer) means portfolio-wide.
 */
export async function listFundsUc(pdDivisionId: number | null = null): Promise<FundsUcEntry[]> {
  const rows = await db
    .select({ fundsUc: projectFundsUc })
    .from(projectFundsUc)
    .innerJoin(project, eq(project.projectId, projectFundsUc.projectId))
    .where(pdDivisionId !== null ? eq(project.divisionId, pdDivisionId) : undefined)
    .orderBy(desc(projectFundsUc.createdAt), desc(projectFundsUc.fundsUcId));
  return withProjectInfo(rows.map((r) => r.fundsUc));
}

/** Single-project lookup — used by every "individual project details" view
 *  (Input Sheet, Project Details page, MD Portfolio) instead of each one
 *  fetching the entire ledger and filtering client-side. Same PD
 *  division guard as /api/projects/:projectId (404s, not 403s, on a
 *  project outside the PD's division — avoids leaking its existence). */
export async function getFundsUcByProject(
  projectId: string,
  pdDivisionId: number | null = null,
): Promise<FundsUcEntry | null> {
  if (pdDivisionId !== null) {
    await assertPdCanAccessProject(projectId, pdDivisionId);
  }
  const [row] = await db
    .select()
    .from(projectFundsUc)
    .where(eq(projectFundsUc.projectId, projectId))
    .limit(1);
  if (!row) return null;
  const [entry] = await withProjectInfo([row]);
  return entry ?? null;
}

export async function createFundsUc(input: FundsUcCreateInput, actor: AuditActor): Promise<FundsUcEntry> {
  const created = await db.transaction(async (tx) => {
    const [proj] = await tx
      .select({ projectId: project.projectId, projectName: project.projectName })
      .from(project)
      .where(eq(project.projectId, input.projectId))
      .limit(1);
    if (!proj) throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${input.projectId} does not exist`);

    const [existing] = await tx
      .select({ fundsUcId: projectFundsUc.fundsUcId })
      .from(projectFundsUc)
      .where(eq(projectFundsUc.projectId, input.projectId))
      .limit(1);
    if (existing) {
      throw new HttpError(409, 'FUNDS_UC_EXISTS', 'This project already has a Funds & UC entry — edit it instead');
    }

    const { projectId, ...fields } = input;
    const shares = clearShareFieldsIfNotApplicable(input.fundingSource, input.centralSharePct, input.stateSharePct);
    const [row] = await tx
      .insert(projectFundsUc)
      .values({
        ...(columnValues(fields) as Partial<ProjectFundsUc>),
        projectId,
        fundingSource: input.fundingSource,
        centralSharePct: shares.centralSharePct?.toString() ?? null,
        stateSharePct: shares.stateSharePct?.toString() ?? null,
      })
      .returning();
    if (!row) throw new Error('project_funds_uc insert returned no row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId: input.projectId,
      projectNameSnapshot: proj.projectName,
      changes: diffFundsUc({}, { table: 'project_funds_uc', ...row }),
    });
    return row;
  });
  const [entry] = await withProjectInfo([created]);
  return entry!;
}

export async function updateFundsUc(
  fundsUcId: number,
  input: FundsUcUpdateInput,
  actor: AuditActor,
): Promise<FundsUcEntry> {
  const updated = await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(projectFundsUc)
      .where(eq(projectFundsUc.fundsUcId, fundsUcId))
      .limit(1);
    if (!pre) throw new HttpError(404, 'FUNDS_UC_NOT_FOUND', `Funds & UC entry ${fundsUcId} does not exist`);

    const patch: Record<string, unknown> = columnValues(input);
    // Recompute regardless of whether centralSharePct/stateSharePct were
    // explicitly patched — a fundingSource change away from 'Central -
    // State Share' must still clear any previously-saved share values.
    const effectiveFundingSource = input.fundingSource ?? pre.fundingSource;
    const shares = clearShareFieldsIfNotApplicable(
      effectiveFundingSource,
      input.centralSharePct !== undefined ? input.centralSharePct : toNumberOrNull(pre.centralSharePct),
      input.stateSharePct !== undefined ? input.stateSharePct : toNumberOrNull(pre.stateSharePct),
    );
    patch.centralSharePct = shares.centralSharePct?.toString() ?? null;
    patch.stateSharePct = shares.stateSharePct?.toString() ?? null;
    patch.lastUpdated = new Date();

    const [post] = await tx
      .update(projectFundsUc)
      .set(patch)
      .where(eq(projectFundsUc.fundsUcId, fundsUcId))
      .returning();
    if (!post) throw new Error('project_funds_uc update returned no row');

    // Only fields whose stored value actually changed reach the Audit Trail
    // (T-16): every editable column is compared before vs after.
    const before: Record<string, unknown> = { table: 'project_funds_uc', fundsUcId };
    const after: Record<string, unknown> = { table: 'project_funds_uc', fundsUcId };
    for (const k of [...Object.keys(fundsUcBaseFields)]) {
      before[k] = (pre as Record<string, unknown>)[k];
      after[k] = (post as Record<string, unknown>)[k];
    }
    const changes = diffFundsUc(before, after);
    if (changes.length > 0) {
      const [proj] = await tx
        .select({ projectName: project.projectName })
        .from(project)
        .where(eq(project.projectId, pre.projectId))
        .limit(1);
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId: pre.projectId,
        projectNameSnapshot: proj?.projectName ?? null,
        changes,
      });
    }
    return post;
  });
  const [entry] = await withProjectInfo([updated]);
  return entry!;
}

export async function deleteFundsUc(fundsUcId: number, actor: AuditActor): Promise<void> {
  await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(projectFundsUc)
      .where(eq(projectFundsUc.fundsUcId, fundsUcId))
      .limit(1);
    if (!pre) throw new HttpError(404, 'FUNDS_UC_NOT_FOUND', `Funds & UC entry ${fundsUcId} does not exist`);

    await recordAudit(tx, {
      actor,
      action: 'Deleted',
      projectId: pre.projectId,
      projectNameSnapshot: null,
      changes: diffFundsUc({ table: 'project_funds_uc', ...pre }, {}),
    });
    await tx.delete(projectFundsUc).where(eq(projectFundsUc.fundsUcId, fundsUcId));
  });
}
