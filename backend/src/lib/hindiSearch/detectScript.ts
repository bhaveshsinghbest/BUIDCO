/**
 * Script detection for search queries (bhaveshTask.md Task 4).
 *
 * Only the Devanagari block U+0900-U+097F is treated as "Hindi". That is
 * deliberately narrow: it is the range the task specifies, and widening it
 * to the Devanagari Extended block would pull in characters that never
 * appear in Hindi project names.
 */

/** Devanagari block, U+0900-U+097F. */
const DEVANAGARI_RE = /[\u0900-\u097F]/;

/** Basic Latin letters. Digits and punctuation are script-neutral. */
const LATIN_RE = /[A-Za-z]/;

export type Script =
  /** Contains Devanagari and no Latin letters. */
  | 'devanagari'
  /** Contains Latin letters and no Devanagari. */
  | 'latin'
  /** Contains both — e.g. `पटना bridge`. */
  | 'mixed'
  /** Neither: digits, punctuation, or empty. A project ID looks like this. */
  | 'neutral';

/** True when `text` contains at least one Devanagari character. */
export function hasDevanagari(text: string): boolean {
  return DEVANAGARI_RE.test(text);
}

/** True when `text` contains at least one Latin letter. */
export function hasLatin(text: string): boolean {
  return LATIN_RE.test(text);
}

/**
 * Classify a query or a single token.
 *
 * Mixed-language queries are the common case here rather than an edge case
 * (`पटना bridge`, `Patna सड़क`), so they get their own classification and
 * are expanded token by token — see expandQuery.
 */
export function detectScript(text: string): Script {
  const deva = hasDevanagari(text);
  const latin = hasLatin(text);
  if (deva && latin) return 'mixed';
  if (deva) return 'devanagari';
  if (latin) return 'latin';
  return 'neutral';
}
