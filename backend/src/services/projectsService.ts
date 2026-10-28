import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/client.js';
import { auditLog, division, minutesOfMeeting, project, projectScheme } from '../db/schema.js';
import type { Project } from '../db/schema.js';
import {
  FINAL_TENDER_SUB_STAGE,
  FIRST_TENDER_SUB_STAGE,
  tenderSubStages,
  type TenderSubStage,
} from '../db/enums.js';
import { vProjectEffectivePhysical } from '../db/views.js';
import { recordAudit, type AuditActor, type DbExecutor } from '../lib/audit.js';
import { diffProject } from '../lib/auditLabels.js';
import { toNumberOrNull } from '../lib/numbers.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import type { CreateProjectInput, UpdateProjectInput } from '../lib/projectFields.js';
import { HttpError } from '../middleware/errorHandler.js';
import { optionalDbId } from '../lib/ids.js';

/**
 * Fixed Input fields (Input Sheet §1 / §5) — Basic Info + Contract & Security.
 * Only MD and Admin are allowed to change these; PD/Viewer patches are
 * silently stripped so they can still update Variable Input fields
 * (progress, remarks, geo photos, milestones, etc.) on the same request.
 *
 * The `schemes` many-to-many is not part of the `project` row's plain
 * columns but IS part of Basic Info from the user's POV, so it's guarded
 * separately in the update flow below.
 */
const FIXED_INPUT_KEYS = new Set<string>([
  // Basic Info
  'projectName', 'sectorId', 'city', 'districtId', 'divisionId',
  'contractor', 'pd', 'mainWork', 'physicalWorkProgressNote',
  'contractType', 'sponsoringDept', 'implementingAgency', 'sanctionDate',
  'projectBrief',
  // Contract & Security
  'agreementNumber', 'agreementDate', 'appointedDate',
  'contractValueCr', 'mobAdvanceIssuedCr', 'mobAdvanceRecoveredCr',
  'advanceOutstandingCr', 'retentionMoneyHeldCr',
  'pbgNumber', 'pbgAmountCr', 'pbgExpiryDate', 'pbgIssuingBank',
  'insurancePolicyNo', 'insurer', 'insuredAmountCr',
  'insuranceStartDate', 'insuranceExpiryDate',
  'emdAmountCr', 'emdRefNumber', 'emdDate',
  'totalPaymentsCr', 'lastPaymentDate', 'lastRaBillNo',
]);

const NUMERIC_KEYS = [
  'sanctionedCostCr',
  'aaAmountCr',
  'revisedAaAmountCr',
  'agreementAmountCr',
  'physicalProgressPct',
  'financialProgressCr',
  'financialProgressPct',
  'scheduledProgressPct',
  'contractValueCr',
  'mobAdvanceIssuedCr',
  'mobAdvanceRecoveredCr',
  'advanceOutstandingCr',
  'retentionMoneyHeldCr',
  'pbgAmountCr',
  'insuredAmountCr',
  'emdAmountCr',
  'totalPaymentsCr',
  'fundReceivedCr',
  'omPeriodMonths',
] as const satisfies readonly (keyof Project)[];

type NumericKey = (typeof NUMERIC_KEYS)[number];

type Numified<T> = {
  [K in keyof T]: K extends NumericKey ? number | null : T[K];
};

function numify<T extends Project>(row: T): Numified<T> {
  const out = { ...row } as Record<string, unknown>;
  for (const k of NUMERIC_KEYS) {
    out[k] = toNumberOrNull(row[k] as string | null);
  }
  return out as Numified<T>;
}

/* ============================================================
 * LIST
 * ============================================================ */

export const listProjectsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  /** Filters on the new project_stage_v2 column (Phase A §3.2). */
  projectStage: z.string().min(1).optional(),
  contractType: z.string().min(1).optional(),
  districtId: optionalDbId,
  divisionId: optionalDbId,
  regionId: optionalDbId,
  sectorId: optionalDbId,
  schemeId: optionalDbId,
  search: z.string().min(1).max(200).optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuery>;

export interface ProjectListItem extends Numified<Project> {
  effectivePhysicalPct: number | null;
  isMilestoneWeighted: boolean | null;
  schemes: number[];
}

