/**
 * Minutes of Meeting + action points.
 *
 * A MoM row can carry an optional `projectId` FK — the meeting isn't
 * strictly project-scoped. Action points are strictly nested under
 * their parent MoM (ON DELETE CASCADE). Audit rows use the MoM's
 * `projectId` when present so the trail is discoverable from a project.
 */

import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { isoDate, optionalIsoDate } from '../lib/validators.js';
import { db } from '../db/client.js';
import { momStatuses, openClosedStatuses } from '../db/enums.js';
import { minutesOfMeeting, momActionPoint, project } from '../db/schema.js';
import type { MinutesOfMeeting, MomActionPoint } from '../db/schema.js';
import { recordAudit, type AuditActor } from '../lib/audit.js';
import { diffMom, diffMomAction } from '../lib/auditLabels.js';
import { decodeCursor, encodeCursor, exactTimestamp, keysetAfter } from '../lib/pagination.js';
import { HttpError } from '../middleware/errorHandler.js';

const dateField = optionalIsoDate;

/* ============================================================
 * Zod schemas
 * ============================================================ */

export const momCreateSchema = z.object({
  meetingDate: isoDate(),
  meetingTitle: z.string().min(1).max(200),
  venue: z.string().max(150).nullable().optional(),
  chairperson: z.string().max(120).nullable().optional(),
  attendees: z.string().max(20_000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  agenda: z.string().max(20_000).nullable().optional(),
  decisions: z.string().max(20_000).nullable().optional(),
  momStatus: z.enum(momStatuses).default('Action Pending'),
  remarks: z.string().max(20_000).nullable().optional(),
});

export const momUpdateSchema = momCreateSchema.partial();

export type MomCreateInput = z.infer<typeof momCreateSchema>;
export type MomUpdateInput = z.infer<typeof momUpdateSchema>;

export const actionPointCreateSchema = z.object({
  description: z.string().min(1).max(20_000),
  owner: z.string().max(120).nullable().optional(),
  dueDate: dateField(),
  status: z.enum(openClosedStatuses).default('Open'),
  resolutionDate: dateField(),
});

export const actionPointUpdateSchema = actionPointCreateSchema.partial();

export type ActionPointCreateInput = z.infer<typeof actionPointCreateSchema>;
export type ActionPointUpdateInput = z.infer<typeof actionPointUpdateSchema>;

export const listMomQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
  projectId: z.string().uuid().optional(),
});
export type ListMomQuery = z.infer<typeof listMomQuery>;

/* ============================================================
 * Helpers
 * ============================================================ */

