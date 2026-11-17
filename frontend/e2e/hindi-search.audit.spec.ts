/**
 * Acceptance checks for bhaveshTask.md Tasks 4-10 — Hindi / Hinglish search.
 *
 * Runs against the real stack, because the point of the feature is that a
 * Devanagari query reaches the database and comes back with the English rows
 * it refers to. Mocking the API would pass even if expansion, the SQL or the
 * joins were broken.
 *
 * The central assertion is EQUIVALENCE rather than a row count: a Hindi query
 * must return exactly what its English equivalent returns. That holds no
 * matter what happens to be seeded, so these tests do not rot when the data
 * changes — and the current dataset has no bridge or road projects at all,
 * which would make any hardcoded count meaningless.
 *
 *   npx playwright test e2e/hindi-search
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  AUDIT_TAG,
  apiContext,
  apiCreateProject,
  apiDeleteAuditProject,
  signIn,
} from './audit/audit-kit';

interface SearchResult {
  status: number;
  names: string[];
}

async function search(api: APIRequestContext, token: string, q: string | null): Promise<SearchResult> {
  const params = new URLSearchParams({ limit: '100' });
  if (q !== null) params.set('search', q);
  const res = await api.get(`/api/projects?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { items?: Array<{ projectName: string | null }> };
  return {
    status: res.status(),
    names: (body.items ?? []).map((i) => i.projectName ?? ''),
  };
}

const sorted = (xs: string[]): string[] => [...xs].sort();

test.describe('Tasks 4-10 — Hindi / Hinglish search', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  /**
   * One query per pair, Hindi/Hinglish against English. Covers Devanagari,
   * Roman-script Hinglish, a multi-word dictionary phrase, and a place name
   * whose literal transliteration ("mujaphpharapura") would never match.
   */
  test('a Hindi or Hinglish query returns exactly what its English equivalent returns', async () => {
    const { api, token } = await apiContext();
    const pairs: Array<[string, string]> = [
      ['पुल', 'bridge'],
      ['pul', 'bridge'],
      ['सड़क', 'road'],
      ['नाला', 'drain'],
      ['जल निकासी', 'drainage'],
      ['पानी', 'water'],
      ['पटना', 'Patna'],
      ['मुजफ्फरपुर', 'Muzaffarpur'],
    ];

    for (const [hindi, english] of pairs) {
      const a = await search(api, token, hindi);
      const b = await search(api, token, english);
      expect(a.status, `${hindi} errored`).toBe(200);
      expect(b.status, `${english} errored`).toBe(200);
      expect(
        sorted(a.names),
        `"${hindi}" returned ${a.names.length} rows but "${english}" returned ${b.names.length}`,
      ).toEqual(sorted(b.names));
    }
  });

  /**
   * The semantics that matter most: a two-token query is an INTERSECTION.
   * `पटना जल निकासी` means "drainage projects in Patna", so ORing the terms
   * — which is the obvious implementation — is wrong, and would silently
   * return every Patna project plus every drainage project.
   */
  test('a multi-token query intersects rather than unions', async () => {
    const { api, token } = await apiContext();
    const patna = await search(api, token, 'पटना');
    const drainage = await search(api, token, 'जल निकासी');
    const both = await search(api, token, 'पटना जल निकासी');

    const intersection = patna.names.filter((n) => drainage.names.includes(n));
    expect(sorted(both.names), 'result is not the intersection').toEqual(sorted(intersection));
    // And the union is a different thing entirely — guard against regressing
    // to it. (Only meaningful when the two sets actually differ.)
    if (patna.names.length > 0 && drainage.names.length > 0) {
      expect(both.names.length).toBeLessThan(patna.names.length + drainage.names.length);
    }
    // Same query in English must agree.
    const english = await search(api, token, 'Patna drainage');
    expect(sorted(both.names)).toEqual(sorted(english.names));
  });

  test('English search is unchanged and a nonsense query errors on nothing', async () => {
    const { api, token } = await apiContext();
    // The field set widened, so English search must still be a superset of
    // what it matched before: a name search still works.
    const byName = await search(api, token, 'Water Supply');
    expect(byName.status).toBe(200);
    expect(byName.names.length).toBeGreaterThan(0);

    const nonsense = await search(api, token, 'random गलत शब्द');
    expect(nonsense.status, 'a nonsense mixed query must not 500').toBe(200);
    expect(nonsense.names).toEqual([]);
  });

  /**
   * Task 8 — exact English matches rank above dictionary synonyms.
   *
   * The seeded data happens to produce single-tier results for every query,
   * so this creates the one case that distinguishes them: "park" and
   * "garden" are both English targets of पार्क, and only "park" is the term
   * as typed. Both projects are tagged audit data and removed afterwards.
   */
  test('an exact match ranks above a synonym match', async () => {
    const { api, token } = await apiContext();
    const created: string[] = [];
    try {
      // Created synonym-first so insertion order cannot be what makes the
      // assertion pass.
      const synonymRow = await apiCreateProject(
        { projectName: `${AUDIT_TAG} Garden Rejuvenation`, contractType: 'Work Contract' },
        'hindi-search ranking (synonym tier)',
      );
      created.push(synonymRow.projectId);
      const exactRow = await apiCreateProject(
        { projectName: `${AUDIT_TAG} Park Rejuvenation`, contractType: 'Work Contract' },
        'hindi-search ranking (exact tier)',
      );
      created.push(exactRow.projectId);

      const res = await search(api, token, 'park');
      const ours = res.names.filter((n) => n.startsWith(AUDIT_TAG));
      expect(ours, 'both tagged projects should match "park"').toHaveLength(2);
      // "Park" matches the term as typed (tier 0); "Garden" only via the
      // dictionary (tier 1), so it must come second.
      expect(ours[0]).toContain('Park');
      expect(ours[1]).toContain('Garden');
    } finally {
      for (const id of created) {
        const outcome = await apiDeleteAuditProject(id);
        expect(outcome, `cleanup of ${id} failed`).toBe('deleted');
      }
    }
  });

  /**
   * The reverse direction: records written in Devanagari, found by typing
   * English. Seeded by `npm run db:seed-hindi-demo` in backend/.
   *
   * Skipped rather than failed when the demo rows are absent, because they
   * are removable demo data (`-- --remove`) and a missing fixture is not a
   * product defect.
   */
  test('Hindi project records are found by typing English', async () => {
    const { api, token } = await apiContext();
    // Presence probe: one Devanagari query that only the demo rows satisfy.
    const probe = await search(api, token, 'पुल');
    test.skip(
      !probe.names.some((n) => n.includes('पुल')),
      'Hindi demo rows not seeded — run: cd backend && npm run db:seed-hindi-demo',
    );

    const cases: Array<[string, string]> = [
      ['bridge', 'पटना पुल निर्माण परियोजना'],
      ['road', 'गया सड़क चौड़ीकरण कार्य'],
      ['drainage', 'मुजफ्फरपुर जल निकासी सुधार'],
      ['water supply', 'भागलपुर जलापूर्ति विस्तार'],
      ['drain', 'दरभंगा नाला पुनर्निर्माण'],
      ['sewerage', 'पूर्णिया सीवरेज नेटवर्क'],
      ['toilet', 'आरा शौचालय निर्माण'],
      ['park', 'बेगूसराय पार्क विकास'],
      ['pond', 'कटिहार तालाब सौंदर्यीकरण'],
      ['building', 'नालंदा भवन मरम्मत'],
    ];

    for (const [english, hindiName] of cases) {
      const res = await search(api, token, english);
      expect(res.status, `"${english}" errored`).toBe(200);
      expect(
        res.names,
        `typing "${english}" did not find "${hindiName}"`,
      ).toContain(hindiName);
    }
  });

  /**
   * Ranking, now observable on real data: "drainage" matches the English
   * rows on the term as typed (tier 0) and the Hindi row only through the
   * dictionary (tier 1), so every English row must precede the Hindi one.
   */
  test('for an English query, English records outrank Hindi ones', async () => {
    const { api, token } = await apiContext();
    const res = await search(api, token, 'drainage');
    const hindiIndex = res.names.findIndex((n) => n.includes('जल निकासी'));
    test.skip(hindiIndex === -1, 'Hindi demo rows not seeded');

    // Everything before the Hindi row contains the English term; nothing
    // after it does. That is the tier boundary.
    expect(hindiIndex, 'the Hindi row should not be first for an English query')
      .toBeGreaterThan(0);
    for (const name of res.names.slice(0, hindiIndex)) {
      expect(name.toLowerCase()).toContain('drain');
    }
  });

  /* ---------------- UI ---------------- */

  /**
   * Task 8 — the register used to issue one request per keystroke. Counting
   * requests is the only way to prove the debounce actually coalesces them;
   * asserting on the result would pass either way.
   */
  test('typing a search issues one request, not one per keystroke', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

    let searchRequests = 0;
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith('/api/projects') && url.searchParams.has('search')) {
        searchRequests += 1;
      }
    });

    // 8 characters typed briskly — the old behaviour fired 8 requests.
    await page.getByRole('textbox', { name: 'Search' }).pressSequentially('drainage', { delay: 40 });
    await expect
      .poll(() => searchRequests, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(1200);

    expect(
      searchRequests,
      `expected the debounce to coalesce 8 keystrokes, got ${searchRequests} requests`,
    ).toBeLessThanOrEqual(2);
  });

  test('a Devanagari query typed into the register returns rows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('textbox', { name: 'Search' }).fill('पानी');
    // Debounced, so wait for the row set to settle rather than asserting now.
    await expect
      .poll(async () => page.locator('tbody tr').count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(0);
    // The URL carries the query, so a Hindi search is shareable.
    await expect(page).toHaveURL(/search=/);
  });

  test('the empty state is bilingual', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('textbox', { name: 'Search' }).fill('कोईअस्तित्वनहीं');
    const empty = page.getByText(/No projects found \/ कोई परियोजना नहीं मिली/);
    await expect(empty).toBeVisible({ timeout: 15_000 });
  });

  /* ---------------- responsive (Task 10) ---------------- */

  for (const vp of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
  ]) {
    test(`the search box is usable at ${vp.name} (${vp.width}px)`, async ({ page }: { page: Page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signIn(page);
      await page.goto('/projects');
      await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

      const box = page.getByRole('textbox', { name: 'Search' });
      await expect(box).toBeVisible();
      await box.fill('पानी');
      await expect.poll(async () => page.locator('tbody tr').count(), { timeout: 15_000 })
        .toBeGreaterThan(0);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `page scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});
