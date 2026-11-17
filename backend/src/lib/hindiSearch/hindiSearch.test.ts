/**
 * Unit tests for the Hindi / Hinglish search utility
 * (bhaveshTask.md Task 10).
 *
 * These are pure: no database, no server. They assert what the expansion
 * PRODUCES, which is the part that must be right regardless of what rows
 * happen to be seeded. Whether a given expansion then finds rows is an
 * integration concern and is covered by the e2e suite.
 */
import { describe, expect, it } from 'vitest';
import {
  dictionaryEntryCount,
  detectScript,
  expandQuery,
  hasDevanagari,
  hasLatin,
  lookup,
  normalizeKey,
  ORIGIN_RANK,
  transliterate,
  type ExpandedQuery,
} from './index.js';

/** All terms, lower-cased — order-independent membership assertions. */
function termsOf(q: ExpandedQuery): string[] {
  return q.terms.map((t) => t.term.toLowerCase());
}

/** The tier a given term was assigned, or undefined if absent. */
function tierOf(q: ExpandedQuery, term: string): number | undefined {
  const hit = q.terms.find((t) => t.term.toLowerCase() === term.toLowerCase());
  return hit === undefined ? undefined : ORIGIN_RANK[hit.origin];
}

describe('detectScript (Task 4)', () => {
  it('detects Devanagari in the U+0900-U+097F range', () => {
    expect(hasDevanagari('पटना')).toBe(true);
    expect(hasDevanagari('Patna')).toBe(false);
    expect(hasDevanagari('123-456')).toBe(false);
  });

  it('detects Latin letters', () => {
    expect(hasLatin('Patna')).toBe(true);
    expect(hasLatin('पटना')).toBe(false);
  });

  it('classifies pure, mixed and script-neutral input', () => {
    expect(detectScript('पटना')).toBe('devanagari');
    expect(detectScript('bridge')).toBe('latin');
    expect(detectScript('पटना bridge')).toBe('mixed');
    expect(detectScript('Patna सड़क')).toBe('mixed');
    // A project ID carries no script signal and must not be mistaken for one.
    expect(detectScript('2024-001')).toBe('neutral');
    expect(detectScript('')).toBe('neutral');
  });
});

describe('dictionary (Task 5)', () => {
  it('loads every entry from searchSynonyms.json', () => {
    // Guards against the JSON failing to load and search silently
    // degrading to English-only.
    expect(dictionaryEntryCount).toBeGreaterThan(60);
  });

  it('resolves Devanagari, Hinglish and English spellings alike', () => {
    expect(lookup('पुल')).toContain('bridge');
    expect(lookup('pul')).toContain('bridge');
    expect(lookup('bridge')).toContain('bridge');
  });

  /**
   * Matching has to work in BOTH directions. Mapping only Hindi -> English
   * handles a Hindi query against English records and nothing else — but
   * records may themselves be written in Devanagari, and then an English
   * query has to find them. These assertions are what make a project named
   * "पटना पुल निर्माण परियोजना" reachable by typing "bridge".
   */
  it('maps English spellings back to their Hindi equivalents', () => {
    expect(lookup('bridge')).toContain('पुल');
    expect(lookup('road')).toContain('सड़क');
    expect(lookup('drainage')).toContain('जल निकासी');
    expect(lookup('Patna')).toContain('पटना');
    expect(lookup('completed')).toContain('पूर्ण');
  });

  it('reaches every spelling of an entry from any one of them', () => {
    // pul -> bridge -> पुल: all three are the same concept.
    for (const start of ['pul', 'bridge', 'पुल']) {
      const forms = lookup(start) ?? [];
      expect(forms, `from "${start}"`).toContain('bridge');
      expect(forms, `from "${start}"`).toContain('पुल');
      expect(forms, `from "${start}"`).toContain('pul');
    }
  });

  it('is case-insensitive and whitespace-normalised', () => {
    expect(lookup('  PUL  ')).toContain('bridge');
    expect(lookup('JAL   NIKASI')).toContain('drainage');
    expect(normalizeKey('  Jal   Nikasi ')).toBe('jal nikasi');
  });

  it('covers the infrastructure terms the task names', () => {
    expect(lookup('पुल')).toContain('bridge');
    expect(lookup('सड़क')).toContain('road');
    expect(lookup('नाला')).toContain('drain');
    expect(lookup('जल निकासी')).toContain('drainage');
    expect(lookup('बिजली')).toContain('electricity');
  });

  it('covers the project statuses the task names', () => {
    expect(lookup('पूर्ण')).toContain('completed');
    expect(lookup('पूरा')).toContain('completed');
    expect(lookup('प्रगति में')).toContain('in progress');
    expect(lookup('चालू')).toContain('in progress');
    expect(lookup('प्रस्तावित')).toContain('proposed');
  });

  /**
   * The status column really holds "In Progress" and "Not Started", so a
   * dictionary that mapped only to the task's literal wording ("ongoing",
   * "proposed") would expand correctly and still match zero rows. Both the
   * natural word and the stored value must be present.
   */
  it('maps statuses to the values actually stored in the column', () => {
    const ongoing = lookup('चालू') ?? [];
    expect(ongoing).toContain('ongoing');
    expect(ongoing).toContain('in progress');
    const proposed = lookup('प्रस्तावित') ?? [];
    expect(proposed).toContain('proposed');
    expect(proposed).toContain('not started');
  });

  it('covers all 38 Bihar districts named in the task', () => {
    const districts = [
      ['अररिया', 'Araria'], ['अरवल', 'Arwal'], ['औरंगाबाद', 'Aurangabad'],
      ['बांका', 'Banka'], ['बेगूसराय', 'Begusarai'], ['भागलपुर', 'Bhagalpur'],
      ['भोजपुर', 'Bhojpur'], ['बक्सर', 'Buxar'], ['दरभंगा', 'Darbhanga'],
      ['पूर्वी चंपारण', 'East Champaran'], ['गया', 'Gaya'], ['गोपालगंज', 'Gopalganj'],
      ['जमुई', 'Jamui'], ['जहानाबाद', 'Jehanabad'], ['कैमूर', 'Kaimur'],
      ['कटिहार', 'Katihar'], ['खगड़िया', 'Khagaria'], ['किशनगंज', 'Kishanganj'],
      ['लखीसराय', 'Lakhisarai'], ['मधेपुरा', 'Madhepura'], ['मधुबनी', 'Madhubani'],
      ['मुंगेर', 'Munger'], ['मुजफ्फरपुर', 'Muzaffarpur'], ['नालंदा', 'Nalanda'],
      ['नवादा', 'Nawada'], ['पटना', 'Patna'], ['पूर्णिया', 'Purnia'],
      ['रोहतास', 'Rohtas'], ['सहरसा', 'Saharsa'], ['समस्तीपुर', 'Samastipur'],
      ['सारण', 'Saran'], ['शेखपुरा', 'Sheikhpura'], ['शिवहर', 'Sheohar'],
      ['सीतामढ़ी', 'Sitamarhi'], ['सीवान', 'Siwan'], ['सुपौल', 'Supaul'],
      ['वैशाली', 'Vaishali'], ['पश्चिमी चंपारण', 'West Champaran'],
    ] as const;
    expect(districts).toHaveLength(38);
    for (const [hi, en] of districts) {
      expect(lookup(hi), `missing Hindi mapping for ${en}`).toContain(en);
    }
  });
});

