/**
 * Drizzle's `numeric` column type returns strings to avoid IEEE 754
 * precision loss on wide amounts. The frontend needs numbers (charts,
 * math, formatting), so services convert at the response boundary via
 * these helpers.
 */

export function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toNumberOrZero(value: string | number | null | undefined): number {
  return toNumberOrNull(value) ?? 0;
}

/**
 * Largest value a Postgres `integer` column can hold.
 *
 * Every surrogate key in this schema is `serial`/`integer`, so anything above
 * this is not merely "not found" — it cannot be stored at all.
 */
export const PG_INT_MAX = 2_147_483_647;
