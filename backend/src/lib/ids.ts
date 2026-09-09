import { z } from 'zod';
import { PG_INT_MAX } from './numbers.js';

/**
 * Validator for a database surrogate key arriving from a URL param or query
 * string.
 *
 * The bound is the point of it. `z.coerce.number().int().positive()` happily
 * accepts 99999999999999999999 — a perfectly good JavaScript number — which
 * then reaches Postgres, overflows the `integer` column type and throws
 * `value out of range`. That surfaced to the client as a 500: a client input
 * error reported as a server fault, which reads as "retry me" to callers and
 * buries genuine faults in monitoring.
 *
 * Capping at PG_INT_MAX turns those into the 400 they always were.
 */
export const dbId = z.coerce.number().int().positive().max(PG_INT_MAX);

/** Same bound, for optional filter parameters. */
export const optionalDbId = dbId.optional();
