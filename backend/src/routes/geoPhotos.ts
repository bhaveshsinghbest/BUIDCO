import { Router } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import * as service from '../services/geoPhotosService.js';
import { dbId } from '../lib/ids.js';

/** Mounted at /api/projects/:projectId/geo-photos (mergeParams). */
export const geoPhotosRouter = Router({ mergeParams: true });

const projectParams = z.object({ projectId: z.string().uuid() });
const idParams = projectParams.extend({ photoId: dbId });

geoPhotosRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = projectParams.parse(req.params);
    res.json({ items: await service.listGeoPhotos(projectId) });
  } catch (err) {
    next(err);
  }
});

// URL-source create: any authenticated user (Viewer allowed per RBAC matrix).
geoPhotosRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = projectParams.parse(req.params);
    const body = service.geoPhotoUrlCreateSchema.parse(req.body);
    const row = await service.createGeoPhotoUrl(projectId, body, actorFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

geoPhotosRouter.patch('/:photoId', requireWriter, async (req, res, next) => {
  try {
    const { projectId, photoId } = idParams.parse(req.params);
    const body = service.geoPhotoUpdateSchema.parse(req.body);
    const row = await service.updateGeoPhoto(projectId, photoId, body, actorFromReq(req));
    res.json(row);
  } catch (err) {
    next(err);
  }
});

geoPhotosRouter.delete('/:photoId', requireWriter, async (req, res, next) => {
  try {
    const { projectId, photoId } = idParams.parse(req.params);
    await service.deleteGeoPhoto(projectId, photoId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
