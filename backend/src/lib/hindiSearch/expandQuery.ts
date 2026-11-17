/**
 * Query expansion: one raw search string -> ranked English search terms
 * (bhaveshTask.md Tasks 4, 5, 6, 8).
 *
 * Order of attack per token, cheapest and most reliable first:
 *   1. dictionary phrase match (longest first) -> tier `synonym`
 *   2. dictionary single-word match            -> tier `synonym`
 *   3. transliteration, Devanagari only        -> tier `translit`
 *   4. the token as typed                      -> tier `exact`
 *
 * Transliteration runs ONLY when the dictionary has nothing for that token
 * (Task 6: "use transliterated terms ... when dictionary matches are
 * unavailable"), because its output is phonetic rather than conventional —
 * see transliterate.ts.
 *
 * ## Why groups, and not one flat list of terms
 *
 * The terms of a multi-word query are NOT interchangeable. `पटना जल निकासी`
 * must mean "drainage projects IN Patna", so the Patna terms and the
 * drainage terms have to be combined with AND. Within one token, though,
 * the alternatives are interchangeable — `जल निकासी` may match "drainage"
 * or "nikasi", either will do, so those are combined with OR.
 *
 * Hence one `ExpandedGroup` per token or phrase: OR inside a group, AND
 * across groups. Flattening everything into a single OR looks simpler and
 * is wrong — it turns an intersection into a union and returns Patna
 * projects that have nothing to do with drainage.
 *
 * `rawTerm` is kept apart from the groups as a top-level alternative, so a
 * query that is literally a project name still matches it as one string:
 *   match(rawTerm) OR (group1 AND group2 AND ...)
 */
import { hasDevanagari } from './detectScript.js';
import { lookup, maxPhraseWords, normalizeKey } from './dictionary.js';
import { transliterate } from './transliterate.js';

/** Where a term came from. Lower tier = better match. */
export type TermOrigin = 'exact' | 'synonym' | 'translit';

/** Relevance tier per origin — consumed by the SQL CASE in projectsService. */
export const ORIGIN_RANK: Readonly<Record<TermOrigin, number>> = {
  exact: 0,
  synonym: 1,
  translit: 2,
};

export interface ExpandedTerm {
  /** The string to match with ILIKE. */
  term: string;
  origin: TermOrigin;
}

/** Interchangeable alternatives for ONE token or phrase. Combined with OR. */
export interface ExpandedGroup {
  /** The token or phrase as the user typed it, for diagnostics. */
  source: string;
  terms: ExpandedTerm[];
}

export interface ExpandedQuery {
  /** Whitespace-normalised original, preserved per Task 6. */
  raw: string;
  /** The whole query as one string — an alternative to the groups. */
  rawTerm: ExpandedTerm;
  /** One group per meaningful token or phrase. Combined with AND. */
  groups: ExpandedGroup[];
  /** Flattened, deduped view of every term — diagnostics and tests. */
  terms: ExpandedTerm[];
  /** True when at least one token resolved through the dictionary. */
  usedDictionary: boolean;
  /** True when at least one token fell through to transliteration. */
  usedTransliteration: boolean;
}

/**
 * Upper bound on terms per group. A single token cannot explode the query:
 * transliteration caps its own candidates, and no dictionary entry has
 * anywhere near this many English targets.
 */
const MAX_TERMS_PER_GROUP = 18;

/** Guards against a pathological query building an unbounded AND chain. */
const MAX_GROUPS = 8;

/** Single-character tokens match nearly everything; they are not useful. */
const MIN_TOKEN_LENGTH = 2;

/** Add a term to a group, keeping the strongest origin for duplicates. */
function pushTerm(into: Map<string, TermOrigin>, term: string, origin: TermOrigin): void {
  const cleaned = term.replace(/\s+/g, ' ').trim();
  if (cleaned === '') return;
  const key = cleaned.toLowerCase();
  const existing = into.get(key);
  if (existing === undefined || ORIGIN_RANK[origin] < ORIGIN_RANK[existing]) {
    into.set(key, origin);
  }
}