export async function listProjects(
  q: ListProjectsQuery,
  /**
   * PD's session division from JWT. When set, forces division_id filter
   * regardless of what's in `q` — PDs can't broaden scope via query params.
   */
  pdDivisionId: number | null = null,
): Promise<{ items: ProjectListItem[]; nextCursor: string | null }> {
  const filters = [] as ReturnType<typeof eq>[];
  if (q.status) filters.push(eq(project.status, q.status));
  // Phase A §3.2 — the UI's "Project Stage" filter targets the new column.
  if (q.projectStage) filters.push(eq(project.projectStageV2, q.projectStage));
  if (q.contractType) filters.push(eq(project.contractType, q.contractType));
  if (q.districtId) filters.push(eq(project.districtId, q.districtId));
  // Phase C2 — PDs are locked to their session's division; the JWT claim
  // supersedes any divisionId in the query string.
  if (pdDivisionId !== null) {
    filters.push(eq(project.divisionId, pdDivisionId));
  } else if (q.divisionId) {
    filters.push(eq(project.divisionId, q.divisionId));
  }
  if (q.sectorId) filters.push(eq(project.sectorId, q.sectorId));

  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    filters.push(
      or(
        lt(project.createdAt, new Date(c.createdAt)),
        and(eq(project.createdAt, new Date(c.createdAt)), lt(project.projectId, c.id)),
      )!,
    );
  }

  // Region filter: pass through to project.divisionId via a subquery join,
  // since the project table has no region_id column of its own.
  // PDs never see a region filter — they're already pinned to a division.
  const regionClause = q.regionId && pdDivisionId === null
    ? sql`${project.divisionId} IN (SELECT ${division.divisionId} FROM ${division}
                                    WHERE ${division.regionId} = ${q.regionId})`
    : undefined;

  // NIT_addition_instructions.md §5 — the Projects Register search box also
  // matches on nit_number so users can look up a project by its tender reference.
  const searchClause = q.search
    ? sql`(${project.projectName} ILIKE ${'%' + q.search + '%'}
           OR ${project.projectId} = ${q.search}
           OR ${project.nitNumber} ILIKE ${'%' + q.search + '%'})`
    : undefined;

  const schemeJoin = q.schemeId
    ? sql`EXISTS (SELECT 1 FROM ${projectScheme} ps
                  WHERE ps.project_id = ${project.projectId}
                    AND ps.scheme_id = ${q.schemeId})`
    : undefined;

  const whereClauses = [...filters, searchClause, schemeJoin, regionClause].filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );

  const rows = await db
    .select({
      p: project,
      effectivePhysicalPct: vProjectEffectivePhysical.physicalProgressPct,
      isMilestoneWeighted: vProjectEffectivePhysical.isMilestoneWeighted,
    })
    .from(project)
    .leftJoin(vProjectEffectivePhysical, eq(vProjectEffectivePhysical.projectId, project.projectId))
    .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
    .orderBy(desc(project.createdAt), desc(project.projectId))
    .limit(q.limit + 1);

  const pageRows = rows.slice(0, q.limit);
  const pageIds = pageRows.map((r) => r.p.projectId);

  const schemeRows = pageIds.length > 0
    ? await db
        .select({ projectId: projectScheme.projectId, schemeId: projectScheme.schemeId })
        .from(projectScheme)
        .where(inArray(projectScheme.projectId, pageIds))
    : [];
  const schemesByProject = new Map<string, number[]>();
  for (const row of schemeRows) {
    const list = schemesByProject.get(row.projectId);
    if (list) list.push(row.schemeId);
    else schemesByProject.set(row.projectId, [row.schemeId]);
  }

  const items = pageRows.map((row) => ({
    ...numify(row.p),
    effectivePhysicalPct: toNumberOrNull(row.effectivePhysicalPct),
    isMilestoneWeighted: row.isMilestoneWeighted,
    schemes: schemesByProject.get(row.p.projectId) ?? [],
  }));

  let nextCursor: string | null = null;
  if (rows.length > q.limit) {
    const last = items[items.length - 1];
    if (last?.createdAt) {
      nextCursor = encodeCursor({
        createdAt: last.createdAt.toISOString(),
        id: last.projectId,
      });
    }
  }

  return { items, nextCursor };
}

/* ============================================================
 * DETAIL
 * ============================================================ */

