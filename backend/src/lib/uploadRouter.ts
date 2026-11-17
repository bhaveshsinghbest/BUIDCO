/**
 * UploadThing file router for geo-photo uploads.
 *
 * Flow:
 *   1. `requireAuth` runs in Express before the UploadThing handler so
 *      `req.user` is populated by the time `.middleware()` fires.
 *   2. `.middleware()` re-checks auth defensively, applies the per-user
 *      rate limit (20 uploads/min), and verifies the target project
 *      exists — a failure here aborts the upload before a byte leaves
 *      the browser.
 *   3. `.onUploadComplete()` runs after each file is stored on
 *      UploadThing's CDN. It inserts a geo_photo row (source_type='file')
 *      and records an audit entry, both in one Drizzle transaction.
 *
 * Restrictions match the kickoff decision: JPG/JPEG/PNG/WEBP only,
 * ≤3 MB per file, ≤6 files per upload. UploadThing's `image` category
 * accepts those MIMEs by default; the size / count guards are set below.
 */

import type { Request } from 'express';
import { z } from 'zod';
import { createUploadthing, type FileRouter } from 'uploadthing/express';
import { UploadThingError } from 'uploadthing/server';
import { db } from '../db/client.js';
import type { UserRole } from '../db/enums.js';
import { geoPhoto, project } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { recordAudit } from './audit.js';
import { diffGeoPhoto } from './auditLabels.js';
import { uploadLimiter } from './rateLimit.js';

const f = createUploadthing();

interface UploadMetadata {
  userId: number;
  username: string;
  role: UserRole;
  projectId: string;
  projectName: string;
}

const MAX_SIZE_BYTES = 3 * 1024 * 1024; // Kickoff requirement: ≤3 MB per file.
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const uploadFileRouter = {
  // UploadThing's `maxFileSize` only allows power-of-2 sizes, so we set 4MB
  // there and enforce the true 3 MB budget ourselves in .middleware() below,
  // where we also validate MIME.
  geoPhoto: f({
    image: { maxFileSize: '4MB', maxFileCount: 6 },
  })
    .input(z.object({ projectId: z.string().uuid() }))
    // Return type inferred — UploadThing wants a Record<string, unknown>-ish
    // shape; adding an explicit interface here fights its constraint.
    .middleware(async ({ req, input, files }) => {
      const r = req as Request;
      if (!r.user) {
        throw new UploadThingError('Authentication required');
      }

      for (const f of files ?? []) {
        if (f.size > MAX_SIZE_BYTES) {
          throw new UploadThingError(`File "${f.name}" exceeds the 3 MB limit`);
        }
        if (!ALLOWED_MIMES.has(f.type)) {
          throw new UploadThingError(`File "${f.name}" (${f.type}) is not JPG/PNG/WEBP`);
        }
      }

      const rl = await uploadLimiter(`upload:${r.user.userId}`);
      if (!rl.success) {
        throw new UploadThingError('Upload rate limit exceeded (20/minute)');
      }

      const [p] = await db
        .select({ projectName: project.projectName, divisionId: project.divisionId })
        .from(project)
        .where(eq(project.projectId, input.projectId))
        .limit(1);
      // A PD may only attach photos to projects of the division they signed
      // in with — the same rule (and the same "not found" answer, which does
      // not confirm the project exists) as every other project route (S-21).
      if (!p || (r.user.role === 'PD' && p.divisionId !== r.user.divisionId)) {
        throw new UploadThingError(`Project ${input.projectId} does not exist`);
      }

      const meta: UploadMetadata = {
        userId: r.user.userId,
        username: r.user.username,
        role: r.user.role,
        projectId: input.projectId,
        projectName: p.projectName,
      };
      return meta as unknown as Record<string, unknown>;
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // UploadThing carries metadata across the callback boundary as an
      // opaque record; we shaped it in .middleware() and cast it back here.
      const md = metadata as unknown as UploadMetadata;
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(geoPhoto)
          .values({
            projectId: md.projectId,
            url: file.url,
            sourceType: 'file',
            fileName: file.name,
          })
          .returning();
        if (!row) throw new Error('geo_photo insert returned no row');

        await recordAudit(tx, {
          actor: {
            userId: md.userId,
            username: md.username,
            role: md.role,
          },
          action: 'Created',
          projectId: md.projectId,
          projectNameSnapshot: md.projectName,
          changes: diffGeoPhoto({}, { table: 'geo_photo', ...row }),
        });
      });

      return {
        photoUrl: file.url,
        fileName: file.name,
      };
    }),
} satisfies FileRouter;

export type BuidcoFileRouter = typeof uploadFileRouter;
