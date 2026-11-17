/**
 * Shared request validators.
 *
 * Every rule here closes a gap where a value passed Zod but was then
 * rejected by Postgres, which surfaced as an HTTP 500 (or, for URLs, was
 * stored and later rendered as a clickable link).
 */

import { z } from 'zod';
import { isIsoCalendarDate } from './fundsUc.js';

/**
 * A real calendar date as YYYY-MM-DD. The shape regex alone let
 * "2026-02-31" or "2026-13-01" through to Postgres, which rejected them
 * with "date/time field value out of range" — an HTTP 500.
 */
export const isoDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .refine(isIsoCalendarDate, 'Not a valid calendar date');

/** The optional, nullable form most write schemas use. */
export const optionalIsoDate = () => isoDate().nullable().optional();

/**
 * An http(s) link. `z.string().url()` also accepts `javascript:`, `data:`
 * and `vbscript:` URLs, and the UI renders these values as clickable
 * links, so anything but http(s) is refused at the API edge.
 */
export const httpUrl = (max: number) =>
  z
    .string()
    .url()
    .max(max)
    .refine((u) => /^https?:\/\//i.test(u), 'Only http:// or https:// links are allowed');

/** Largest value a numeric(12,2) ₹ Cr column can hold. */
export const MAX_CR_AMOUNT = 9_999_999_999.99;
