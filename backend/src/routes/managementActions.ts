import { Router } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import * as service from '../services/managementActionService.js';
import { dbId } from '../lib/ids.js';

export const managementActionsRouter = Router({ mergeParams: true });

const projectParams = z.object({ projectId: z.string().uuid() });
const idParams = projectParams.extend({ itemId: dbId });

managementActionsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = projectParams.parse(req.params);
    res.json({ items: await service.listMgmtActions(projectId) });
  } catch (err) {
    next(err);
  }
});

managementActionsRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const { projectId } = projectParams.parse(req.params);
    const body = service.mgmtActionCreateSchema.parse(req.body);
    const row = await service.createMgmtAction(projectId, body, actorFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

managementActionsRouter.patch('/:itemId', requireWriter, async (req, res, next) => {
  try {
    const { projectId, itemId } = idParams.parse(req.params);
    const body = service.mgmtActionUpdateSchema.parse(req.body);
    const row = await service.updateMgmtAction(projectId, itemId, body, actorFromReq(req));
    res.json(row);
  } catch (err) {
    next(err);
  }
});

managementActionsRouter.delete('/:itemId', requireWriter, async (req, res, next) => {
  try {
    const { projectId, itemId } = idParams.parse(req.params);
    await service.deleteMgmtAction(projectId, itemId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