export interface ProjectDetail extends Numified<Project> {
  effectivePhysicalPct: number | null;
  isMilestoneWeighted: boolean | null;
  schemes: number[];
}

export async function getProject(
  projectId: string,
  pdDivisionId: number | null = null,
): Promise<ProjectDetail> {
  const [row] = await db
    .select({
      p: project,
      effectivePhysicalPct: vProjectEffectivePhysical.physicalProgressPct,
      isMilestoneWeighted: vProjectEffectivePhysical.isMilestoneWeighted,
    })
    .from(project)
    .leftJoin(vProjectEffectivePhysical, eq(vProjectEffectivePhysical.projectId, project.projectId))
    .where(eq(project.projectId, projectId))
    .limit(1);

  if (!row) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
  }
  // Phase C2 — if the requester is a PD, refuse access to projects outside
  // their session's division. Return 404 (not 403) so we don't reveal that
  // the project exists in some other division.
  if (pdDivisionId !== null && row.p.divisionId !== pdDivisionId) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
  }

  const schemeRows = await db
    .select({ schemeId: projectScheme.schemeId })
    .from(projectScheme)
    .where(eq(projectScheme.projectId, projectId));

  return {
    ...numify(row.p),
    effectivePhysicalPct: toNumberOrNull(row.effectivePhysicalPct),
    isMilestoneWeighted: row.isMilestoneWeighted,
    schemes: schemeRows.map((s) => s.schemeId),
  };
}

/* ============================================================
 * WRITES
 * ============================================================ */

async function fetchProjectSchemes(exec: DbExecutor, projectId: string): Promise<number[]> {
  const rows = await exec
    .select({ schemeId: projectScheme.schemeId })
    .from(projectScheme)
    .where(eq(projectScheme.projectId, projectId));
  return rows.map((r) => r.schemeId);
}

async function syncProjectSchemes(
  exec: DbExecutor,
  projectId: string,
  desired: number[],
): Promise<void> {
  const current = await fetchProjectSchemes(exec, projectId);
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  const toAdd = desired.filter((s) => !currentSet.has(s));
  const toRemove = current.filter((s) => !desiredSet.has(s));
  if (toAdd.length > 0) {
    await exec.insert(projectScheme).values(toAdd.map((schemeId) => ({ projectId, schemeId })));
  }
  if (toRemove.length > 0) {
    await exec
      .delete(projectScheme)
      .where(
        and(eq(projectScheme.projectId, projectId), inArray(projectScheme.schemeId, toRemove)),
      );
  }
}

function stripSchemesFromPatch(input: CreateProjectInput | UpdateProjectInput): {
  schemes: number[] | undefined;
  fields: Record<string, unknown>;
} {
  const { schemes, ...rest } = input;
  return { schemes, fields: rest };
}

/**
 * Guard shared by single-create and bulk-import: creating a project
 * necessarily sets Basic Info + Contract & Security fields (Fixed Inputs).
 * Per the Input Sheet split, only MD/Admin may change those, so a
 * non-MD/Admin create is blocked outright even if their canCreateProjects
 * flag happens to be on.
 */
function assertActorCanCreate(actor: AuditActor): void {
  if (actor.role !== 'MD' && actor.role !== 'Admin') {
    throw new HttpError(
      403,
      'FIXED_INPUT_ROLE_REQUIRED',
      'Only MD or Admin can create new projects (Basic Info + Contract & Security are Fixed Inputs).',
    );
  }
}

/**
 * Inserts one project row + its scheme links + audit entry, using whatever
 * executor the caller passes (a bare `db` or a `tx` from `db.transaction`).
 * Shared by `createProject` (own transaction) and `createProjectsBulk` (one
 * shared transaction across every row, so the whole import is all-or-nothing).
 */
