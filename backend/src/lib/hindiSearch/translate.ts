/**
 * Optional translation fallback for search.
 *
 * ## Approval (finding S-26)
 *
 * OFF unless the department decides otherwise. When enabled, the search
 * text leaves the server, and search text can name projects, places and
 * contractors. So:
 *   - production accepts only Bhashini (Government of India) — env.ts
 *     refuses SEARCH_TRANSLATION=on with any other provider there;
 *   - only the query string is sent, never project records;
 *   - the Google provider remains for development comparison only, and its
 *     key travels in a header, not the URL, where proxies would log it.
 *
 * ## When this runs
 *
 * Last, and rarely. The order is dictionary -> transliteration -> (only if
 * the search still found nothing) translation. That ordering is the whole
 * design: a translation call is a network round trip to a third party, so
 * putting it on the hot path of every keystroke would make a fast search
 * slow in order to help the small minority of queries the dictionary does
 * not already cover. Running it only after an empty result means it can
 * widen results but can never slow down or break a search that was going
 * to succeed anyway.
 *
 * ## Configuration
 *
 * Disabled unless SEARCH_TRANSLATION=on AND a key is present. Credentials
 * come from the environment only — nothing is hardcoded, and the key is
 * never logged or returned to the client.
 *
 * ## Cache
 *
 * Translations of a given query are stable, and the same few queries recur,
 * so results are cached in process with a TTL. This is a cost control, not
 * a correctness mechanism: a cold cache simply means one more API call.
 */
import { env } from '../../env.js';

/** Cache entries live this long. Translations do not change minute to minute. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Bounded so a flood of distinct queries cannot grow the process heap. */
const CACHE_MAX_ENTRIES = 500;

/** A slow translation must not hold up a search. */
const REQUEST_TIMEOUT_MS = 4000;

interface CacheEntry {
  terms: string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): string[] | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Refresh recency so the eviction below sheds genuinely cold entries.
  cache.delete(key);
  cache.set(key, hit);
  return hit.terms;
}

function cacheSet(key: string, terms: string[]): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Map preserves insertion order, so the first key is the least recently
    // used given the refresh in cacheGet.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { terms, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Exposed for tests — the cache is process-global otherwise. */
export function clearTranslationCache(): void {
  cache.clear();
}

/**
 * Whether the fallback is usable. An `on` flag with no key counts as off:
 * failing loudly at startup would take down a server over an optional
 * feature, and failing silently per request would be invisible, so this
 * warns once and stays disabled.
 */
export function isTranslationEnabled(): boolean {
  if (env.SEARCH_TRANSLATION !== 'on') return false;
  if (env.SEARCH_TRANSLATION_API_KEY === undefined) {
    warnOnce();
    return false;
  }
  return true;
}

let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  process.stderr.write(
    'warn: SEARCH_TRANSLATION=on but SEARCH_TRANSLATION_API_KEY is missing — translation fallback stays disabled.\n',
  );
}

async function callGoogle(query: string, key: string): Promise<string[]> {
  const url = new URL('https://translation.googleapis.com/language/translate/v2');
  const res = await fetch(url, {
    method: 'POST',
    // Header, not ?key=…: query strings end up in proxy and access logs.
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({ q: query, source: 'hi', target: 'en', format: 'text' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`translate HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: { translations?: Array<{ translatedText?: string }> };
  };
  const text = body.data?.translations?.[0]?.translatedText;
  return typeof text === 'string' && text.trim() !== '' ? [text.trim()] : [];
}

async function callBhashini(query: string, key: string): Promise<string[]> {
  const endpoint = env.SEARCH_TRANSLATION_ENDPOINT;
  if (endpoint === undefined) {
    throw new Error('SEARCH_TRANSLATION_ENDPOINT is required for the bhashini provider');
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({
      inputData: { input: [{ source: query }] },
      pipelineTasks: [
        { taskType: 'translation', config: { language: { sourceLanguage: 'hi', targetLanguage: 'en' } } },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`translate HTTP ${res.status}`);
  const body = (await res.json()) as {
    pipelineResponse?: Array<{ output?: Array<{ target?: string }> }>;
  };
  const text = body.pipelineResponse?.[0]?.output?.[0]?.target;
  return typeof text === 'string' && text.trim() !== '' ? [text.trim()] : [];
}

/**
 * Translate a query to English, returning extra search terms.
 *
 * Never throws and never rejects: a translation failure must degrade to "no
 * extra terms" and leave the original (already empty) result standing,
 * rather than turning a search into a 500.
 */
export async function translateQuery(query: string): Promise<string[]> {
  if (!isTranslationEnabled()) return [];
  const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
  if (normalized === '') return [];

  const cached = cacheGet(normalized);
  if (cached !== undefined) return cached;

  const key = env.SEARCH_TRANSLATION_API_KEY;
  if (key === undefined) return [];

  try {
    const terms =
      env.SEARCH_TRANSLATION_PROVIDER === 'google'
        ? await callGoogle(normalized, key)
        : await callBhashini(normalized, key);
    cacheSet(normalized, terms);
    return terms;
  } catch (err) {
    // Deliberately logs neither the key nor the full response body.
    process.stderr.write(
      `warn: search translation failed (${env.SEARCH_TRANSLATION_PROVIDER}): ${
        err instanceof Error ? err.message : 'unknown error'
      }\n`,
    );
    // Cache the empty result briefly so one broken provider does not get
    // retried on every keystroke.
    cacheSet(normalized, []);
    return [];
  }
}
