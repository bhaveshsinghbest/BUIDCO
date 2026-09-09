import { Router } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import * as service from '../services/momService.js';
import { dbId } from '../lib/ids.js';

/** Mounted at /api/mom/:momId/action-points (mergeParams). */
export const momActionPointsRouter = Router({ mergeParams: true });

const momParams = z.object({ momId: dbId });
const idParams = momParams.extend({ actionId: dbId });

momActionPointsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { momId } = momParams.parse(req.params);
    res.json({ items: await service.listActionPoints(momId) });
  } catch (err) {
    next(err);
  }
});

momActionPointsRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const { momId } = momParams.parse(req.params);
    const body = service.actionPointCreateSchema.parse(req.body);
    const row = await service.createActionPoint(momId, body, actorFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

momActionPointsRouter.patch('/:actionId', requireWriter, async (req, res, next) => {
  try {
    const { momId, actionId } = idParams.parse(req.params);
    const body = service.actionPointUpdateSchema.parse(req.body);
    const row = await service.updateActionPoint(momId, actionId, body, actorFromReq(req));
    res.json(row);
  } catch (err) {
    next(err);
  }
});

momActionPointsRouter.delete('/:actionId', requireWriter, async (req, res, next) => {
  try {
    const { momId, actionId } = idParams.parse(req.params);
    await service.deleteActionPoint(momId, actionId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