async function insertProjectRow(
  exec: DbExecutor,
  input: CreateProjectInput,
  actor: AuditActor,
  pdDivisionId: number | null,
): Promise<string> {
  const projectId = randomUUID();
  const { schemes, fields } = stripSchemesFromPatch(input);
  // Phase C2 — PDs create projects only in their own division; any client-
  // supplied divisionId is overwritten. Prevents payload manipulation.
  if (pdDivisionId !== null) {
    (fields as Record<string, unknown>).divisionId = pdDivisionId;
  }
  // Tender_Dashboard.md §2 + §9 — normalise the sub-stage / stage pairing
  // before we hit the DB CHECK constraint so the caller gets a useful 4xx
  // error rather than a raw Postgres integrity violation.
  reconcileTenderStageOnCreate(fields as Partial<Project>);

  const [inserted] = await exec
    .insert(project)
    .values({ ...(fields as Partial<Project>), projectId, projectName: input.projectName })
    .returning();
  if (!inserted) throw new Error('project insert did not return a row');

  if (schemes && schemes.length > 0) {
    await exec.insert(projectScheme).values(schemes.map((schemeId) => ({ projectId, schemeId })));
  }

  const changes = diffProject({}, {
    ...(inserted as unknown as Record<string, unknown>),
    schemes: schemes ?? [],
  });

  await recordAudit(exec, {
    actor,
    action: 'Created',
    projectId,
    projectNameSnapshot: inserted.projectName,
    changes,
  });

  return projectId;
}

export async function createProject(
  input: CreateProjectInput,
  actor: AuditActor,
  pdDivisionId: number | null = null,
): Promise<ProjectDetail> {
  assertActorCanCreate(actor);
  let projectId = '';
  await db.transaction(async (tx) => {
    projectId = await insertProjectRow(tx, input, actor, pdDivisionId);
  });
  return getProject(projectId);
}

/**
 * Task 3 (bhaveshTask.md) — Import Project. Creates every row inside ONE
 * transaction so a failure partway through (e.g. a bad FK that slipped past
 * validation) rolls back the entire batch rather than leaving a partial set
 * of projects behind. Uses the exact same insert/audit path as a single
 * manual Create Project, so imported projects are indistinguishable from
 * manually-created ones.
 */
export async function createProjectsBulk(
  inputs: CreateProjectInput[],
  actor: AuditActor,
  pdDivisionId: number | null = null,
): Promise<ProjectDetail[]> {
  assertActorCanCreate(actor);
  const projectIds: string[] = [];
  await db.transaction(async (tx) => {
    for (const input of inputs) {
      projectIds.push(await insertProjectRow(tx, input, actor, pdDivisionId));
    }
  });
  return Promise.all(projectIds.map((id) => getProject(id)));
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
  actor: AuditActor,
  pdDivisionId: number | null = null,
): Promise<ProjectDetail> {
  const { schemes: rawSchemes, fields } = stripSchemesFromPatch(input);
  const patch = fields as Partial<Project>;
  // Phase C2 — PDs cannot reassign a project to another division. Silently
  // drop any divisionId in the patch; project-access middleware has already
  // verified they own this project.
  if (pdDivisionId !== null && 'divisionId' in patch) {
    delete (patch as Record<string, unknown>).divisionId;
  }
  // Fixed Input restriction — only MD/Admin may mutate Basic Info + Contract
  // & Security columns. Anything else in the patch (Variable Input fields
  // like progress %, remarks, geo URLs, etc.) still goes through unchanged.
  // Schemes M2M counts as Basic Info, so strip it too for non-MD/Admin.
  let schemes = rawSchemes;
  if (actor.role !== 'MD' && actor.role !== 'Admin') {
    for (const key of Object.keys(patch)) {
      if (FIXED_INPUT_KEYS.has(key)) {
        delete (patch as Record<string, unknown>)[key];
      }
    }
    schemes = undefined;
  }
  const patchKeys = Object.keys(patch);

  const post = await db.transaction(async (tx) => {
    const [pre] = await tx.select().from(project).where(eq(project.projectId, projectId)).limit(1);
    if (!pre) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
    }
    const preSchemes = await fetchProjectSchemes(tx, projectId);

    // Tender_Dashboard.md §2 + §9 — normalise the tender sub-stage against
    // the incoming project stage, then reject illegal Construction/O&M
    // transitions before writing.
    reconcileTenderStageOnUpdate(pre, patch);

    // NIT_addition_instructions.md §4 — NIT Number / NIT Date are editable
    // only via the dedicated PATCH /:id/nit endpoint (which enforces the
    // sub-stage rule). Silently strip them from the generic update path
    // so a stray Input Sheet payload doesn't bypass the stage guard.
    if ('nitNumber' in patch) delete (patch as Record<string, unknown>).nitNumber;
    if ('nitDate' in patch) delete (patch as Record<string, unknown>).nitDate;

    let updated: Project = pre;
    if (patchKeys.length > 0) {
      const [next] = await tx
        .update(project)
        .set(patch)
        .where(eq(project.projectId, projectId))
        .returning();
      if (!next) throw new Error('project update did not return a row');
      updated = next;
    }

    let postSchemes = preSchemes;
    if (schemes !== undefined) {
      await syncProjectSchemes(tx, projectId, schemes);
      postSchemes = schemes;
    }

    const before: Record<string, unknown> = {
      ...(pre as unknown as Record<string, unknown>),
      schemes: preSchemes,
    };
    const after: Record<string, unknown> = {
      ...(updated as unknown as Record<string, unknown>),
      schemes: postSchemes,
    };
    // Only audit fields the caller actually supplied — a PATCH omitting a
    // field is "no change", so we shouldn't audit unchanged rows just
    // because their string representation drifted (e.g. numeric formatting).
    const scopedBefore: Record<string, unknown> = {};
    const scopedAfter: Record<string, unknown> = {};
    for (const key of patchKeys) {
      scopedBefore[key] = before[key];
      scopedAfter[key] = after[key];
    }
    if (schemes !== undefined) {
      scopedBefore.schemes = before.schemes;
      scopedAfter.schemes = after.schemes;
    }

    const changes = diffProject(scopedBefore, scopedAfter);

    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId,
        projectNameSnapshot: updated.projectName,
        changes,
      });
    }

    return updated;
  });

  return getProject(post.projectId);
}

