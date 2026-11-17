/**
 * Geo photos — URL-source path only for now.
 *
 * File-source upload arrives in sub-batch 4 via UploadThing: the same
 * `geo_photo` row schema is written, just with source_type='file' plus
 * the CDN URL + original file_name. The distinction is enforced by the
 * schema's CHECK constraint on source_type.
 *
 * RBAC: creation is Viewer+ (the RBAC matrix explicitly allows Viewer
 * to upload geo photos). Edit and delete require Admin/MD.
 */

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { httpUrl, optionalIsoDate } from '../lib/validators.js';
import { db } from '../db/client.js';
import { geoPhoto, project } from '../db/schema.js';
import type { GeoPhoto } from '../db/schema.js';
import { recordAudit, type AuditActor } from '../lib/audit.js';
import { diffGeoPhoto } from '../lib/auditLabels.js';
import { deleteLocalPhoto, isLocalPhotoRef } from '../lib/photoStorage.js';
import { HttpError } from '../middleware/errorHandler.js';

const dateField = optionalIsoDate;

export const geoPhotoUrlCreateSchema = z.object({
  url: httpUrl(2000),
  caption: z.string().max(2000).nullable().optional(),
  photoDate: dateField(),
});

export const geoPhotoUpdateSchema = z.object({
  caption: z.string().max(2000).nullable().optional(),
  photoDate: dateField(),
});

export type GeoPhotoUrlCreateInput = z.infer<typeof geoPhotoUrlCreateSchema>;
export type GeoPhotoUpdateInput = z.infer<typeof geoPhotoUpdateSchema>;

async function loadProjectName(projectId: string): Promise<string> {
  const [p] = await db
    .select({ projectName: project.projectName })
    .from(project)
    .where(eq(project.projectId, projectId))
    .limit(1);
  if (!p) throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project ${projectId} does not exist`);
  return p.projectName;
}

export async function listGeoPhotos(projectId: string): Promise<GeoPhoto[]> {
  return db
    .select()
    .from(geoPhoto)
    .where(eq(geoPhoto.projectId, projectId))
    .orderBy(desc(geoPhoto.photoDate), desc(geoPhoto.photoId));
}

export async function createGeoPhotoUrl(
  projectId: string,
  input: GeoPhotoUrlCreateInput,
  actor: AuditActor,
): Promise<GeoPhoto> {
  const projectName = await loadProjectName(projectId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(geoPhoto)
      .values({
        projectId,
        url: input.url,
        caption: input.caption ?? null,
        photoDate: input.photoDate ?? null,
        sourceType: 'url',
        fileName: null,
      })
      .returning();
    if (!row) throw new Error('geo_photo insert returned no row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId,
      projectNameSnapshot: projectName,
      changes: diffGeoPhoto({}, { table: 'geo_photo', ...row }),
    });
    return row;
  });
}

export interface GeoPhotoFileInput {
  /** "local:<file>" from photoStorage.saveLocalPhoto. */
  ref: string;
  fileName: string | null;
  caption: string | null;
  photoDate: string | null;
}

/** Records a photo file already saved on this server (PHOTO_STORAGE=local, S-21). */
export async function createGeoPhotoFile(
  projectId: string,
  input: GeoPhotoFileInput,
  actor: AuditActor,
): Promise<GeoPhoto> {
  const projectName = await loadProjectName(projectId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(geoPhoto)
      .values({
        projectId,
        url: input.ref,
        caption: input.caption,
        photoDate: input.photoDate,
        sourceType: 'file',
        fileName: input.fileName,
      })
      .returning();
    if (!row) throw new Error('geo_photo insert returned no row');

    await recordAudit(tx, {
      actor,
      action: 'Created',
      projectId,
      projectNameSnapshot: projectName,
      changes: diffGeoPhoto({}, { table: 'geo_photo', ...row }),
    });
    return row;
  });
}

/** What the signed file route needs: the stored reference and the project's division. */
export async function getGeoPhotoFileTarget(
  photoId: number,
): Promise<{ url: string; divisionId: number | null } | null> {
  const [row] = await db
    .select({ url: geoPhoto.url, divisionId: project.divisionId })
    .from(geoPhoto)
    .innerJoin(project, eq(project.projectId, geoPhoto.projectId))
    .where(eq(geoPhoto.photoId, photoId))
    .limit(1);
  return row ?? null;
}

export async function updateGeoPhoto(
  projectId: string,
  photoId: number,
  input: GeoPhotoUpdateInput,
  actor: AuditActor,
): Promise<GeoPhoto> {
  const projectName = await loadProjectName(projectId);
  const patchKeys = Object.keys(input);

  return db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(geoPhoto)
      .where(and(eq(geoPhoto.photoId, photoId), eq(geoPhoto.projectId, projectId)))
      .limit(1);
    if (!pre) throw new HttpError(404, 'GEO_PHOTO_NOT_FOUND', `Photo ${photoId} not found on project ${projectId}`);

    let post = pre;
    if (patchKeys.length > 0) {
      const [next] = await tx
        .update(geoPhoto)
        .set(input)
        .where(eq(geoPhoto.photoId, photoId))
        .returning();
      if (!next) throw new Error('geo_photo update returned no row');
      post = next;
    }

    const before: Record<string, unknown> = { table: 'geo_photo', photoId };
    const after: Record<string, unknown> = { table: 'geo_photo', photoId };
    for (const k of patchKeys) {
      before[k] = (pre as Record<string, unknown>)[k];
      after[k] = (post as Record<string, unknown>)[k];
    }
    const changes = diffGeoPhoto(before, after);
    if (changes.length > 0) {
      await recordAudit(tx, {
        actor,
        action: 'Updated',
        projectId,
        projectNameSnapshot: projectName,
        changes,
      });
    }
    return post;
  });
}

export async function deleteGeoPhoto(
  projectId: string,
  photoId: number,
  actor: AuditActor,
): Promise<void> {
  const projectName = await loadProjectName(projectId);

  // Widened explicitly: TypeScript does not track the assignment inside the callback.
  let deletedRef = null as string | null;
  await db.transaction(async (tx) => {
    const [pre] = await tx
      .select()
      .from(geoPhoto)
      .where(and(eq(geoPhoto.photoId, photoId), eq(geoPhoto.projectId, projectId)))
      .limit(1);
    if (!pre) throw new HttpError(404, 'GEO_PHOTO_NOT_FOUND', `Photo ${photoId} not found on project ${projectId}`);

    await recordAudit(tx, {
      actor,
      action: 'Deleted',
      projectId,
      projectNameSnapshot: projectName,
      changes: diffGeoPhoto({ table: 'geo_photo', ...pre }, {}),
    });
    await tx.delete(geoPhoto).where(eq(geoPhoto.photoId, photoId));
    deletedRef = pre.url;
  });
  // A file kept on this server goes with its row (after the commit, so a
  // rolled-back delete never loses the file).
  if (deletedRef !== null && isLocalPhotoRef(deletedRef)) {
    await deleteLocalPhoto(deletedRef);
  }
}
