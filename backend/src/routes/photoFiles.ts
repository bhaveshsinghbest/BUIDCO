import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { userDivision } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import {
  contentTypeOfKey,
  localPhotoPath,
  photoStorage,
  storageKeyOf,
  verifyPhotoLink,
} from '../lib/photoStorage.js';
import { getUserById, isDemoLoginBlocked } from '../services/authService.js';
import { getGeoPhotoFileTarget } from '../services/geoPhotosService.js';

/**
 * GET /api/photo-files/:photoId?u=&exp=&sig= — a photo kept on this server
 * (PHOTO_STORAGE=local, finding S-21).
 *
 * An <img> tag cannot send the bearer token, so access rides on the signed
 * link instead: it names the user it was issued to and expires after 30
 * minutes. On every request the route verifies the signature and expiry,
 * then re-checks that user's access — still active, may view projects, and
 * for a PD, that the project is in one of their divisions — so a link stops
 * working the moment the account loses access.
 *
 * Every refusal is the same 404, revealing nothing about which check failed.
 */
export const photoFilesRouter = Router();

const params = z.object({ photoId: z.coerce.number().int().positive() });
const query = z.object({
  u: z.coerce.number().int().positive(),
  exp: z.coerce.number().int().positive(),
  sig: z.string().min(16).max(128),
});

function notFound(res: import('express').Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Photo not found' } });
}

photoFilesRouter.get('/:photoId', async (req, res, next) => {
  try {
    if (photoStorage !== 'local') return notFound(res);
    const p = params.safeParse(req.params);
    const q = query.safeParse(req.query);
    if (!p.success || !q.success) return notFound(res);
    const { photoId } = p.data;
    const { u: userId, exp, sig } = q.data;

    if (!verifyPhotoLink(photoId, userId, exp, sig)) return notFound(res);

    const user = await getUserById(userId);
    if (!user || isDemoLoginBlocked(user.username)) return notFound(res);
    if (user.role !== 'MD' && !user.canViewProjects) return notFound(res);

    const target = await getGeoPhotoFileTarget(photoId);
    const key = target ? storageKeyOf(target.url) : null;
    if (!target || !key) return notFound(res);

    if (user.role === 'PD') {
      const divisions = await db
        .select({ divisionId: userDivision.divisionId })
        .from(userDivision)
        .where(eq(userDivision.userId, userId));
      if (!divisions.some((d) => d.divisionId === target.divisionId)) return notFound(res);
    }

    const path = localPhotoPath(key);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      logger.warn('photos.file_missing', { photoId });
      return notFound(res);
    }

    const secondsLeft = Math.max(0, exp - Math.floor(Date.now() / 1000));
    res.setHeader('Content-Type', contentTypeOfKey(key));
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `inline; filename="photo-${photoId}${key.slice(key.lastIndexOf('.'))}"`);
    res.setHeader('Cache-Control', `private, max-age=${secondsLeft}`);
    createReadStream(path)
      .on('error', (err) => next(err))
      .pipe(res);
  } catch (err) {
    next(err);
  }
});