function toTerms(map: Map<string, TermOrigin>): ExpandedTerm[] {
  return [...map.entries()]
    .map(([term, origin]) => ({ term, origin }))
    .sort((a, b) => ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin] || a.term.localeCompare(b.term))
    .slice(0, MAX_TERMS_PER_GROUP);
}

export function expandQuery(rawInput: string): ExpandedQuery {
  const raw = rawInput.replace(/\s+/g, ' ').trim();
  const rawTerm: ExpandedTerm = { term: raw, origin: 'exact' };

  if (raw === '') {
    return {
      raw,
      rawTerm,
      groups: [],
      terms: [],
      usedDictionary: false,
      usedTransliteration: false,
    };
  }

  const tokens = normalizeKey(raw).split(' ').filter((t) => t !== '');
  const consumed = new Array<boolean>(tokens.length).fill(false);
  /** Group per start index, so groups keep the order the user typed them. */
  const groupAt = new Map<number, ExpandedGroup>();

  let usedDictionary = false;
  let usedTransliteration = false;

  // 1. Phrase pass, longest window first, so "jal nikasi" wins over "jal".
  //    Multi-word dictionary keys would otherwise be unreachable.
  const widest = Math.min(maxPhraseWords, tokens.length);
  for (let size = widest; size >= 2; size -= 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      let overlaps = false;
      for (let i = start; i < start + size; i += 1) {
        if (consumed[i] === true) overlaps = true;
      }
      if (overlaps) continue;

      const phrase = tokens.slice(start, start + size).join(' ');
      const hit = lookup(phrase);
      if (hit === undefined) continue;

      const map = new Map<string, TermOrigin>();
      for (const term of hit) pushTerm(map, term, 'synonym');
      // The phrase as typed is also worth matching: it may be English
      // already ("water supply"), in which case this is the exact tier.
      pushTerm(map, phrase, 'exact');
      groupAt.set(start, { source: phrase, terms: toTerms(map) });

      usedDictionary = true;
      for (let i = start; i < start + size; i += 1) consumed[i] = true;
    }
  }

  // 2. Remaining tokens, independently — Task 8 requires each word of a
  //    mixed-language query to be processed on its own, so `पटना bridge`
  //    expands both halves instead of failing as a whole.
  for (let i = 0; i < tokens.length; i += 1) {
    if (consumed[i] === true) continue;
    const token = tokens[i];
    if (token === undefined || token.length < MIN_TOKEN_LENGTH) continue;

    const map = new Map<string, TermOrigin>();
    const hit = lookup(token);

    if (hit !== undefined) {
      for (const term of hit) pushTerm(map, term, 'synonym');
      usedDictionary = true;
      // An English token is both a dictionary key and a stored value, so it
      // keeps its exact tier; a Devanagari one is preserved per Task 6.
      pushTerm(map, token, 'exact');
    } else if (hasDevanagari(token)) {
      // Preserve the original alongside the transliteration (Task 6) — it is
      // the only thing that can match a row whose text is genuinely Hindi.
      pushTerm(map, token, 'exact');
      const romanized = transliterate(token);
      if (romanized.length > 0) {
        for (const candidate of romanized) pushTerm(map, candidate, 'translit');
        usedTransliteration = true;
      }
    } else {
      // Plain Latin token with no dictionary entry: search it as typed.
      pushTerm(map, token, 'exact');
    }

    groupAt.set(i, { source: token, terms: toTerms(map) });
  }

  const groups = [...groupAt.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => group)
    .filter((g) => g.terms.length > 0)
    .slice(0, MAX_GROUPS);

  // Flattened view: every distinct term, best origin wins.
  const flat = new Map<string, TermOrigin>();
  pushTerm(flat, rawTerm.term, rawTerm.origin);
  for (const group of groups) {
    for (const t of group.terms) pushTerm(flat, t.term, t.origin);
  }

  return {
    raw,
    rawTerm,
    groups,
    terms: [...flat.entries()]
      .map(([term, origin]) => ({ term, origin }))
      .sort((a, b) => ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin] || a.term.localeCompare(b.term)),
    usedDictionary,
    usedTransliteration,
  };
}
