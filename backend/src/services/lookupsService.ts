import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { district, division, region, scheme, sector } from '../db/schema.js';
import { HttpError } from '../middleware/errorHandler.js';

export interface LookupsResponse {
  districts: Array<{ districtId: number; districtName: string }>;
  sectors: Array<{ sectorId: number; sectorName: string }>;
  schemes: Array<{ schemeId: number; schemeName: string }>;
  regions: Array<{ regionId: number; regionName: string }>;
  divisions: Array<{ divisionId: number; divisionName: string; regionId: number }>;
}

export async function getLookups(): Promise<LookupsResponse> {
  const [districts, sectors, schemes, regions, divisions] = await Promise.all([
    db.select().from(district).orderBy(district.districtName),
    db.select().from(sector).orderBy(sector.sectorName),
    db.select().from(scheme).orderBy(scheme.schemeName),
    db.select().from(region).orderBy(region.regionName),
    db.select().from(division).orderBy(division.divisionName),
  ]);
  return { districts, sectors, schemes, regions, divisions };
}

/**
 * Task 5 (bhaveshTask.md) — new sectors are rare, MD/Admin-only additions
 * (Sector is a Fixed Input field), so a simple case-insensitive duplicate
 * check is enough; the column's own UNIQUE constraint is the backstop.
 */
export async function createSector(sectorName: string): Promise<{ sectorId: number; sectorName: string }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(sector)
      .where(sql`lower(${sector.sectorName}) = lower(${sectorName})`)
      .limit(1);
    if (existing) {
      throw new HttpError(409, 'SECTOR_EXISTS', `Sector "${sectorName}" already exists`);
    }
    const [row] = await tx.insert(sector).values({ sectorName }).returning();
    if (!row) throw new Error('sector insert did not return a row');
    return row;
  });
}

/** Task 4 (bhaveshTask.md) — same reasoning as createSector above. */
export async function createScheme(schemeName: string): Promise<{ schemeId: number; schemeName: string }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(scheme)
      .where(sql`lower(${scheme.schemeName}) = lower(${schemeName})`)
      .limit(1);
    if (existing) {
      throw new HttpError(409, 'SCHEME_EXISTS', `Scheme "${schemeName}" already exists`);
    }
    const [row] = await tx.insert(scheme).values({ schemeName }).returning();
    if (!row) throw new Error('scheme insert did not return a row');
    return row;
  });
}

/* ── Permanent deletion (bhaveshTask.md Task 3) ─────────────────────────
 *
 * Both deletes run in a single transaction and lean on the FK rules already
 * in the schema rather than re-implementing them:
 *
 *   project ← cos_eot_item / geo_photo / management_action_item /
 *             milestone_progress / project_funds_uc / project_milestone /
 *             project_scheme          ON DELETE CASCADE
 *   project ← audit_log / minutes_of_meeting   ON DELETE SET NULL
 *
 * So removing a project takes its dependent records with it while the audit
 * trail and any meeting minutes survive with a null project reference — the
 * record of what happened outlives the row, which is what you want from an
 * irreversible action.
 *
 * `scheme ← project_scheme` and `sector ← project` are both NO ACTION, so
 * the ordering below is load-bearing, not incidental.
 */

export interface DeleteImpact {
  /** Projects removed outright. */
  projectsDeleted: number;
  /** Projects kept but unlinked, because they also belong elsewhere. */
  projectsUnlinked: number;
}

/**
 * Delete a sector and every project in it.
 *
 * A project has exactly one sector, so there is no ambiguity here: every
 * project carrying this sector_id goes.
 */
export async function deleteSector(sectorId: number): Promise<DeleteImpact> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(sector).where(sql`${sector.sectorId} = ${sectorId}`);
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Sector not found');

    const deleted = await tx.execute(
      sql`DELETE FROM project WHERE sector_id = ${sectorId} RETURNING project_id`,
    );
    await tx.execute(sql`DELETE FROM sector WHERE sector_id = ${sectorId}`);

    return {
      projectsDeleted: (deleted as unknown as { rows: unknown[] }).rows.length,
      projectsUnlinked: 0,
    };
  });
}

/**
 * Delete a scheme and the projects that belong to it.
 *
 * Schemes are many-to-many with projects, so "projects associated with this
 * scheme" splits in two and the task's own rule — that deleting one scheme
 * must not affect projects belonging to others — decides the split:
 *
 *   - a project whose ONLY scheme is this one is deleted;
 *   - a project that also sits in another scheme is kept and merely
 *     unlinked, because deleting it would silently destroy data belonging
 *     to a scheme the user never named.
 *
 * The counts come back so the UI can say exactly what happened.
 */
export async function deleteScheme(schemeId: number): Promise<DeleteImpact> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(scheme).where(sql`${scheme.schemeId} = ${schemeId}`);
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Scheme not found');

    // Exclusive members first — their project_scheme rows go with them.
    const deleted = await tx.execute(sql`
      DELETE FROM project
      WHERE project_id IN (
        SELECT ps.project_id
        FROM project_scheme ps
        WHERE ps.scheme_id = ${schemeId}
          AND NOT EXISTS (
            SELECT 1 FROM project_scheme other
            WHERE other.project_id = ps.project_id AND other.scheme_id <> ${schemeId}
          )
      )
      RETURNING project_id
    `);

    // Whatever links remain belong to projects that survive.
    const unlinked = await tx.execute(
      sql`DELETE FROM project_scheme WHERE scheme_id = ${schemeId} RETURNING project_id`,
    );

    await tx.execute(sql`DELETE FROM scheme WHERE scheme_id = ${schemeId}`);

    return {
      projectsDeleted: (deleted as unknown as { rows: unknown[] }).rows.length,
      projectsUnlinked: (unlinked as unknown as { rows: unknown[] }).rows.length,
    };
  });
}
