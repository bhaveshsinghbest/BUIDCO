import { Router } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import * as service from '../services/momService.js';
import { momActionPointsRouter } from './momActionPoints.js';
import { dbId } from '../lib/ids.js';

export const momRouter = Router();

momRouter.use(requireAuth);

const momIdParam = z.object({ momId: dbId });

momRouter.get('/', async (req, res, next) => {
  try {
    const q = service.listMomQuery.parse(req.query);
    res.json(await service.listMom(q));
  } catch (err) {
    next(err);
  }
});

momRouter.get('/:momId', async (req, res, next) => {
  try {
    const { momId } = momIdParam.parse(req.params);
    res.json(await service.getMom(momId));
  } catch (err) {
    next(err);
  }
});

momRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const body = service.momCreateSchema.parse(req.body);
    const row = await service.createMom(body, actorFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

momRouter.patch('/:momId', requireWriter, async (req, res, next) => {
  try {
    const { momId } = momIdParam.parse(req.params);
    const body = service.momUpdateSchema.parse(req.body);
    const row = await service.updateMom(momId, body, actorFromReq(req));
    res.json(row);
  } catch (err) {
    next(err);
  }
});

momRouter.delete('/:momId', requireWriter, async (req, res, next) => {
  try {
    const { momId } = momIdParam.parse(req.params);
    await service.deleteMom(momId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

momRouter.use('/:momId/action-points', momActionPointsRouter);