async function ensureProjectExists(projectId: string | null | undefined): Promise<string | null> {
  if (!projectId) return null;
  const [p] = await db
    .select({ projectName: project.projectName })
    .from(project)
    .where(eq(project.projectId, projectId))
    .limit(1);
  if (!p) throw new HttpError(400, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
  return p.projectName;
}

async function loadMom(momId: number): Promise<MinutesOfMeeting> {
  const [row] = await db
    .select()
    .from(minutesOfMeeting)
    .where(eq(minutesOfMeeting.momId, momId))
    .limit(1);
  if (!row) throw new HttpError(404, 'MOM_NOT_FOUND', `MoM ${momId} does not exist`);
  return row;
}

/* ============================================================
 * MoM CRUD
 * ============================================================ */

export interface MomDetail extends MinutesOfMeeting {
  actionPoints: MomActionPoint[];
}

/**
 * Division scope for a Project Director. A meeting linked to a project is
 * visible only when that project is in the PD's division — the same rule
 * every other project-scoped module applies. Unlinked (portfolio-level)
 * meetings stay visible to everyone.
 */
function pdMomScope(pdDivisionId: number) {
  return sql`(${minutesOfMeeting.projectId} IS NULL OR ${minutesOfMeeting.projectId} IN (
    SELECT ${project.projectId} FROM ${project} WHERE ${project.divisionId} = ${pdDivisionId}))`;
}

/** 404 (not 403) for a PD opening a meeting outside their division, so existence isn't leaked. */
export async function assertPdCanAccessMom(momId: number, pdDivisionId: number): Promise<void> {
  const [row] = await db
    .select({ momId: minutesOfMeeting.momId })
    .from(minutesOfMeeting)
    .where(and(eq(minutesOfMeeting.momId, momId), pdMomScope(pdDivisionId)))
    .limit(1);
  if (!row) throw new HttpError(404, 'MOM_NOT_FOUND', `MoM ${momId} does not exist`);
}

export async function listMom(
  q: ListMomQuery,
  pdDivisionId: number | null = null,
): Promise<{ items: MinutesOfMeeting[]; nextCursor: string | null }> {
  const wheres = [] as SQL[];
  if (q.projectId) wheres.push(eq(minutesOfMeeting.projectId, q.projectId));
  if (pdDivisionId !== null) wheres.push(pdMomScope(pdDivisionId));
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    const cursorId = Number(c.id);
    if (!Number.isInteger(cursorId)) {
      throw new HttpError(400, 'BAD_CURSOR', 'Cursor id is not an integer');
    }
    wheres.push(keysetAfter(minutesOfMeeting.createdAt, minutesOfMeeting.momId, c.createdAt, cursorId));
  }

  const rows = await db
    .select({ m: minutesOfMeeting, createdAtExact: exactTimestamp(minutesOfMeeting.createdAt) })
    .from(minutesOfMeeting)
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(desc(minutesOfMeeting.createdAt), desc(minutesOfMeeting.momId))
    .limit(q.limit + 1);

  let nextCursor: string | null = null;
  const pageRows = rows.slice(0, q.limit);
  if (rows.length > q.limit) {
    const last = pageRows[pageRows.length - 1];
    if (last) {
      nextCursor = encodeCursor({ createdAt: last.createdAtExact, id: String(last.m.momId) });
    }
  }
  return { items: pageRows.map((r) => r.m), nextCursor };
}

export async function getMom(momId: number): Promise<MomDetail> {
  const row = await loadMom(momId);
  const actionPoints = await db
    .select()
    .from(momActionPoint)
    .where(eq(momActionPoint.momId, momId))
    .orderBy(momActionPoint.actionId);
  return { ...row, actionPoints };
}

export async function createMom(input: MomCreateInput, actor: AuditActor): Promise<MinutesOfMeeting> {
  const projectName = await ensureProjectExists(input.projectId ?? null);

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(minutesOfMeeting).values(input).returning();
    if (!row) throw new Error('minutes_of_meeting insert returned no row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId: row.projectId ?? null,
      projectNameSnapshot: projectName,
      changes: diffMom({}, { table: 'minutes_of_meeting', ...row }),
    });
    return row;
  });
}

export async function updateMom(
  momId: number,
  input: MomUpdateInput,
  actor: AuditActor,
): Promise<MinutesOfMeeting> {
  if (input.projectId !== undefined) await ensureProjectExists(input.projectId);
  const patchKeys = Object.keys(input);

  return db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(minutesOfMeeting)
      .where(eq(minutesOfMeeting.momId, momId))
      .limit(1);
    if (!pre) throw new HttpError(404, 'MOM_NOT_FOUND', `MoM ${momId} does not exist`);

    let post = pre;
    if (patchKeys.length > 0) {
      const [next] = await tx
        .update(minutesOfMeeting)
        .set(input)
        .where(eq(minutesOfMeeting.momId, momId))
        .returning();
      if (!next) throw new Error('minutes_of_meeting update returned no row');
      post = next;
    }

    const before: Record<string, unknown> = { table: 'minutes_of_meeting', momId };
    const after: Record<string, unknown> = { table: 'minutes_of_meeting', momId };
    for (const k of patchKeys) {
      before[k] = (pre as Record<string, unknown>)[k];
      after[k] = (post as Record<string, unknown>)[k];
    }
    const changes = diffMom(before, after);
    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId: post.projectId ?? null,
        projectNameSnapshot: null,
        changes,
      });
    }
    return post;
  });
}