describe('transliterate (Task 6)', () => {
  it('produces Roman candidates for Devanagari', () => {
    expect(transliterate('पटना').length).toBeGreaterThan(0);
  });

  /**
   * ITRANS is phonetically literal: पटना becomes "patana", not "patna".
   * The schwa-deleted candidate is the whole point of the fallback, so
   * assert it is actually generated.
   */
  it('generates the schwa-deleted spelling people actually type', () => {
    expect(transliterate('पटना')).toContain('patna');
    expect(transliterate('भागलपुर')).toContain('bhagalpur');
  });

  /**
   * The nukta has no ITRANS equivalent and is passed through, which would
   * leave a Devanagari codepoint stranded inside a Roman string and match
   * nothing at all.
   */
  it('strips the nukta instead of emitting it mid-word', () => {
    for (const candidate of transliterate('सड़क')) {
      expect(candidate, `"${candidate}" still contains Devanagari`).toMatch(/^[a-z]+$/);
    }
    expect(transliterate('सड़क')).toContain('sadak');
  });

  it('returns nothing usable rather than throwing on junk input', () => {
    expect(transliterate('')).toEqual([]);
    expect(transliterate('क')).toEqual([]);
  });
});

describe('expandQuery (Tasks 4, 6, 8)', () => {
  it('leaves a plain English query alone', () => {
    const q = expandQuery('bridge');
    expect(termsOf(q)).toContain('bridge');
    expect(q.usedTransliteration).toBe(false);
    expect(tierOf(q, 'bridge')).toBe(ORIGIN_RANK.exact);
  });

  /**
   * An English query must also search the Hindi forms, but the English term
   * it was given has to stay the TOP tier — otherwise English records would
   * lose their ranking advantage over Hindi ones for an English query.
   */
  it('widens an English query to Hindi without demoting the English term', () => {
    const q = expandQuery('bridge');
    expect(termsOf(q)).toContain('पुल');
    expect(tierOf(q, 'bridge')).toBe(ORIGIN_RANK.exact);
    expect(tierOf(q, 'पुल')).toBe(ORIGIN_RANK.synonym);
  });

  it('normalises whitespace and preserves the original query', () => {
    const q = expandQuery('  पटना   bridge  ');
    expect(q.raw).toBe('पटना bridge');
    expect(q.rawTerm.term).toBe('पटना bridge');
  });

  it('expands a Devanagari term through the dictionary, not transliteration', () => {
    const q = expandQuery('मुजफ्फरपुर');
    expect(termsOf(q)).toContain('muzaffarpur');
    // The dictionary must win: raw ITRANS would give "mujaphpharapura".
    expect(q.usedDictionary).toBe(true);
    expect(q.usedTransliteration).toBe(false);
  });

  it('prefers the longest dictionary phrase over its parts', () => {
    const q = expandQuery('जल निकासी');
    expect(termsOf(q)).toContain('drainage');
    // "jal" alone means water; the phrase must not be split into it.
    expect(q.groups).toHaveLength(1);
    expect(q.groups[0]?.source).toBe('जल निकासी');
  });

  it('processes each word of a mixed-language query independently', () => {
    const q = expandQuery('पटना bridge');
    expect(termsOf(q)).toContain('patna');
    expect(termsOf(q)).toContain('bridge');
    expect(q.groups).toHaveLength(2);
  });

  it('handles the reverse mixed order too', () => {
    const q = expandQuery('Patna सड़क');
    expect(termsOf(q)).toContain('patna');
    expect(termsOf(q)).toContain('road');
  });

  /**
   * One group per token, ANDed by the SQL layer. Flattening these into a
   * single OR would turn "drainage in Patna" into "Patna OR drainage".
   */
  it('keeps one group per token so the SQL can intersect them', () => {
    const q = expandQuery('पटना जल निकासी');
    expect(q.groups).toHaveLength(2);
    const sources = q.groups.map((g) => g.source);
    expect(sources).toEqual(['पटना', 'जल निकासी']);
    expect(q.groups[0]?.terms.map((t) => t.term)).toContain('patna');
    expect(q.groups[1]?.terms.map((t) => t.term)).toContain('drainage');
  });

  it('combines a place and a status', () => {
    const q = expandQuery('सड़क पूर्ण');
    expect(termsOf(q)).toContain('road');
    expect(termsOf(q)).toContain('completed');
    expect(q.groups).toHaveLength(2);
  });

  it('ranks exact above synonym above transliteration', () => {
    const q = expandQuery('पुल');
    // The dictionary hit is a synonym; the original stays exact.
    expect(tierOf(q, 'bridge')).toBe(ORIGIN_RANK.synonym);
    expect(tierOf(q, 'पुल')).toBe(ORIGIN_RANK.exact);
    expect(ORIGIN_RANK.exact).toBeLessThan(ORIGIN_RANK.synonym);
    expect(ORIGIN_RANK.synonym).toBeLessThan(ORIGIN_RANK.translit);
  });

  it('falls back to transliteration only when the dictionary misses', () => {
    const q = expandQuery('गलत');
    expect(q.usedDictionary).toBe(false);
    expect(q.usedTransliteration).toBe(true);
    for (const t of q.terms.filter((x) => x.origin === 'translit')) {
      expect(ORIGIN_RANK[t.origin]).toBe(ORIGIN_RANK.translit);
    }
  });

  it('returns an empty expansion for a blank query', () => {
    const q = expandQuery('   ');
    expect(q.terms).toEqual([]);
    expect(q.groups).toEqual([]);
  });

  it('bounds the number of groups for a pathological query', () => {
    const q = expandQuery(Array.from({ length: 50 }, (_, i) => `word${i}`).join(' '));
    expect(q.groups.length).toBeLessThanOrEqual(8);
  });
});

