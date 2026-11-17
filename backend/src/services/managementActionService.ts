import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { optionalIsoDate } from '../lib/validators.js';
import { db } from '../db/client.js';
import { openClosedStatuses } from '../db/enums.js';
import { managementActionItem, project } from '../db/schema.js';
import type { ManagementActionItem } from '../db/schema.js';
import { recordAudit, type AuditActor } from '../lib/audit.js';
import { diffMgmtAction } from '../lib/auditLabels.js';
import { HttpError } from '../middleware/errorHandler.js';

const dateField = optionalIsoDate;

export const mgmtActionCreateSchema = z.object({
  topic: z.string().min(1).max(2000),
  status: z.enum(openClosedStatuses).default('Open'),
  deadlineDate: dateField(),
});

export const mgmtActionUpdateSchema = mgmtActionCreateSchema.partial();

export type MgmtActionCreateInput = z.infer<typeof mgmtActionCreateSchema>;
export type MgmtActionUpdateInput = z.infer<typeof mgmtActionUpdateSchema>;

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

export async function listMgmtActions(projectId: string): Promise<ManagementActionItem[]> {
  return db
    .select()
    .from(managementActionItem)
    .where(eq(managementActionItem.projectId, projectId))
    .orderBy(desc(managementActionItem.createdAt), desc(managementActionItem.itemId));
}

export async function createMgmtAction(
  projectId: string,
  input: MgmtActionCreateInput,
  actor: AuditActor,
): Promise<ManagementActionItem> {
  const projectName = await loadProjectName(projectId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(managementActionItem)
      .values({ ...input, projectId })
      .returning();
    if (!row) throw new Error('management_action_item insert did not return a row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId,
      projectNameSnapshot: projectName,
      changes: diffMgmtAction({}, { table: 'management_action_item', ...row }),
    });
    return row;
  });
}

export async function updateMgmtAction(
  projectId: string,
  itemId: number,
  input: MgmtActionUpdateInput,
  actor: AuditActor,
): Promise<ManagementActionItem> {
  const projectName = await loadProjectName(projectId);
  const patchKeys = Object.keys(input);

  return db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(managementActionItem)
      .where(
        and(eq(managementActionItem.itemId, itemId), eq(managementActionItem.projectId, projectId)),
      )
      .limit(1);
    if (!pre)
      throw new HttpError(404, 'MGMT_ACTION_NOT_FOUND', `Management action ${itemId} not found on project ${projectId}`);

    let post = pre;
    if (patchKeys.length > 0) {
      const [next] = await tx
        .update(managementActionItem)
        .set(input)
        .where(eq(managementActionItem.itemId, itemId))
        .returning();
      if (!next) throw new Error('management_action_item update did not return a row');
      post = next;
    }

    const scopedBefore: Record<string, unknown> = { table: 'management_action_item', itemId };
    const scopedAfter: Record<string, unknown> = { table: 'management_action_item', itemId };
    for (const k of patchKeys) {
      scopedBefore[k] = (pre as Record<string, unknown>)[k];
      scopedAfter[k] = (post as Record<string, unknown>)[k];
    }
    const changes = diffMgmtAction(scopedBefore, scopedAfter);
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
}

export async function deleteMgmtAction(
  projectId: string,
  itemId: number,
  actor: AuditActor,
): Promise<void> {
  const projectName = await loadProjectName(projectId);

  await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(managementActionItem)
      .where(
        and(eq(managementActionItem.itemId, itemId), eq(managementActionItem.projectId, projectId)),
      )
      .limit(1);
    if (!pre)
      throw new HttpError(404, 'MGMT_ACTION_NOT_FOUND', `Management action ${itemId} not found on project ${projectId}`);

    await recordAudit(tx, {
      actor,
      action: 'Deleted',
      projectId,
      projectNameSnapshot: projectName,
      changes: diffMgmtAction({ table: 'management_action_item', ...pre }, {}),
    });

    await tx.delete(managementActionItem).where(eq(managementActionItem.itemId, itemId));
  });
}
