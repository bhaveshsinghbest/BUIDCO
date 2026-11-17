/**
 * hindiSearch — Hindi / Hinglish / English query understanding for the
 * project search (bhaveshTask.md Tasks 4-9).
 *
 * Kept as a self-contained, reusable utility (Task 9) so the SQL layer does
 * no language processing and this module does no SQL. Everything it returns
 * is plain data; callers bind it as query parameters, which is what keeps
 * the existing injection safety intact.
 *
 * Adding a synonym means editing searchSynonyms.json only — see its _README.
 */
export { detectScript, hasDevanagari, hasLatin, type Script } from './detectScript.js';
export { transliterate } from './transliterate.js';
export {
  dictionaryEntryCount,
  lookup,
  maxPhraseWords,
  normalizeKey,
  synonymIndex,
} from './dictionary.js';
export {
  expandQuery,
  ORIGIN_RANK,
  type ExpandedGroup,
  type ExpandedQuery,
  type ExpandedTerm,
  type TermOrigin,
} from './expandQuery.js';
