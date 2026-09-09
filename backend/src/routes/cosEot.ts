import { Router } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import * as service from '../services/cosEotService.js';
import { dbId } from '../lib/ids.js';

/** Mounted at /api/projects/:projectId/cos-eot — needs mergeParams so the parent's :projectId is visible. */
export const cosEotRouter = Router({ mergeParams: true });

const projectParams = z.object({ projectId: z.string().uuid() });
const idParams = projectParams.extend({ cosId: dbId });

cosEotRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = projectParams.parse(req.params);
    res.json({ items: await service.listCosEot(projectId) });
  } catch (err) {
    next(err);
  }
});

cosEotRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const { projectId } = projectParams.parse(req.params);
    const body = service.cosEotCreateSchema.parse(req.body);
    const out = await service.createCosEot(projectId, body, actorFromReq(req));
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});

cosEotRouter.patch('/:cosId', requireWriter, async (req, res, next) => {
  try {
    const { projectId, cosId } = idParams.parse(req.params);
    const body = service.cosEotUpdateSchema.parse(req.body);
    const out = await service.updateCosEot(projectId, cosId, body, actorFromReq(req));
    res.json(out);
  } catch (err) {
    next(err);
  }
});

cosEotRouter.delete('/:cosId', requireWriter, async (req, res, next) => {
  try {
    const { projectId, cosId } = idParams.parse(req.params);
    await service.deleteCosEot(projectId, cosId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
