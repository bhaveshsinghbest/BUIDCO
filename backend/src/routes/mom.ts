import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { actorFromReq, sessionDivisionId } from '../lib/actor.js';
import { requireProjectReader, requireWriter } from '../middleware/auth.js';
import * as service from '../services/momService.js';
import { momActionPointsRouter } from './momActionPoints.js';
import { dbId } from '../lib/ids.js';

export const momRouter = Router();

// Signed in AND "Can view projects" (S-03) — also covers the action points.
momRouter.use(...requireProjectReader);

const momIdParam = z.object({ momId: dbId });

momRouter.get('/', async (req, res, next) => {
  try {
    const q = service.listMomQuery.parse(req.query);
    res.json(await service.listMom(q, sessionDivisionId(req)));
  } catch (err) {
    next(err);
  }
});

/**
 * PD guard for /:momId and its action points: a meeting linked to a
 * project outside the PD's division answers 404, matching the project
 * routes' guard. MD/Admin/Viewer are unaffected.
 */
const pdMomGuard: RequestHandler = async (req, _res, next) => {
  try {
    const pdDiv = sessionDivisionId(req);
    if (pdDiv !== null) {
      const { momId } = momIdParam.parse(req.params);
      await service.assertPdCanAccessMom(momId, pdDiv);
    }
    next();
  } catch (err) {
    next(err);
  }
};
momRouter.use('/:momId', pdMomGuard);

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
