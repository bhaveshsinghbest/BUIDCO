import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { HttpError } from '../middleware/errorHandler.js';

/**
 * Composite keyset cursor: `<createdAt-iso>|<id>`. Sorting is
 * always `created_at DESC, id ASC` — the id tiebreaker makes the
 * page boundary total (no duplicates across pages when two rows
 * share a timestamp).
 */
export interface Cursor {
  createdAt: string;
  id: string;
}

const CURSOR_DELIM = '|';

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}${CURSOR_DELIM}${cursor.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new HttpError(400, 'BAD_CURSOR', 'Cursor is not valid base64url');
  }
  const idx = decoded.indexOf(CURSOR_DELIM);
  if (idx === -1) {
    throw new HttpError(400, 'BAD_CURSOR', 'Cursor is malformed');
  }
  const createdAt = decoded.slice(0, idx);
  const id = decoded.slice(idx + 1);
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) {
    throw new HttpError(400, 'BAD_CURSOR', 'Cursor is malformed');
  }
  return { createdAt, id };
}

/* ------------------------------------------------------------------ *
 * Relevance cursor
 *
 * A keyset cursor encodes the sort key, which only works when the sort
 * key is a stable, unique column. Relevance-ordered search results are
 * sorted by a COMPUTED score that is neither — many rows share a score —
 * so there is nothing to key on, and the only correct way to page a
 * ranked result set is by offset.
 *
 * It is still handed to the client as an opaque `cursor` string, so the
 * API contract and the frontend's "load more" are identical either way
 * and callers never have to know which mode produced a page.
 * ------------------------------------------------------------------ */

const OFFSET_SENTINEL = 'offset:';

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(`${OFFSET_SENTINEL}${offset}`, 'utf8').toString('base64url');
}

/**
 * Decode an offset cursor. Throws rather than falling back to 0, so a
 * keyset cursor replayed against a search request is a clear 400 instead
 * of silently restarting from the first page.
 */
export function decodeOffsetCursor(raw: string): number {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new HttpError(400, 'BAD_CURSOR', 'Cursor is not valid base64url');
  }
  if (!decoded.startsWith(OFFSET_SENTINEL)) {
    throw new HttpError(400, 'BAD_CURSOR', 'Cursor does not belong to a search result');
  }
  const offset = Number(decoded.slice(OFFSET_SENTINEL.length));
  if (!Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, 'BAD_CURSOR', 'Cursor is malformed');
  }
  return offset;
}

/* ------------------------------------------------------------------ *
 * Keyset helpers — exact timestamp precision
 *
 * Postgres keeps timestamptz to the MICROSECOND, a JS Date only to the
 * millisecond. A cursor built from `row.createdAt.toISOString()` therefore
 * sits up to 999 µs before the row it came from, and the next page's
 * `created_at < cursor` skipped every row in that same millisecond — in
 * practice every row written by the same transaction (now() is fixed per
 * transaction), so a 30-row Excel import lost 5 rows at page size 25.
 *
 * The cursor now carries the column's exact text, and the comparison casts
 * it back to timestamptz in SQL, so no precision is lost on the round trip.
 * Old millisecond cursors still parse and behave exactly as before.
 * ------------------------------------------------------------------ */

/** The column's exact value as ISO-8601 UTC text with microseconds. */
export function exactTimestamp(col: AnyPgColumn): SQL<string> {
  return sql<string>`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

/**
 * Rows strictly after the cursor in `ORDER BY ts DESC, id DESC` order.
 * `cursorTs` must come from {@link exactTimestamp} (or an older ISO cursor).
 */
export function keysetAfter(
  tsCol: AnyPgColumn,
  idCol: AnyPgColumn,
  cursorTs: string,
  cursorId: string | number,
): SQL {
  return sql`(${tsCol} < ${cursorTs}::timestamptz
              OR (${tsCol} = ${cursorTs}::timestamptz AND ${idCol} < ${cursorId}))`;
}