export async function deleteMom(momId: number, actor: AuditActor): Promise<void> {
  await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(minutesOfMeeting)
      .where(eq(minutesOfMeeting.momId, momId))
      .limit(1);
    if (!pre) throw new HttpError(404, 'MOM_NOT_FOUND', `MoM ${momId} does not exist`);

    await recordAudit(tx, {
      actor,
      action: 'Deleted',
      projectId: pre.projectId ?? null,
      projectNameSnapshot: null,
      changes: diffMom({ table: 'minutes_of_meeting', ...pre }, {}),
    });
    await tx.delete(minutesOfMeeting).where(eq(minutesOfMeeting.momId, momId));
  });
}

/* ============================================================
 * Action points
 * ============================================================ */

export async function listActionPoints(momId: number): Promise<MomActionPoint[]> {
  await loadMom(momId);
  return db
    .select()
    .from(momActionPoint)
    .where(eq(momActionPoint.momId, momId))
    .orderBy(momActionPoint.actionId);
}

export async function createActionPoint(
  momId: number,
  input: ActionPointCreateInput,
  actor: AuditActor,
): Promise<MomActionPoint> {
  const mom = await loadMom(momId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(momActionPoint)
      .values({ ...input, momId })
      .returning();
    if (!row) throw new Error('mom_action_point insert returned no row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId: mom.projectId ?? null,
      projectNameSnapshot: null,
      changes: diffMomAction({}, { table: 'mom_action_point', ...row }),
    });
    return row;
  });
}

export async function updateActionPoint(
  momId: number,
  actionId: number,
  input: ActionPointUpdateInput,
  actor: AuditActor,
): Promise<MomActionPoint> {
  const mom = await loadMom(momId);
  const patchKeys = Object.keys(input);

  return db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(momActionPoint)
      .where(and(eq(momActionPoint.actionId, actionId), eq(momActionPoint.momId, momId)))
      .limit(1);
    if (!pre) throw new HttpError(404, 'ACTION_NOT_FOUND', `Action ${actionId} not found on MoM ${momId}`);

    let post = pre;
    if (patchKeys.length > 0) {
      const [next] = await tx
        .update(momActionPoint)
        .set(input)
        .where(eq(momActionPoint.actionId, actionId))
        .returning();
      if (!next) throw new Error('mom_action_point update returned no row');
      post = next;
    }

    const before: Record<string, unknown> = { table: 'mom_action_point', momId, actionId };
    const after: Record<string, unknown> = { table: 'mom_action_point', momId, actionId };
    for (const k of patchKeys) {
      before[k] = (pre as Record<string, unknown>)[k];
      after[k] = (post as Record<string, unknown>)[k];
    }
    const changes = diffMomAction(before, after);
    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId: mom.projectId ?? null,
        projectNameSnapshot: null,
        changes,
      });
    }
    return post;
  });
}

export async function deleteActionPoint(
  momId: number,
  actionId: number,
  actor: AuditActor,
): Promise<void> {
  const mom = await loadMom(momId);

  await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(momActionPoint)
      .where(and(eq(momActionPoint.actionId, actionId), eq(momActionPoint.momId, momId)))
      .limit(1);
    if (!pre) throw new HttpError(404, 'ACTION_NOT_FOUND', `Action ${actionId} not found on MoM ${momId}`);

    await recordAudit(tx, {
      actor,
      action: 'Deleted',
      projectId: mom.projectId ?? null,
      projectNameSnapshot: null,
      changes: diffMomAction({ table: 'mom_action_point', ...pre }, {}),
    });
    await tx.delete(momActionPoint).where(eq(momActionPoint.actionId, actionId));
  });
}
