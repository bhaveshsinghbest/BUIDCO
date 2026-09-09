import { Router } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import * as service from '../services/preMonsoonService.js';
import { dbId } from '../lib/ids.js';

export const preMonsoonRouter = Router();

preMonsoonRouter.use(requireAuth);

const idParam = z.object({ itemId: dbId });

preMonsoonRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ items: await service.listPreMonsoon() });
  } catch (err) {
    next(err);
  }
});

preMonsoonRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const body = service.preMonsoonCreateSchema.parse(req.body);
    const row = await service.createPreMonsoon(body, actorFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

preMonsoonRouter.patch('/:itemId', requireWriter, async (req, res, next) => {
  try {
    const { itemId } = idParam.parse(req.params);
    const body = service.preMonsoonUpdateSchema.parse(req.body);
    const row = await service.updatePreMonsoon(itemId, body, actorFromReq(req));
    res.json(row);
  } catch (err) {
    next(err);
  }
});

preMonsoonRouter.delete('/:itemId', requireWriter, async (req, res, next) => {
  try {
    const { itemId } = idParam.parse(req.params);
    await service.deletePreMonsoon(itemId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
