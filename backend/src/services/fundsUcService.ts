import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { fundingSources } from '../db/enums.js';
import { project, projectFundsUc } from '../db/schema.js';
import type { ProjectFundsUc } from '../db/schema.js';
import { recordAudit, type AuditActor } from '../lib/audit.js';
import { diffFundsUc } from '../lib/auditLabels.js';
import { HttpError } from '../middleware/errorHandler.js';
import { toNumberOrNull, toNumberOrZero } from '../lib/numbers.js';

type NumifiedFundsUc = Omit<
  ProjectFundsUc,
  'openingBalanceCr' | 'grantReceivedCr' | 'expenditureIncurredCr' | 'centralShareCr' | 'stateShareCr'
> & {
  openingBalanceCr: number;
  grantReceivedCr: number;
  expenditureIncurredCr: number;
  centralShareCr: number | null;
  stateShareCr: number | null;
};

function numify(row: ProjectFundsUc): NumifiedFundsUc {
  return {
    ...row,
    openingBalanceCr: toNumberOrZero(row.openingBalanceCr),
    grantReceivedCr: toNumberOrZero(row.grantReceivedCr),
    expenditureIncurredCr: toNumberOrZero(row.expenditureIncurredCr),
    centralShareCr: toNumberOrNull(row.centralShareCr),
    stateShareCr: toNumberOrNull(row.stateShareCr),
  };
}

const CENTRAL_STATE_SHARE = 'Central - State Share';

const moneyField = () => z.coerce.number().min(0).max(999_999).optional();
const dateField = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .nullable()
    .optional();

const fundsUcBaseFields = {
  fundingSource: z.enum(fundingSources),
  openingBalanceCr: moneyField(),
  grantReceivedCr: moneyField(),
  expenditureIncurredCr: moneyField(),
  /** Only meaningful when fundingSource = 'Central - State Share'; cleared
   *  server-side otherwise (see clearShareFieldsIfNotApplicable below). */
  centralShareCr: moneyField().nullable(),
  stateShareCr: moneyField().nullable(),
  sanctionNo: z.string().max(80).nullable().optional(),
  ucSubmittedDate: dateField(),
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
 *  so stale values from an earlier selection can't linger. */
function clearShareFieldsIfNotApplicable(
  fundingSource: string,
  centralShareCr: number | null | undefined,
  stateShareCr: number | null | undefined,
): { centralShareCr: number | null; stateShareCr: number | null } {
  if (fundingSource !== CENTRAL_STATE_SHARE) return { centralShareCr: null, stateShareCr: null };
  return { centralShareCr: centralShareCr ?? null, stateShareCr: stateShareCr ?? null };
}

export async function listFundsUc(): Promise<NumifiedFundsUc[]> {
  const rows = await db
    .select()
    .from(projectFundsUc)
    .orderBy(desc(projectFundsUc.createdAt), desc(projectFundsUc.fundsUcId));
  return rows.map(numify);
}

export async function createFundsUc(
  input: FundsUcCreateInput,
  actor: AuditActor,
): Promise<NumifiedFundsUc> {
  return db.transaction(async (tx) => {
    const [proj] = await tx
      .select({ projectId: project.projectId })
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

    const shares = clearShareFieldsIfNotApplicable(input.fundingSource, input.centralShareCr, input.stateShareCr);
    const [row] = await tx
      .insert(projectFundsUc)
      .values({
        projectId: input.projectId,
        fundingSource: input.fundingSource,
        openingBalanceCr: input.openingBalanceCr?.toString() ?? '0',
        grantReceivedCr: input.grantReceivedCr?.toString() ?? '0',
        expenditureIncurredCr: input.expenditureIncurredCr?.toString() ?? '0',
        centralShareCr: shares.centralShareCr?.toString() ?? null,
        stateShareCr: shares.stateShareCr?.toString() ?? null,
        sanctionNo: input.sanctionNo ?? null,
        ucSubmittedDate: input.ucSubmittedDate ?? null,
        remarks: input.remarks ?? null,
      })
      .returning();
    if (!row) throw new Error('project_funds_uc insert returned no row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId: input.projectId,
      projectNameSnapshot: null,
      changes: diffFundsUc({}, { table: 'project_funds_uc', ...row }),
    });
    return numify(row);
  });
}

export async function updateFundsUc(
  fundsUcId: number,
  input: FundsUcUpdateInput,
  actor: AuditActor,
): Promise<NumifiedFundsUc> {
  const patchKeys = Object.keys(input);

  return db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(projectFundsUc)
      .where(eq(projectFundsUc.fundsUcId, fundsUcId))
      .limit(1);
    if (!pre) throw new HttpError(404, 'FUNDS_UC_NOT_FOUND', `Funds & UC entry ${fundsUcId} does not exist`);

    let post = pre;
    if (patchKeys.length > 0) {
      const patch: Record<string, unknown> = {
        ...input,
        lastUpdated: new Date(),
      };
      if (input.openingBalanceCr !== undefined) patch.openingBalanceCr = input.openingBalanceCr.toString();
      if (input.grantReceivedCr !== undefined) patch.grantReceivedCr = input.grantReceivedCr.toString();
      if (input.expenditureIncurredCr !== undefined) {
        patch.expenditureIncurredCr = input.expenditureIncurredCr.toString();
      }
      // Recompute regardless of whether centralShareCr/stateShareCr were
      // explicitly patched — a fundingSource change away from 'Central -
      // State Share' must still clear any previously-saved share values.
      const effectiveFundingSource = input.fundingSource ?? pre.fundingSource;
      const shares = clearShareFieldsIfNotApplicable(
        effectiveFundingSource,
        input.centralShareCr !== undefined ? input.centralShareCr : toNumberOrNull(pre.centralShareCr),
        input.stateShareCr !== undefined ? input.stateShareCr : toNumberOrNull(pre.stateShareCr),
      );
      patch.centralShareCr = shares.centralShareCr?.toString() ?? null;
      patch.stateShareCr = shares.stateShareCr?.toString() ?? null;

      const [next] = await tx
        .update(projectFundsUc)
        .set(patch)
        .where(eq(projectFundsUc.fundsUcId, fundsUcId))
        .returning();
      if (!next) throw new Error('project_funds_uc update returned no row');
      post = next;
    }

    const before: Record<string, unknown> = { table: 'project_funds_uc', fundsUcId };
    const after: Record<string, unknown> = { table: 'project_funds_uc', fundsUcId };
    for (const k of patchKeys) {
      before[k] = (pre as Record<string, unknown>)[k];
      after[k] = (post as Record<string, unknown>)[k];
    }
    const changes = diffFundsUc(before, after);
    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId: pre.projectId,
        projectNameSnapshot: null,
        changes,
      });
    }
    return numify(post);
  });
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
