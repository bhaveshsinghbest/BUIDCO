/**
 * Loads searchSynonyms.json and turns it into a lookup index
 * (bhaveshTask.md Task 5).
 *
 * The dictionary stays a plain JSON data file so that adding a synonym needs
 * no code change and no TypeScript knowledge. This module is the only thing
 * that knows its shape.
 *
 * It is read with readFileSync rather than `import ... with { type: 'json' }`
 * because the two runtimes differ: dev runs the TypeScript through tsx, while
 * production runs compiled JS from dist/. Resolving against import.meta.url
 * behaves identically in both. `npm run build` copies the JSON next to the
 * compiled module (see scripts/copyAssets.mjs) — without that copy this
 * throws at startup, which is the intended loud failure rather than a search
 * that silently stops understanding Hindi.
 */
import { readFileSync } from 'node:fs';

/** One dictionary entry, as authored in the JSON. */
interface RawEntry {
  /** English term(s) actually present in the database. */
  en: string[];
  /** Devanagari spellings. */
  hi: string[];
  /** Roman-script spellings. */
  hinglish: string[];
}

/** Groups are for human readability; keys starting with `_` are comments. */
type RawDictionary = Record<string, RawEntry[] | string[]>;

function isEntryArray(value: RawEntry[] | string[]): value is RawEntry[] {
  const first = value[0];
  return typeof first === 'object' && first !== null;
}

/**
 * Normalised lookup form: lower-cased and whitespace-collapsed, so
 * "Jal   Nikasi" and "jal nikasi" are the same key (Task 8).
 */
export function normalizeKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function build(): {
  index: Map<string, string[]>;
  maxPhraseWords: number;
  entryCount: number;
} {
  const path = new URL('./searchSynonyms.json', import.meta.url);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawDictionary;

  const index = new Map<string, string[]>();
  let maxPhraseWords = 1;
  let entryCount = 0;

  for (const [group, value] of Object.entries(raw)) {
    if (group.startsWith('_')) continue;
    if (!Array.isArray(value) || value.length === 0) continue;
    if (!isEntryArray(value)) continue;

    for (const entry of value) {
      entryCount += 1;

      // Matching is BIDIRECTIONAL: every spelling of an entry maps to every
      // other spelling, English and Devanagari alike.
      //
      // Mapping only Hindi -> English would handle a Hindi query against
      // English data and nothing else. But project records may themselves be
      // written in Hindi, and then an English query has to find them — so
      // "bridge" must also search for "पुल". English forms are listed first
      // so they stay the preferred terms where the data is English.
      const forms: string[] = [];
      for (const form of [...entry.en, ...entry.hi, ...entry.hinglish]) {
        const trimmed = form.replace(/\s+/g, ' ').trim();
        if (trimmed !== '' && !forms.includes(trimmed)) forms.push(trimmed);
      }

      for (const key of forms) {
        const normalized = normalizeKey(key);
        if (normalized === '') continue;
        const words = normalized.split(' ').length;
        if (words > maxPhraseWords) maxPhraseWords = words;

        const existing = index.get(normalized);
        if (existing === undefined) {
          index.set(normalized, [...forms]);
        } else {
          // Two entries can legitimately share a spelling — "jal" is both
          // water and part of "jal nikasi". Union rather than overwrite, so
          // neither meaning is lost.
          for (const term of forms) {
            if (!existing.includes(term)) existing.push(term);
          }
        }
      }
    }
  }

  return { index, maxPhraseWords, entryCount };
}

const built = build();

/** Normalised spelling -> English terms stored in the database. */
export const synonymIndex: ReadonlyMap<string, string[]> = built.index;

/** Longest multi-word key, so the phrase pass knows its window size. */
export const maxPhraseWords: number = built.maxPhraseWords;

/** Entry count, for diagnostics and tests. */
export const dictionaryEntryCount: number = built.entryCount;

/**
 * Every known spelling of the concept behind `spelling` — English forms
 * first — or undefined when it is not in the dictionary.
 */
export function lookup(spelling: string): string[] | undefined {
  return synonymIndex.get(normalizeKey(spelling));
}
