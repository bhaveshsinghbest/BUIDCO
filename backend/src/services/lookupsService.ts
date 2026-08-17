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