export async function deleteProject(projectId: string, actor: AuditActor): Promise<void> {
  await db.transaction(async (tx) => {
    const [pre] = await tx.select().from(project).where(eq(project.projectId, projectId)).limit(1);
    if (!pre) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
    }
    const preSchemes = await fetchProjectSchemes(tx, projectId);

    // audit_log + minutes_of_meeting FKs are ON DELETE SET NULL (0002_relax_project_fks.sql);
    // Postgres handles the nulling automatically at DELETE time.
    void auditLog;
    void minutesOfMeeting;

    await recordAudit(tx, {
      actor,
      action: 'Deleted',
      projectId,
      projectNameSnapshot: pre.projectName,
      changes: diffProject(
        {
          ...(pre as unknown as Record<string, unknown>),
          schemes: preSchemes,
        },
        {},
      ),
    });

    await tx.delete(project).where(eq(project.projectId, projectId));
  });
}

export const projectIdParamSchema = z.object({ projectId: z.string().uuid() });

/**
 * Cheap access check — reads only the division_id column. Used by the
 * pdProjectGuard middleware on every `/:projectId/*` route so PDs can't
 * touch nested resources (CoS/EoT, milestones, mgmt actions, geo photos,
 * physical/milestone history) belonging to another division.
 * Returns 404 to avoid leaking existence.
 */
export async function assertPdCanAccessProject(
  projectId: string,
  pdDivisionId: number,
): Promise<void> {
  const [row] = await db
    .select({ divisionId: project.divisionId })
    .from(project)
    .where(eq(project.projectId, projectId))
    .limit(1);
  if (!row) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
  }
  if (row.divisionId !== pdDivisionId) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
  }
}

/* ============================================================
 * TENDER WORKFLOW (Tendor_Dashboard.md)
 * ============================================================ */

/**
 * Normalise sub-stage against stage on create. Runs before the DB insert
 * so we can raise a friendly 400 instead of a raw CHECK-constraint 500.
 */
function reconcileTenderStageOnCreate(fields: Partial<Project>): void {
  const stage = fields.projectStageV2 ?? null;
  if (stage === 'Tender') {
    // Auto-assign the first sub-stage if the client didn't send one.
    if (!fields.tenderSubStage) {
      fields.tenderSubStage = FIRST_TENDER_SUB_STAGE;
    }
  } else {
    // Non-Tender stage: sub-stage MUST be null. Silently drop any value
    // so a stray client payload doesn't crash the insert.
    fields.tenderSubStage = null;
  }
  // Construction/O&M can't be created directly — those stages sit at the
  // tail of the tender workflow and must be reached via the transfer flow.
  if (stage === 'Construction' || stage === 'O&M') {
    throw new HttpError(
      400,
      'TENDER_WORKFLOW_REQUIRED',
      `Cannot create a project directly in ${stage}. Start in Tender, complete the workflow, then advance.`,
    );
  }
}

