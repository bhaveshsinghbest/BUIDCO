import { Router } from 'express';
import { createRouteHandler } from 'uploadthing/express';
import { env, isProduction } from '../env.js';
import { logger } from '../lib/logger.js';
import { ALLOWED_PHOTO_TYPES, photoStorage } from '../lib/photoStorage.js';
import { uploadFileRouter } from '../lib/uploadRouter.js';
import { requireProjectReader } from '../middleware/auth.js';

/**
 * Photo upload plumbing. Where files go is PHOTO_STORAGE (finding S-21):
 *   local        POST /api/projects/:id/geo-photos/files (routes/geoPhotos.ts)
 *   uploadthing  the UploadThing handler below
 *   off          neither; photos can still be added as links
 */
export const uploadsRouter = Router();

// Signed in AND "Can view projects", like every other project API.
uploadsRouter.use(...requireProjectReader);

/** Tells the Input Sheet which upload path to use and what it accepts. */
uploadsRouter.get('/config', (_req, res) => {
  res.json({
    storage: photoStorage,
    maxBytes: env.PHOTO_MAX_BYTES,
    allowedTypes: Object.keys(ALLOWED_PHOTO_TYPES),
  });
});

if (photoStorage === 'uploadthing' && env.UPLOADTHING_TOKEN) {
  // req.user is populated above, so .middleware() inside the file router
  // can rely on it.
  uploadsRouter.use(
    createRouteHandler({
      router: uploadFileRouter,
      config: {
        token: env.UPLOADTHING_TOKEN,
        isDev: !isProduction,
      },
    }),
  );
} else {
  logger.info('config.photo_storage', {
    storage: photoStorage,
    ...(photoStorage === 'local' ? { directoryConfigured: Boolean(env.PHOTO_STORAGE_DIR) } : {}),
  });
  uploadsRouter.all('*', (_req, res) => {
    res.status(503).json({
      error: { code: 'UPLOADS_DISABLED', message: 'UploadThing uploads are not enabled on this server' },
    });
  });
}
