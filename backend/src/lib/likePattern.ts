/**
 * Escape LIKE/ILIKE metacharacters so user text is matched literally.
 *
 * Without this a search for "%" or "_" matched every project, and a lone
 * trailing backslash made Postgres reject the pattern ("LIKE pattern must
 * not end with escape character" → HTTP 500). Backslash is Postgres's
 * default LIKE escape character, so no ESCAPE clause is needed.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** `%term%` with the term escaped — a literal, case-insensitive substring match. */
export function containsPattern(term: string): string {
  return `%${escapeLike(term)}%`;
}
