import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { auditActions } from '../db/enums.js';
import { auditLog, auditLogChange } from '../db/schema.js';
import type { AuditLog, AuditLogChange } from '../db/schema.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import { HttpError } from '../middleware/errorHandler.js';
import { optionalDbId } from '../lib/ids.js';

export const listAuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
  projectId: z.string().uuid().optional(),
  userId: optionalDbId,
  action: z.enum(auditActions).optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuery>;

export interface AuditItem {
  auditId: number;
  projectId: string | null;
  projectNameSnapshot: string | null;
  userId: number | null;
  userLabel: string;
  roleLabel: string | null;
  action: string;
  changedAt: Date;
  changes: AuditLogChange[];
}

export async function listAudit(
  q: ListAuditQuery,
): Promise<{ items: AuditItem[]; nextCursor: string | null }> {
  const wheres = [] as ReturnType<typeof eq>[];
  if (q.projectId) wheres.push(eq(auditLog.projectId, q.projectId));
  if (q.userId) wheres.push(eq(auditLog.userId, q.userId));
  if (q.action) wheres.push(eq(auditLog.action, q.action));

  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    const cursorDate = new Date(c.createdAt);
    const cursorId = Number(c.id);
    if (!Number.isInteger(cursorId)) {
      throw new HttpError(400, 'BAD_CURSOR', 'Cursor id is not an integer');
    }
    wheres.push(
      or(
        lt(auditLog.changedAt, cursorDate),
        and(eq(auditLog.changedAt, cursorDate), lt(auditLog.auditId, cursorId)),
      )!,
    );
  }

  const audits: AuditLog[] = await db
    .select()
    .from(auditLog)
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(desc(auditLog.changedAt), desc(auditLog.auditId))
    .limit(q.limit + 1);

  const page = audits.slice(0, q.limit);
  const auditIds = page.map((a) => a.auditId);

  const changeRows: AuditLogChange[] = auditIds.length > 0
    ? await db.select().from(auditLogChange).where(inArray(auditLogChange.auditId, auditIds))
    : [];

  const changesByAudit = new Map<number, AuditLogChange[]>();
  for (const c of changeRows) {
    const list = changesByAudit.get(c.auditId);
    if (list) {
      list.push(c);
    } else {
      changesByAudit.set(c.auditId, [c]);
    }
  }

  const items: AuditItem[] = page.map((a) => ({
    auditId: a.auditId,
    projectId: a.projectId,
    projectNameSnapshot: a.projectNameSnapshot,
    userId: a.userId,
    userLabel: a.userLabel,
    roleLabel: a.roleLabel,
    action: a.action,
    changedAt: a.changedAt,
    changes: changesByAudit.get(a.auditId) ?? [],
  }));

  let nextCursor: string | null = null;
  if (audits.length > q.limit) {
    const last = page[page.length - 1];
    if (last) {
      nextCursor = encodeCursor({
        createdAt: last.changedAt.toISOString(),
        id: String(last.auditId),
      });
    }
  }

  return { items, nextCursor };
}
