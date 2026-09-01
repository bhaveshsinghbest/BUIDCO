import { Router } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import * as service from '../services/fundsUcService.js';

export const fundsUcRouter = Router();

fundsUcRouter.use(requireAuth);

const idParam = z.object({ fundsUcId: z.coerce.number().int().positive() });

fundsUcRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ items: await service.listFundsUc() });
  } catch (err) {
    next(err);
  }
});

fundsUcRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const body = service.fundsUcCreateSchema.parse(req.body);
    const row = await service.createFundsUc(body, actorFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

fundsUcRouter.patch('/:fundsUcId', requireWriter, async (req, res, next) => {
  try {
    const { fundsUcId } = idParam.parse(req.params);
    const body = service.fundsUcUpdateSchema.parse(req.body);
    const row = await service.updateFundsUc(fundsUcId, body, actorFromReq(req));
    res.json(row);
  } catch (err) {
    next(err);
  }
});

fundsUcRouter.delete('/:fundsUcId', requireWriter, async (req, res, next) => {
  try {
    const { fundsUcId } = idParam.parse(req.params);
    await service.deleteFundsUc(fundsUcId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
