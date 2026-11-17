/**
 * Milestones + monthly progress.
 *
 * Milestone weights must sum to 100 (±0.5) per project — enforced by
 * fn_check_milestone_weights, a DEFERRABLE INITIALLY DEFERRED constraint
 * trigger. That means we MUST make all inserts/updates/deletes for the
 * milestone set in one transaction: the trigger runs at COMMIT, so
 * intermediate states (partial insert with sum != 100) are fine, but
 * a stray single-row write outside a matched-set update will error.
 *
 * The public write API is therefore a full REPLACE-SET (PUT /) rather
 * than per-row POST/PATCH/DELETE. The frontend edits the list in
 * memory and posts the desired final state.
 *
 * Monthly progress uses UPSERT on (milestone_id, snap_month) so
 * re-submitting the same month is a correction, not a duplicate. The
 * `weighted_contribution` column is auto-computed by
 * fn_milestone_weighted_contribution on every insert/update.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { optionalIsoDate } from '../lib/validators.js';
import { isIsoCalendarDate } from '../lib/fundsUc.js';
import { db } from '../db/client.js';
import { milestoneProgress, project, projectMilestone } from '../db/schema.js';
import type { MilestoneProgress, ProjectMilestone } from '../db/schema.js';
import { recordAudit, type AuditActor, type DbExecutor } from '../lib/audit.js';
import { diffMilestoneProgress, diffMilestoneSet } from '../lib/auditLabels.js';
import { toNumberOrNull } from '../lib/numbers.js';
import { HttpError } from '../middleware/errorHandler.js';

/* ============================================================
 * Zod
 * ============================================================ */

const dateField = optionalIsoDate;

const milestoneInput = z.object({
  milestoneId: z.number().int().positive().optional(),
  milestoneName: z.string().min(1).max(200),
  weightPct: z.number().finite().min(0.01).max(100),
  plannedDate: dateField(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const replaceMilestonesSchema = z
  .object({
    milestones: z.array(milestoneInput).min(1).max(50),
  })
  .refine(
    (v) => Math.abs(v.milestones.reduce((s, m) => s + m.weightPct, 0) - 100) < 0.5,
    { message: 'Milestone weights must sum to 100 (±0.5)' },
  );

export type ReplaceMilestonesInput = z.infer<typeof replaceMilestonesSchema>;

const progressEntry = z.object({
  milestoneId: z.number().int().positive(),
  progressPct: z.number().finite().min(0).max(100),
  note: z.string().max(2000).nullable().optional(),
});

export const upsertMonthlyProgressSchema = z.object({
  snapMonth: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/, 'snapMonth must be a first-of-month date (YYYY-MM-01)')
    .refine(isIsoCalendarDate, 'snapMonth is not a valid month'),
  entries: z.array(progressEntry).min(1).max(50),
});

export type UpsertMonthlyProgressInput = z.infer<typeof upsertMonthlyProgressSchema>;

/* ============================================================
 * Read
 * ============================================================ */

export interface MilestoneOut {
  milestoneId: number;
  projectId: string;
  milestoneName: string;
  weightPct: number | null;
  plannedDate: string | null;
  sortOrder: number | null;
}

function toMilestoneOut(row: ProjectMilestone): MilestoneOut {
  return {
    milestoneId: row.milestoneId,
    projectId: row.projectId,
    milestoneName: row.milestoneName,
    weightPct: toNumberOrNull(row.weightPct),
    plannedDate: row.plannedDate,
    sortOrder: row.sortOrder,
  };
}

async function loadProjectName(projectId: string, exec: DbExecutor = db): Promise<string> {
  const [p] = await exec
    .select({ projectName: project.projectName })
    .from(project)
    .where(eq(project.projectId, projectId))
    .limit(1);
  if (!p) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
  }
  return p.projectName;
}

export async function listMilestones(projectId: string): Promise<MilestoneOut[]> {
  const rows = await db
    .select()
    .from(projectMilestone)
    .where(eq(projectMilestone.projectId, projectId))
    .orderBy(projectMilestone.sortOrder, projectMilestone.milestoneId);
  return rows.map(toMilestoneOut);
}

/* ============================================================
 * Replace-set write
 * ============================================================ */

export async function replaceMilestones(
  projectId: string,
  input: ReplaceMilestonesInput,
  actor: AuditActor,
): Promise<MilestoneOut[]> {
  const projectName = await loadProjectName(projectId);

  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(projectMilestone)
      .where(eq(projectMilestone.projectId, projectId));
    const existingById = new Map(existing.map((m) => [m.milestoneId, m]));

    const inputIds = new Set<number>();
    for (const m of input.milestones) {
      if (m.milestoneId !== undefined) {
        if (!existingById.has(m.milestoneId)) {
          throw new HttpError(
            400,
            'MILESTONE_NOT_IN_PROJECT',
            `Milestone ${m.milestoneId} does not belong to project ${projectId}`,
          );
        }
        inputIds.add(m.milestoneId);
      }
    }

    const toDelete = existing.filter((m) => !inputIds.has(m.milestoneId));
    if (toDelete.length > 0) {
      await tx
        .delete(projectMilestone)
        .where(
          inArray(
            projectMilestone.milestoneId,
            toDelete.map((m) => m.milestoneId),
          ),
        );
    }

    const finalRows: ProjectMilestone[] = [];

    for (const m of input.milestones) {
      const values = {
        projectId,
        milestoneName: m.milestoneName,
        weightPct: String(m.weightPct),
        plannedDate: m.plannedDate ?? null,
        sortOrder: m.sortOrder ?? 0,
      };
      if (m.milestoneId !== undefined) {
        const [updated] = await tx
          .update(projectMilestone)
          .set(values)
          .where(eq(projectMilestone.milestoneId, m.milestoneId))
          .returning();
        if (!updated) throw new Error('milestone update returned no row');
        finalRows.push(updated);
      } else {
        const [inserted] = await tx.insert(projectMilestone).values(values).returning();
        if (!inserted) throw new Error('milestone insert returned no row');
        finalRows.push(inserted);
      }
    }

    const before = existing.map((m) => ({
      milestoneId: m.milestoneId,
      milestoneName: m.milestoneName,
      weightPct: m.weightPct,
      plannedDate: m.plannedDate,
      sortOrder: m.sortOrder,
    }));
    const after = finalRows.map((m) => ({
      milestoneId: m.milestoneId,
      milestoneName: m.milestoneName,
      weightPct: m.weightPct,
      plannedDate: m.plannedDate,
      sortOrder: m.sortOrder,
    }));

    const changes = diffMilestoneSet(
      { table: 'project_milestone_set', milestones: before },
      { table: 'project_milestone_set', milestones: after },
    );

    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId,
        projectNameSnapshot: projectName,
        changes,
      });
    }

    return finalRows;
  });

  return result.map(toMilestoneOut);
}

