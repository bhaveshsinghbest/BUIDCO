/**
 * Devanagari -> Roman transliteration fallback (bhaveshTask.md Task 6).
 *
 * This is a FALLBACK, used only for tokens the dictionary does not cover —
 * typically proper nouns and place names nobody has added yet. The reason it
 * cannot be the primary mechanism is measurable: ITRANS output is phonetically
 * literal, not the spelling people actually use.
 *
 *   पटना        -> "patana"            (data says "Patna")
 *   भागलपुर      -> "bhagalapura"       (data says "Bhagalpur")
 *   मुजफ्फरपुर    -> "mujaphpharapura"   (data says "Muzaffarpur")
 *
 * So a bare transliteration would match almost nothing. Two corrections make
 * it useful: strip the nukta, and generate schwa-deleted candidates.
 */
import * as sanscriptModule from '@indic-transliteration/sanscript';

/** The one call this module needs. */
interface Transliterator {
  t(data: string, from: string, to: string): string;
}

/**
 * The package is a CJS/UMD bundle whose .d.ts declares `export default`, so
 * under NodeNext resolution the callable object arrives either as the module
 * namespace itself or under `.default`, depending on the resolver. Normalise
 * it once here so the rest of the file is free of interop noise.
 */
const sanscriptRaw = sanscriptModule as unknown as Partial<Transliterator> & {
  default?: Transliterator;
};
const Sanscript: Transliterator =
  typeof sanscriptRaw.t === 'function'
    ? (sanscriptRaw as Transliterator)
    : (sanscriptRaw.default as Transliterator);

/**
 * Combining nukta, U+093C. ITRANS has no equivalent, and Sanscript passes it
 * through untouched: सड़क becomes "sada़ka" — a Roman string with a stray
 * Devanagari codepoint wedged in the middle, which cannot match anything at
 * all. Removing it first yields "sadaka", whose schwa-deleted form "sadak" is
 * what users type.
 */
const NUKTA_RE = /\u093C/g;

/** Anything ITRANS emits that is not a plain Roman letter (accents, digits). */
const NON_ROMAN_RE = /[^a-z]/g;

/** Keep the SQL bounded — every candidate becomes another OR'd parameter. */
const MAX_VARIANTS = 8;

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function isVowel(ch: string): boolean {
  return VOWELS.has(ch);
}

/** Drop a single trailing inherent vowel: "patana" -> "patan". */
function dropTrailingA(word: string): string | null {
  return word.endsWith('a') && word.length > 3 ? word.slice(0, -1) : null;
}

/**
 * Candidate spellings for one transliterated word, most literal first.
 *
 * Hindi deletes most of the inherent "a" vowels that ITRANS spells out, so
 * the real spelling is usually the literal one minus one or two of them.
 * Proper schwa deletion needs morphology and is unsolved in the general
 * case, so instead of guessing once we emit a handful of candidates and let
 * the OR across them find the hit. Each is a bound parameter, so extra
 * candidates cost a little query width and nothing in safety. A nonsense
 * candidate such as "ptana" simply matches no row.
 */
function schwaVariants(word: string): string[] {
  const out = new Set<string>([word]);

  const trimmed = dropTrailingA(word);
  if (trimmed !== null) out.add(trimmed);

  // Delete one medial "a" that sits between two consonants. Done on the full
  // word, because that is what turns "patana" into "patna"; doing it on the
  // trailing-stripped form would only ever produce "patn".
  //
  // Scanned from the END backwards on purpose: Hindi drops the LAST medial
  // schwa, so that deletion yields the real spelling and must be offered
  // before the others. Scanning forwards put "bhgalapura" ahead of
  // "bhagalpur" and the variant cap then discarded the only useful one.
  for (let i = word.length - 2; i >= 1; i -= 1) {
    if (word[i] !== 'a') continue;
    const prev = word[i - 1];
    const next = word[i + 1];
    if (prev === undefined || next === undefined) continue;
    if (isVowel(prev) || isVowel(next)) continue;
    const deleted = word.slice(0, i) + word.slice(i + 1);
    out.add(deleted);
    // ...and the same again without the trailing vowel, which is what takes
    // "bhagalapura" all the way to "bhagalpur".
    const both = dropTrailingA(deleted);
    if (both !== null) out.add(both);
  }

  return [...out].filter((w) => w.length >= 3).slice(0, MAX_VARIANTS);
}

/**
 * Transliterate one Devanagari token into candidate Roman spellings.
 *
 * Returns an empty array when the token yields nothing usable, so callers can
 * treat "no transliteration" and "no dictionary entry" the same way.
 */
export function transliterate(token: string): string[] {
  const stripped = token.replace(NUKTA_RE, '');
  let roman: string;
  try {
    roman = Sanscript.t(stripped, 'devanagari', 'itrans');
  } catch {
    // A malformed token must never break a search.
    return [];
  }
  const cleaned = roman.toLowerCase().replace(NON_ROMAN_RE, '');
  if (cleaned.length < 3) return [];
  return schwaVariants(cleaned);
}
