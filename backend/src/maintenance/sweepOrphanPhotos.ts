/**
 * Finds photo files in PHOTO_STORAGE_DIR that no geo_photo row refers to
 * any more, and with --delete removes them (finding S-21).
 *
 * Deleting a single photo or a project removes its files directly. This
 * sweep is for the remaining path: deleting a sector or scheme cascades to
 * its projects and their photo rows inside the database, which cannot
 * remove files.
 *
 * Usage on the server (NODE_ENV and the database settings as for the API):
 *   node dist/maintenance/sweepOrphanPhotos.js            # report only
 *   node dist/maintenance/sweepOrphanPhotos.js --delete   # remove them
 *
 * Safety: only files whose names have exactly the server-generated shape
 * are considered, and if the database refers to no photo files at all
 * while the directory holds some (for example, the wrong DATABASE_URL), it
 * refuses to delete unless --force is also given.
 */
import { readdir, unlink } from 'node:fs/promises';
import { like } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { geoPhoto } from '../db/schema.js';
import { env } from '../env.js';
import { localPhotoPath, storageKeyOf } from '../lib/photoStorage.js';

const GENERATED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

async function main(): Promise<void> {
  const dir = env.PHOTO_STORAGE_DIR;
  if (!dir) throw new Error('PHOTO_STORAGE_DIR is not set.');
  const remove = process.argv.includes('--delete');
  const force = process.argv.includes('--force');

  const rows = await db.select({ url: geoPhoto.url }).from(geoPhoto).where(like(geoPhoto.url, 'local:%'));
  const referenced = new Set(rows.map((r) => storageKeyOf(r.url)).filter((k): k is string => k !== null));
  const files = (await readdir(dir)).filter((name) => GENERATED_NAME.test(name));
  const orphans = files.filter((name) => !referenced.has(name));

  process.stdout.write(
    `photo files: ${files.length}, referenced by the database: ${referenced.size}, orphaned: ${orphans.length}\n`,
  );
  for (const name of orphans) process.stdout.write(`  orphan ${name}\n`);

  if (!remove || orphans.length === 0) {
    if (orphans.length > 0) process.stdout.write('Report only. Re-run with --delete to remove them.\n');
    return;
  }
  if (referenced.size === 0 && files.length > 0 && !force) {
    throw new Error(
      'The database refers to no photo files at all — check DATABASE_URL. Add --force only if that is really expected.',
    );
  }
  for (const name of orphans) {
    await unlink(localPhotoPath(name));
  }
  process.stdout.write(`removed ${orphans.length} orphaned file(s)\n`);
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