/* ============================================================
 * Monthly progress upsert
 * ============================================================ */

export interface MonthlyProgressOut {
  mpId: number;
  milestoneId: number;
  projectId: string;
  snapMonth: string;
  progressPct: number | null;
  weightedContribution: number | null;
  note: string | null;
}

function toProgressOut(row: MilestoneProgress): MonthlyProgressOut {
  return {
    mpId: row.mpId,
    milestoneId: row.milestoneId,
    projectId: row.projectId,
    snapMonth: row.snapMonth,
    progressPct: toNumberOrNull(row.progressPct),
    weightedContribution: toNumberOrNull(row.weightedContribution),
    note: row.note,
  };
}

export async function upsertMonthlyProgress(
  projectId: string,
  input: UpsertMonthlyProgressInput,
  actor: AuditActor,
): Promise<MonthlyProgressOut[]> {
  const projectName = await loadProjectName(projectId);

  const milestoneIds = Array.from(new Set(input.entries.map((e) => e.milestoneId)));

  const owned = await db
    .select({ milestoneId: projectMilestone.milestoneId })
    .from(projectMilestone)
    .where(
      and(
        eq(projectMilestone.projectId, projectId),
        inArray(projectMilestone.milestoneId, milestoneIds),
      ),
    );
  const ownedSet = new Set(owned.map((o) => o.milestoneId));
  const stranger = milestoneIds.find((id) => !ownedSet.has(id));
  if (stranger !== undefined) {
    throw new HttpError(
      400,
      'MILESTONE_NOT_IN_PROJECT',
      `Milestone ${stranger} does not belong to project ${projectId}`,
    );
  }

  const result = await db.transaction(async (tx) => {
    const preRows = await tx
      .select()
      .from(milestoneProgress)
      .where(
        and(
          eq(milestoneProgress.projectId, projectId),
          eq(milestoneProgress.snapMonth, input.snapMonth),
          inArray(milestoneProgress.milestoneId, milestoneIds),
        ),
      );
    const preByMilestone = new Map(preRows.map((r) => [r.milestoneId, r]));

    const finalRows: MilestoneProgress[] = [];
    for (const e of input.entries) {
      const [row] = await tx
        .insert(milestoneProgress)
        .values({
          milestoneId: e.milestoneId,
          projectId,
          snapMonth: input.snapMonth,
          progressPct: String(e.progressPct),
          note: e.note ?? null,
        })
        .onConflictDoUpdate({
          target: [milestoneProgress.milestoneId, milestoneProgress.snapMonth],
          set: {
            progressPct: String(e.progressPct),
            note: e.note ?? null,
          },
        })
        .returning();
      if (!row) throw new Error('milestone_progress upsert returned no row');
      finalRows.push(row);
    }

    const before = preRows.map((r) => ({
      milestoneId: r.milestoneId,
      progressPct: r.progressPct,
      note: r.note,
    }));
    const after = finalRows.map((r) => ({
      milestoneId: r.milestoneId,
      progressPct: r.progressPct,
      note: r.note,
    }));

    const changes = diffMilestoneProgress(
      { table: 'milestone_progress', snapMonth: input.snapMonth, entries: before },
      { table: 'milestone_progress', snapMonth: input.snapMonth, entries: after },
    );

    const isNet = finalRows.every((r) => !preByMilestone.has(r.milestoneId));
    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: isNet ? 'Created' : 'Updated',
        projectId,
        projectNameSnapshot: projectName,
        changes,
      });
    }

    return finalRows;
  });

  return result.map(toProgressOut);
}