/**
 * The acceptance table from bhaveshTask.md Task 10, asserted at the level
 * this module is responsible for: what the query expands to. The row counts
 * those expansions return are asserted in the e2e suite against real data.
 */
describe('Task 10 acceptance table', () => {
  const cases: Array<{ query: string; expect: string[]; note: string }> = [
    { query: 'bridge', expect: ['bridge'], note: 'unchanged English' },
    { query: 'पुल', expect: ['bridge'], note: 'Devanagari -> bridge' },
    { query: 'pul', expect: ['bridge'], note: 'Hinglish -> bridge' },
    { query: 'पटना', expect: ['patna'], note: 'Devanagari place' },
    { query: 'पटना जल निकासी', expect: ['patna', 'drainage'], note: 'drainage in Patna' },
    { query: 'सड़क पूर्ण', expect: ['road', 'completed'], note: 'completed roads' },
  ];

  for (const c of cases) {
    it(`"${c.query}" expands to ${c.expect.join(' + ')} (${c.note})`, () => {
      const terms = termsOf(expandQuery(c.query));
      for (const want of c.expect) expect(terms).toContain(want);
    });
  }

  it('"random गलत शब्द" expands without throwing and finds no dictionary hit', () => {
    const q = expandQuery('random गलत शब्द');
    // It must not throw, and must still carry the English token through so
    // the query is well-formed; the friendly empty state is the UI's job.
    expect(termsOf(q)).toContain('random');
    expect(q.usedDictionary).toBe(false);
  });
});
