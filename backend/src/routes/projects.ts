import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { actorFromReq, sessionDivisionId } from '../lib/actor.js';
import * as kpi from '../lib/kpi.js';
import { createProjectSchema, importProjectsSchema, updateProjectSchema } from '../lib/projectFields.js';
import {
  requireProjectCreate,
  requireProjectDelete,
  requireProjectReader,
  requireProjectUpdate,
} from '../middleware/auth.js';
import {
  assertPdCanAccessProject,
  createProject,
  createProjectsBulk,
  deleteProject,
  getProject,
  listProjects,
  listProjectsQuery,
  tenderTransferSchema,
  transferTenderSubStage,
  updateProject,
  updateProjectNit,
  updateProjectNitSchema,
} from '../services/projectsService.js';
import { cosEotRouter } from './cosEot.js';
import { geoPhotosRouter } from './geoPhotos.js';
import { managementActionsRouter } from './managementActions.js';
import { milestonesRouter } from './milestones.js';

export const projectsRouter = Router();

// Signed in AND "Can view projects" (S-03) — covers every nested router below.
projectsRouter.use(...requireProjectReader);

const projectIdParam = z.object({ projectId: z.string().uuid() });

/**
 * Phase C2 — for PDs, verify the :projectId in the URL belongs to their
 * session's division before letting the request touch the row or any of
 * its child resources (CoS/EoT, management actions, milestones, geo photos,
 * physical/milestone history). Returns 404 (not 403) to avoid leaking
 * existence of projects in other divisions.
 */
const pdProjectGuard: RequestHandler = async (req, _res, next) => {
  try {
    const pdDiv = sessionDivisionId(req);
    if (pdDiv !== null) {
      const { projectId } = projectIdParam.parse(req.params);
      await assertPdCanAccessProject(projectId, pdDiv);
    }
    next();
  } catch (err) {
    next(err);
  }
};

/* ---------- reads ---------- */

projectsRouter.get('/', async (req, res, next) => {
  try {
    const q = listProjectsQuery.parse(req.query);
    res.json(await listProjects(q, sessionDivisionId(req)));
  } catch (err) {
    next(err);
  }
});

/**
 * Tender_Dashboard.md §7 — bulk-transfer selected projects one sub-stage
 * forward or backward. Guarded by requireProjectUpdate (matches per-project
 * PATCH). PDs get division-filtered results inside the service. Registered
 * *before* the `/:projectId` PD guard so this literal path isn't parsed as
 * a UUID.
 */
projectsRouter.post('/tender-transfer', requireProjectUpdate, async (req, res, next) => {
  try {
    const body = tenderTransferSchema.parse(req.body);
    const out = await transferTenderSubStage(
      body,
      actorFromReq(req),
      sessionDivisionId(req),
    );
    res.json(out);
  } catch (err) {
    next(err);
  }
});

/**
 * Task 3 (bhaveshTask.md) — Import Project. Body is already
 * mapped/name-resolved client-side from the uploaded Excel file into the
 * same shape as a manual Create Project; re-validated here with the exact
 * same schema (defense in depth) and inserted as one all-or-nothing
 * transaction so a bad row can't leave a partial batch behind. Registered
 * *before* the `/:projectId` PD guard so this literal path isn't parsed as
 * a UUID (same reasoning as `/tender-transfer` above).
 */
projectsRouter.post('/import', requireProjectCreate, async (req, res, next) => {
  try {
    const body = importProjectsSchema.parse(req.body);
    const out = await createProjectsBulk(body.items, actorFromReq(req), sessionDivisionId(req));
    res.status(201).json({ items: out });
  } catch (err) {
    next(err);
  }
});

// PD access guard for every /:projectId/* route (detail + sub-resources).
projectsRouter.use('/:projectId', pdProjectGuard);

projectsRouter.get('/:projectId', async (req, res, next) => {
  try {
    const { projectId } = projectIdParam.parse(req.params);
    res.json(await getProject(projectId, sessionDivisionId(req)));
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/:projectId/physical-history', async (req, res, next) => {
  try {
    const { projectId } = projectIdParam.parse(req.params);
    res.json({ items: await kpi.getProjectPhysicalHistory(projectId) });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/:projectId/milestone-history', async (req, res, next) => {
  try {
    const { projectId } = projectIdParam.parse(req.params);
    res.json({ items: await kpi.getProjectMilestoneHistory(projectId) });
  } catch (err) {
    next(err);
  }
});

/* ---------- writes ---------- */

projectsRouter.post('/', requireProjectCreate, async (req, res, next) => {
  try {
    const body = createProjectSchema.parse(req.body);
    const out = await createProject(body, actorFromReq(req), sessionDivisionId(req));
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch('/:projectId', requireProjectUpdate, async (req, res, next) => {
  try {
    const { projectId } = projectIdParam.parse(req.params);
    const body = updateProjectSchema.parse(req.body);
    const out = await updateProject(projectId, body, actorFromReq(req), sessionDivisionId(req));
    res.json(out);
  } catch (err) {
    next(err);
  }
});

/**
 * NIT_addition_instructions.md §1/§4 — dedicated NIT editor. Guarded by
 * requireProjectUpdate and further validated in the service (project must
 * be at Tender / NIT Published sub-stage).
 */
projectsRouter.patch('/:projectId/nit', requireProjectUpdate, async (req, res, next) => {
  try {
    const { projectId } = projectIdParam.parse(req.params);
    const body = updateProjectNitSchema.parse(req.body);
    const out = await updateProjectNit(projectId, body, actorFromReq(req), sessionDivisionId(req));
    res.json(out);
  } catch (err) {
    next(err);
  }
});

projectsRouter.delete('/:projectId', requireProjectDelete, async (req, res, next) => {
  try {
    const { projectId } = projectIdParam.parse(req.params);
    await deleteProject(projectId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ---------- nested resources ---------- */

projectsRouter.use('/:projectId/cos-eot', cosEotRouter);
projectsRouter.use('/:projectId/management-actions', managementActionsRouter);
projectsRouter.use('/:projectId/milestones', milestonesRouter);
projectsRouter.use('/:projectId/geo-photos', geoPhotosRouter);
