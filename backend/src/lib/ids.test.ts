/**
 * Regression for the integer-overflow 500s.
 *
 * Every surrogate key here is a Postgres `integer`. An unbounded
 * `z.coerce.number().int().positive()` accepted values far beyond that
 * column's range, which then threw `value out of range` inside the query and
 * surfaced to the client as a 500 — a client input error reported as a
 * server fault. Six endpoints behaved that way.
 */
import { describe, expect, it } from 'vitest';
import { dbId, optionalDbId } from './ids.js';
import { PG_INT_MAX } from './numbers.js';

describe('dbId', () => {
  it('accepts ordinary ids', () => {
    expect(dbId.parse(1)).toBe(1);
    expect(dbId.parse('42')).toBe(42);
  });

  it('accepts exactly the Postgres integer maximum', () => {
    expect(dbId.parse(PG_INT_MAX)).toBe(2_147_483_647);
    expect(dbId.parse(String(PG_INT_MAX))).toBe(2_147_483_647);
  });

  it('rejects one past the maximum — this is the bug that caused the 500s', () => {
    expect(dbId.safeParse(PG_INT_MAX + 1).success).toBe(false);
    expect(dbId.safeParse('2147483648').success).toBe(false);
    expect(dbId.safeParse('99999999999999999999').success).toBe(false);
  });

  it('still rejects the cases it always did', () => {
    for (const bad of [0, -1, 1.5, 'abc', '', null, undefined, NaN, Infinity]) {
      expect(dbId.safeParse(bad).success, String(bad)).toBe(false);
    }
  });

  it('optionalDbId allows undefined but keeps the same bound', () => {
    expect(optionalDbId.parse(undefined)).toBeUndefined();
    expect(optionalDbId.parse('7')).toBe(7);
    expect(optionalDbId.safeParse('2147483648').success).toBe(false);
  });
});
