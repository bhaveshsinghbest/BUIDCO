import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { optionalIsoDate } from '../lib/validators.js';
import { db } from '../db/client.js';
import { priorities } from '../db/enums.js';
import { preMonsoonItem } from '../db/schema.js';
import type { PreMonsoonItem } from '../db/schema.js';
import { recordAudit, type AuditActor } from '../lib/audit.js';
import { diffPreMonsoon } from '../lib/auditLabels.js';
import { HttpError } from '../middleware/errorHandler.js';

const dateField = optionalIsoDate;

export const preMonsoonCreateSchema = z.object({
  topic: z.string().min(1).max(20_000),
  priority: z.enum(priorities).nullable().optional(),
  deadlineDate: dateField(),
});
export const preMonsoonUpdateSchema = preMonsoonCreateSchema.partial();

export type PreMonsoonCreateInput = z.infer<typeof preMonsoonCreateSchema>;
export type PreMonsoonUpdateInput = z.infer<typeof preMonsoonUpdateSchema>;

export async function listPreMonsoon(): Promise<PreMonsoonItem[]> {
  return db
    .select()
    .from(preMonsoonItem)
    .orderBy(desc(preMonsoonItem.createdAt), desc(preMonsoonItem.itemId));
}

export async function createPreMonsoon(
  input: PreMonsoonCreateInput,
  actor: AuditActor,
): Promise<PreMonsoonItem> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(preMonsoonItem).values(input).returning();
    if (!row) throw new Error('pre_monsoon_item insert returned no row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId: null,
      projectNameSnapshot: null,
      changes: diffPreMonsoon({}, { table: 'pre_monsoon_item', ...row }),
    });
    return row;
  });
}

export async function updatePreMonsoon(
  itemId: number,
  input: PreMonsoonUpdateInput,
  actor: AuditActor,
): Promise<PreMonsoonItem> {
  const patchKeys = Object.keys(input);

  return db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(preMonsoonItem)
      .where(eq(preMonsoonItem.itemId, itemId))
      .limit(1);
    if (!pre) throw new HttpError(404, 'PRE_MONSOON_NOT_FOUND', `Pre-monsoon item ${itemId} does not exist`);

    let post = pre;
    if (patchKeys.length > 0) {
      const [next] = await tx
        .update(preMonsoonItem)
        .set(input)
        .where(eq(preMonsoonItem.itemId, itemId))
        .returning();
      if (!next) throw new Error('pre_monsoon_item update returned no row');
      post = next;
    }

    const before: Record<string, unknown> = { table: 'pre_monsoon_item', itemId };
    const after: Record<string, unknown> = { table: 'pre_monsoon_item', itemId };
    for (const k of patchKeys) {
      before[k] = (pre as Record<string, unknown>)[k];
      after[k] = (post as Record<string, unknown>)[k];
    }
    const changes = diffPreMonsoon(before, after);
    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId: null,
        projectNameSnapshot: null,
        changes,
      });
    }
    return post;
  });
}

export async function deletePreMonsoon(itemId: number, actor: AuditActor): Promise<void> {
  await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(preMonsoonItem)
      .where(eq(preMonsoonItem.itemId, itemId))
      .limit(1);
    if (!pre) throw new HttpError(404, 'PRE_MONSOON_NOT_FOUND', `Pre-monsoon item ${itemId} does not exist`);

    await recordAudit(tx, {
      actor,
      action: 'Deleted',
      projectId: null,
      projectNameSnapshot: null,
      changes: diffPreMonsoon({ table: 'pre_monsoon_item', ...pre }, {}),
    });
    await tx.delete(preMonsoonItem).where(eq(preMonsoonItem.itemId, itemId));
  });
}
