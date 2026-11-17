import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import {
  ALLOWED_PHOTO_TYPES,
  cleanFileName,
  deleteLocalPhoto,
  photoStorage,
  presentPhoto,
  saveLocalPhoto,
  sniffImageKind,
} from '../lib/photoStorage.js';
import { uploadLimiter } from '../lib/rateLimit.js';
import { optionalIsoDate } from '../lib/validators.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import * as service from '../services/geoPhotosService.js';
import { dbId } from '../lib/ids.js';

/**
 * Mounted at /api/projects/:projectId/geo-photos (mergeParams), behind the
 * projects router's "Can view projects" and PD-division guards.
 *
 * Photos kept on this server are returned with short-lived signed links in
 * place of their stored reference (lib/photoStorage.ts, finding S-21).
 */
export const geoPhotosRouter = Router({ mergeParams: true });

const projectParams = z.object({ projectId: z.string().uuid() });
const idParams = projectParams.extend({ photoId: dbId });

function viewerId(req: Request): number {
  return actorFromReq(req).userId ?? 0;
}

geoPhotosRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = projectParams.parse(req.params);
    const uid = viewerId(req);
    const items = await service.listGeoPhotos(projectId);
    res.json({ items: items.map((p) => presentPhoto(p, uid)) });
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

const fileQuery = z.object({
  fileName: z.string().max(300).optional(),
  caption: z.string().max(2000).optional(),
  photoDate: optionalIsoDate(),
});

/**
 * File upload to this server's own storage (PHOTO_STORAGE=local). The raw
 * image is the request body; its Content-Type must be JPEG, PNG or WebP and
 * agree with the file's actual leading bytes. Same audience as the URL
 * route above: any signed-in user who may view the project.
 */
geoPhotosRouter.post(
  '/files',
  requireAuth,
  (_req, _res, next) => {
    if (photoStorage !== 'local') {
      next(new HttpError(404, 'UPLOADS_DISABLED', 'Photo upload to this server is not enabled.'));
      return;
    }
    next();
  },
  express.raw({ type: Object.keys(ALLOWED_PHOTO_TYPES), limit: env.PHOTO_MAX_BYTES }),
  async (req, res, next) => {
    let savedRef: string | null = null;
    try {
      const { projectId } = projectParams.parse(req.params);
      const query = fileQuery.parse(req.query);
      const actor = actorFromReq(req);

      const declared = ALLOWED_PHOTO_TYPES[(req.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''];
      if (!declared || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPG, PNG or WEBP image.');
      }
      const actual = sniffImageKind(req.body);
      if (actual !== declared) {
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The file is not a valid JPG, PNG or WEBP image.');
      }

      const rl = await uploadLimiter(`upload:${actor.userId}`);
      if (!rl.success) throw new HttpError(429, 'RATE_LIMITED', 'Upload rate limit exceeded (20/minute)');

      savedRef = await saveLocalPhoto(req.body, actual);
      const row = await service.createGeoPhotoFile(
        projectId,
        {
          ref: savedRef,
          fileName: cleanFileName(query.fileName),
          caption: query.caption?.trim() || null,
          photoDate: query.photoDate ?? null,
        },
        actor,
      );
      logger.info('photos.uploaded', {
        projectId,
        photoId: row.photoId,
        bytes: req.body.length,
        type: actual,
        userId: actor.userId,
      });
      res.status(201).json(presentPhoto(row, viewerId(req)));
    } catch (err) {
      // No orphan file when the database insert fails.
      if (savedRef) await deleteLocalPhoto(savedRef);
      next(err);
    }
  },
);

geoPhotosRouter.patch('/:photoId', requireWriter, async (req, res, next) => {
  try {
    const { projectId, photoId } = idParams.parse(req.params);
    const body = service.geoPhotoUpdateSchema.parse(req.body);
    const row = await service.updateGeoPhoto(projectId, photoId, body, actorFromReq(req));
    res.json(presentPhoto(row, viewerId(req)));
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