/**
 * Normalise sub-stage against stage on update AND enforce Construction/O&M
 * gating (Tendor_Dashboard.md §9). Existing rows already at those stages
 * are grandfathered — the gate only fires on transitions into them.
 */
function reconcileTenderStageOnUpdate(pre: Project, patch: Partial<Project>): void {
  const nextStage =
    'projectStageV2' in patch ? patch.projectStageV2 ?? null : pre.projectStageV2 ?? null;

  // Sub-stage / stage coupling — mirror the DB CHECK constraint at the API
  // edge so callers get a 400 not a 500.
  if (nextStage === 'Tender') {
    // Coming *into* Tender or staying inside it. If the patch doesn't ship
    // a sub-stage AND the pre-image had none, seed the first one.
    if (!('tenderSubStage' in patch)) {
      if (!pre.tenderSubStage) {
        patch.tenderSubStage = FIRST_TENDER_SUB_STAGE;
      }
    } else if (!patch.tenderSubStage) {
      // Explicit null while staying in Tender is nonsensical.
      patch.tenderSubStage = FIRST_TENDER_SUB_STAGE;
    }
  } else {
    // Leaving Tender — force sub-stage to null so the coupling holds.
    patch.tenderSubStage = null;
  }

  // Construction gating. Only fires when we're actually transitioning INTO
  // Construction from something else; rows already at Construction retain
  // their value (grandfathering).
  if (
    nextStage === 'Construction' &&
    pre.projectStageV2 !== 'Construction' &&
    pre.tenderSubStage !== FINAL_TENDER_SUB_STAGE
  ) {
    throw new HttpError(
      400,
      'TENDER_WORKFLOW_INCOMPLETE',
      `Cannot move to Construction — project has not reached ${FINAL_TENDER_SUB_STAGE} in the Tender workflow.`,
    );
  }

  // O&M gating: only reachable once Construction was picked AND the
  // Execution Status is Completed. Same grandfather rule.
  if (
    nextStage === 'O&M' &&
    pre.projectStageV2 !== 'O&M' &&
    !(pre.projectStageV2 === 'Construction' && pre.status === 'Completed')
  ) {
    throw new HttpError(
      400,
      'CONSTRUCTION_INCOMPLETE',
      'Cannot move to O&M — Construction must be Completed first (Execution Status = Completed).',
    );
  }
}

export const tenderTransferSchema = z.object({
  projectIds: z.array(z.string().uuid()).min(1).max(100),
  direction: z.enum(['next', 'prev']),
});
export type TenderTransferInput = z.infer<typeof tenderTransferSchema>;

export interface TenderTransferResult {
  moved: Array<{ projectId: string; from: TenderSubStage; to: TenderSubStage }>;
  skipped: Array<{ projectId: string; reason: string }>;
}

/**
 * Bulk-advance / reverse selected projects through the tender sub-stage
 * workflow (Tendor_Dashboard.md §7). Runs inside a single transaction so
 * a mid-batch failure rolls back cleanly. Skips (rather than fails) rows
 * that can't move — the UI surfaces those in the response summary.
 */
