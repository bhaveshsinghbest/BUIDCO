/**
 * Geo-photo file storage on the application server (finding S-21).
 *
 * With PHOTO_STORAGE=local, uploaded photos never leave the government
 * server:
 *
 *   - Validation: only JPEG, PNG and WebP, recognised from the file's own
 *     leading bytes (not the browser-supplied type or name), and at most
 *     PHOTO_MAX_BYTES. The declared Content-Type must agree with the bytes.
 *   - Storage: PHOTO_STORAGE_DIR/<random-uuid>.<ext>. The client's file name
 *     is kept only as a label in the database, never used as a path, so it
 *     cannot traverse directories or overwrite anything.
 *   - Access: the database stores "local:<file>", which is not a URL. When a
 *     signed-in user lists a project's photos (an API call that already
 *     enforces "Can view projects" and the PD division), each photo gets a
 *     link that is signed for that user and expires after 30 minutes. The
 *     file route checks the signature AND re-checks that the user is still
 *     active, may view projects and, for a PD, that the project is in one of
 *     their divisions. A copied link is useless after expiry, or at once if
 *     the account is deactivated.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env, type Env } from '../env.js';
import { logger } from './logger.js';

export type PhotoStorageMode = 'local' | 'uploadthing' | 'off';

export function resolvePhotoStorage(e: Pick<Env, 'PHOTO_STORAGE' | 'UPLOADTHING_TOKEN'>): PhotoStorageMode {
  if (e.PHOTO_STORAGE) return e.PHOTO_STORAGE;
  return e.UPLOADTHING_TOKEN ? 'uploadthing' : 'off';
}

export const photoStorage: PhotoStorageMode = resolvePhotoStorage(env);

export type ImageKind = 'jpeg' | 'png' | 'webp';

export const ALLOWED_PHOTO_TYPES: Record<string, ImageKind> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXTENSION: Record<ImageKind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The image format from the file's magic bytes, or null if it is not one we accept. */
export function sniffImageKind(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

const LOCAL_PREFIX = 'local:';
const STORAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isLocalPhotoRef(url: string): boolean {
  return url.startsWith(LOCAL_PREFIX);
}

/** The stored file name, only if it has exactly the shape we generate. */
export function storageKeyOf(ref: string): string | null {
  if (!isLocalPhotoRef(ref)) return null;
  const key = ref.slice(LOCAL_PREFIX.length);
  return STORAGE_KEY.test(key) ? key : null;
}

function storageDir(): string {
  if (!env.PHOTO_STORAGE_DIR) throw new Error('PHOTO_STORAGE_DIR is not configured');
  return env.PHOTO_STORAGE_DIR;
}

/** Startup check: with local storage the directory must exist (or be creatable) and be writable. */
export async function verifyPhotoStorage(): Promise<void> {
  if (photoStorage !== 'local') return;
  const dir = storageDir();
  await mkdir(dir, { recursive: true });
  await access(dir, fsConstants.R_OK | fsConstants.W_OK);
}

export function localPhotoPath(key: string): string {
  if (!STORAGE_KEY.test(key)) throw new Error('Invalid photo storage key');
  return join(storageDir(), key);
}

export function contentTypeOfKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1);
  return CONTENT_TYPE[ext] ?? 'application/octet-stream';
}

/** Writes the photo under a new random name; returns the reference to store. */
export async function saveLocalPhoto(data: Buffer, kind: ImageKind): Promise<string> {
  const key = `${randomUUID()}.${EXTENSION[kind]}`;
  await mkdir(storageDir(), { recursive: true });
  // "wx": never overwrite; 0o640: not world-readable.
  await writeFile(join(storageDir(), key), data, { flag: 'wx', mode: 0o640 });
  return `${LOCAL_PREFIX}${key}`;
}

export async function deleteLocalPhoto(ref: string): Promise<void> {
  const key = storageKeyOf(ref);
  if (!key) return;
  try {
    await unlink(localPhotoPath(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('photos.delete_failed', { key, errorMessage: (err as Error).message });
    }
  }
}

/** A file name safe to keep as a label: no path, no control characters. */
export function cleanFileName(raw: string | undefined): string | null {
  if (!raw) return null;
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|]/g, '').trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : null;
}

/* ------------------------------------------------------------------ */
/* Signed links                                                        */
/* ------------------------------------------------------------------ */

export const PHOTO_LINK_TTL_SECONDS = 30 * 60;

/** A key used only for photo links, derived so it is never the JWT key itself. */
function linkKey(): Buffer {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update('buidco/geo-photo-link/v1').digest();
}

function signature(photoId: number, userId: number, exp: number): Buffer {
  return createHmac('sha256', linkKey()).update(`${photoId}.${userId}.${exp}`).digest();
}

/** A same-origin link to the photo file, valid for one user for 30 minutes. */
export function signPhotoLink(photoId: number, userId: number, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + PHOTO_LINK_TTL_SECONDS;
  const sig = signature(photoId, userId, exp).toString('base64url');
  return `/api/photo-files/${photoId}?u=${userId}&exp=${exp}&sig=${sig}`;
}

export function verifyPhotoLink(
  photoId: number,
  userId: number,
  exp: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (!Number.isInteger(exp) || exp * 1000 <= now) return false;
  const expected = signature(photoId, userId, exp);
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The row as the client sees it: stored references become signed links. */
export function presentPhoto<T extends { photoId: number; url: string }>(row: T, viewerUserId: number): T {
  return isLocalPhotoRef(row.url) ? { ...row, url: signPhotoLink(row.photoId, viewerUserId) } : row;
}
