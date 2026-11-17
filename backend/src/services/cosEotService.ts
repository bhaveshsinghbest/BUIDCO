import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { optionalIsoDate } from '../lib/validators.js';
import { db } from '../db/client.js';
import { cosCategories } from '../db/enums.js';
import { cosEotItem, project } from '../db/schema.js';
import type { CosEotItem } from '../db/schema.js';
import { recordAudit, type AuditActor } from '../lib/audit.js';
import { diffCosEot } from '../lib/auditLabels.js';
import { toNumberOrNull } from '../lib/numbers.js';
import { HttpError } from '../middleware/errorHandler.js';

const numericField = () =>
  z
    .number()
    .finite()
    .nullable()
    .optional()
    .transform((v) => (typeof v === 'number' ? String(v) : v));

const dateField = optionalIsoDate;

export const cosEotCreateSchema = z.object({
  cosNumber: z.string().min(1).max(20).nullable().optional(),
  cosDate: dateField(),
  category: z.enum(cosCategories).nullable().optional(),
  cosAmountCr: numericField(),
  variationPct: numericField(),
  eotNumber: z.string().min(1).max(20).nullable().optional(),
  eotDaysGranted: z.number().int().min(0).nullable().optional(),
  timeLinked: z.boolean().optional(),
  originalEndDate: dateField(),
  newEndDate: dateField(),
  revisedDate: dateField(),
});

export const cosEotUpdateSchema = cosEotCreateSchema.partial();

export type CosEotCreateInput = z.infer<typeof cosEotCreateSchema>;
export type CosEotUpdateInput = z.infer<typeof cosEotUpdateSchema>;

export interface CosEotOut {
  cosId: number;
  projectId: string;
  cosNumber: string | null;
  cosDate: string | null;
  category: string | null;
  cosAmountCr: number | null;
  variationPct: number | null;
  eotNumber: string | null;
  eotDaysGranted: number | null;
  timeLinked: boolean | null;
  originalEndDate: string | null;
  newEndDate: string | null;
  revisedDate: string | null;
}

function toOut(row: CosEotItem): CosEotOut {
  return {
    cosId: row.cosId,
    projectId: row.projectId,
    cosNumber: row.cosNumber,
    cosDate: row.cosDate,
    category: row.category,
    cosAmountCr: toNumberOrNull(row.cosAmountCr),
    variationPct: toNumberOrNull(row.variationPct),
    eotNumber: row.eotNumber,
    eotDaysGranted: row.eotDaysGranted,
    timeLinked: row.timeLinked,
    originalEndDate: row.originalEndDate,
    newEndDate: row.newEndDate,
    revisedDate: row.revisedDate,
  };
}

async function loadProjectName(projectId: string): Promise<string> {
  const [p] = await db
    .select({ projectName: project.projectName })
    .from(project)
    .where(eq(project.projectId, projectId))
    .limit(1);
  if (!p) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
  }
  return p.projectName;
}

export async function listCosEot(projectId: string): Promise<CosEotOut[]> {
  const rows = await db
    .select()
    .from(cosEotItem)
    .where(eq(cosEotItem.projectId, projectId))
    .orderBy(desc(cosEotItem.cosDate), desc(cosEotItem.cosId));
  return rows.map(toOut);
}

export async function createCosEot(
  projectId: string,
  input: CosEotCreateInput,
  actor: AuditActor,
): Promise<CosEotOut> {
  const projectName = await loadProjectName(projectId);

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(cosEotItem)
      .values({ ...input, projectId })
      .returning();
    if (!row) throw new Error('cos_eot_item insert did not return a row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId,
      projectNameSnapshot: projectName,
      changes: diffCosEot({}, { table: 'cos_eot_item', ...row }),
    });
    return row;
  });

  return toOut(inserted);
}

export async function updateCosEot(
  projectId: string,
  cosId: number,
  input: CosEotUpdateInput,
  actor: AuditActor,
): Promise<CosEotOut> {
  const projectName = await loadProjectName(projectId);
  const patchKeys = Object.keys(input);

  const updated = await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(cosEotItem)
      .where(and(eq(cosEotItem.cosId, cosId), eq(cosEotItem.projectId, projectId)))
      .limit(1);
    if (!pre) throw new HttpError(404, 'COS_EOT_NOT_FOUND', `CoS/EoT ${cosId} not found on project ${projectId}`);

    let post = pre;
    if (patchKeys.length > 0) {
      const [next] = await tx
        .update(cosEotItem)
        .set(input)
        .where(eq(cosEotItem.cosId, cosId))
        .returning();
      if (!next) throw new Error('cos_eot_item update did not return a row');
      post = next;
    }

    const scopedBefore: Record<string, unknown> = { table: 'cos_eot_item', cosId };
    const scopedAfter: Record<string, unknown> = { table: 'cos_eot_item', cosId };
    for (const k of patchKeys) {
      scopedBefore[k] = (pre as Record<string, unknown>)[k];
      scopedAfter[k] = (post as Record<string, unknown>)[k];
    }
    const changes = diffCosEot(scopedBefore, scopedAfter);
    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId,
        projectNameSnapshot: projectName,
        changes,
      });
    }
    return post;
  });

  return toOut(updated);
}

export async function deleteCosEot(
  projectId: string,
  cosId: number,
  actor: AuditActor,
): Promise<void> {
  const projectName = await loadProjectName(projectId);

  await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(cosEotItem)
      .where(and(eq(cosEotItem.cosId, cosId), eq(cosEotItem.projectId, projectId)))
      .limit(1);
    if (!pre) throw new HttpError(404, 'COS_EOT_NOT_FOUND', `CoS/EoT ${cosId} not found on project ${projectId}`);

    await recordAudit(tx, {
      actor,
      action: 'Deleted',
      projectId,
      projectNameSnapshot: projectName,
      changes: diffCosEot({ table: 'cos_eot_item', ...pre }, {}),
    });

    await tx.delete(cosEotItem).where(eq(cosEotItem.cosId, cosId));
  });
}