export async function transferTenderSubStage(
  input: TenderTransferInput,
  actor: AuditActor,
  pdDivisionId: number | null = null,
): Promise<TenderTransferResult> {
  const step = input.direction === 'next' ? 1 : -1;
  const result: TenderTransferResult = { moved: [], skipped: [] };

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        projectId: project.projectId,
        projectName: project.projectName,
        divisionId: project.divisionId,
        projectStageV2: project.projectStageV2,
        tenderSubStage: project.tenderSubStage,
        nitNumber: project.nitNumber,
        nitDate: project.nitDate,
      })
      .from(project)
      .where(inArray(project.projectId, input.projectIds));

    const foundIds = new Set(rows.map((r) => r.projectId));
    for (const id of input.projectIds) {
      if (!foundIds.has(id)) {
        result.skipped.push({ projectId: id, reason: 'Project not found' });
      }
    }

    for (const row of rows) {
      if (pdDivisionId !== null && row.divisionId !== pdDivisionId) {
        // Don't leak existence to a PD — mask as "not found".
        result.skipped.push({ projectId: row.projectId, reason: 'Project not found' });
        continue;
      }
      if (row.projectStageV2 !== 'Tender') {
        result.skipped.push({
          projectId: row.projectId,
          reason: `Project is in stage ${row.projectStageV2 ?? '(none)'}; only Tender-stage projects can be transferred.`,
        });
        continue;
      }
      const current = row.tenderSubStage as TenderSubStage | null;
      if (!current) {
        result.skipped.push({ projectId: row.projectId, reason: 'Missing tender sub-stage' });
        continue;
      }
      const idx = tenderSubStages.indexOf(current);
      if (idx < 0) {
        result.skipped.push({ projectId: row.projectId, reason: 'Unknown tender sub-stage' });
        continue;
      }
      const nextIdx = idx + step;
      if (nextIdx < 0 || nextIdx >= tenderSubStages.length) {
        result.skipped.push({
          projectId: row.projectId,
          reason:
            step > 0
              ? 'Already at the final tender sub-stage'
              : 'Already at the first tender sub-stage',
        });
        continue;
      }
      // NIT gating (NIT_addition_instructions.md §2) — moving forward out of
      // NIT Published requires both NIT Number and NIT Date. Backward moves
      // don't need this since we're going upstream, not committing.
      if (step > 0 && current === 'NIT Published' && (!row.nitNumber || !row.nitDate)) {
        result.skipped.push({
          projectId: row.projectId,
          reason:
            'Please enter both NIT Number and NIT Date before transferring the project to the next Tender stage.',
        });
        continue;
      }
      const to = tenderSubStages[nextIdx] as TenderSubStage;
      await tx
        .update(project)
        .set({ tenderSubStage: to })
        .where(eq(project.projectId, row.projectId));

      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId: row.projectId,
        projectNameSnapshot: row.projectName,
        changes: [
          {
            fieldKey: 'tenderSubStage',
            fieldLabel: 'Tender sub-stage',
            beforeValue: current,
            afterValue: to,
          },
        ],
      });

      result.moved.push({ projectId: row.projectId, from: current, to });
    }
  });

  return result;
}

/* ============================================================
 * NIT DETAILS (NIT_addition_instructions.md)
 * ============================================================ */

export const updateProjectNitSchema = z.object({
  nitNumber: z.string().min(1).max(80).nullable(),
  nitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .nullable(),
});
export type UpdateProjectNitInput = z.infer<typeof updateProjectNitSchema>;

/**
 * NIT Number + NIT Date editor (Tender Dashboard → NIT Published rows).
 *
 * Enforced rules (§1, §2, §4 of the spec):
 *   - Project must be in the Tender stage AND at the NIT Published sub-stage.
 *   - Both fields may be cleared back to NULL — the transfer service checks
 *     for non-null values before allowing a step forward.
 *   - Standard PD division scoping.
 *
 * Audit-logged just like a normal update.
 */
export async function updateProjectNit(
  projectId: string,
  input: UpdateProjectNitInput,
  actor: AuditActor,
  pdDivisionId: number | null = null,
): Promise<ProjectDetail> {
  const post = await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(project)
      .where(eq(project.projectId, projectId))
      .limit(1);
    if (!pre) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
    }
    if (pdDivisionId !== null && pre.divisionId !== pdDivisionId) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
    }
    if (pre.projectStageV2 !== 'Tender' || pre.tenderSubStage !== 'NIT Published') {
      throw new HttpError(
        400,
        'NIT_STAGE_REQUIRED',
        'NIT details can only be edited while the project is at the NIT Published sub-stage.',
      );
    }

    const [updated] = await tx
      .update(project)
      .set({ nitNumber: input.nitNumber, nitDate: input.nitDate })
      .where(eq(project.projectId, projectId))
      .returning();
    if (!updated) throw new Error('project update did not return a row');

    const changes = diffProject(
      { nitNumber: pre.nitNumber, nitDate: pre.nitDate },
      { nitNumber: updated.nitNumber, nitDate: updated.nitDate },
    );
    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId,
        projectNameSnapshot: updated.projectName,
        changes,
      });
    }
    return updated;
  });

  return getProject(post.projectId);
}
