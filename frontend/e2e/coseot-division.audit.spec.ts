/**
 * Acceptance checks for bhaveshTask.md Task 2 — the CoS/EoT register shows
 * Division in place of District.
 *
 * These run against the real stack (dev server + database), because the
 * point of the task is that genuine division data reaches the screen. A
 * mocked response would pass even if the view, the API mapping or the
 * lookup join were wrong, which is precisely the chain the task changes.
 *
 *   npx playwright test e2e/coseot-division
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './audit/audit-kit';

/** Header texts, lower-cased — headers are CSS-uppercased, and innerText
 *  returns the transformed text, so matching must ignore case. */
async function headers(table: Locator): Promise<string[]> {
  return (await table.locator('thead th').allInnerTexts()).map((t) =>
    t.replace(/\s+/g, ' ').trim().toLowerCase(),
  );
}

/** Index of the column whose header starts with `want`. */
function columnIndex(hs: string[], want: string): number {
  return hs.findIndex((h) => h.startsWith(want));
}

async function openCosEot(page: Page): Promise<Locator> {
  await page.goto('/cos-eot');
  const table = page.locator('table').first();
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  return table;
}

test.describe('Task 2 — CoS/EoT shows Division, not District', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test('the table has a Division column and no District column', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    const table = await openCosEot(page);

    const hs = await headers(table);
    expect(columnIndex(hs, 'division'), `no Division column. Headers: ${JSON.stringify(hs)}`)
      .toBeGreaterThanOrEqual(0);
    expect(columnIndex(hs, 'district'), `District column still present. Headers: ${JSON.stringify(hs)}`)
      .toBe(-1);
  });

  /**
   * The column must carry resolved division NAMES. A `#29` fallback would
   * mean the lookup join failed, and an em dash would mean the API never
   * sent divisionId — both render a "Division" column that is useless.
   */
  test('every row shows a resolved division name', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    const table = await openCosEot(page);

    const hs = await headers(table);
    const idx = columnIndex(hs, 'division');
    const rows = table.locator('tbody tr');
    const n = Math.min(await rows.count(), 25);
    expect(n).toBeGreaterThan(0);

    const seen = new Set<string>();
    for (let i = 0; i < n; i += 1) {
      const text = (await rows.nth(i).locator('td').nth(idx).innerText()).trim();
      expect(text, `row ${i} has no division`).not.toBe('');
      expect(text, `row ${i} shows the em-dash placeholder — divisionId missing`).not.toBe('—');
      expect(text, `row ${i} shows an unresolved id (${text}) — lookup join failed`).not.toMatch(/^#\d+$/);
      expect(text, `row ${i} division "${text}" is not a name`).toMatch(/[A-Za-z]/);
      seen.add(text);
    }
    // Real data spans divisions; a single repeated value would suggest a
    // constant leaking through rather than a per-project join.
    expect(seen.size, `only one distinct division across ${n} rows`).toBeGreaterThan(1);
  });

  test('the Division column filter narrows the table to that division', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    const table = await openCosEot(page);

    const hs = await headers(table);
    const idx = columnIndex(hs, 'division');
    const rows = table.locator('tbody tr');

    // Pick a division that is actually on the page, so the filter must match.
    const target = (await rows.first().locator('td').nth(idx).innerText()).trim();
    const before = await rows.count();

    await table.locator('thead th').nth(idx).locator('select').selectOption({ label: target });

    const after = await rows.count();
    expect(after).toBeGreaterThan(0);
    expect(after, 'filter did not narrow or kept non-matching rows').toBeLessThanOrEqual(before);

    // Every surviving row is the chosen division.
    for (let i = 0; i < after; i += 1) {
      expect((await rows.nth(i).locator('td').nth(idx).innerText()).trim()).toBe(target);
    }
  });

  test('the Columns menu offers Division and can hide it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    const table = await openCosEot(page);

    await page.getByRole('button', { name: /columns/i }).click();
    const toggle = page.getByRole('button', { name: 'Division' }).or(
      page.getByLabel('Division', { exact: true }),
    );
    await expect(toggle.first()).toBeVisible();
    await toggle.first().click();
    await page.keyboard.press('Escape');

    // Hiding it removes the column rather than blanking the cells.
    await expect
      .poll(async () => columnIndex(await headers(table), 'division'), { timeout: 10_000 })
      .toBe(-1);
  });

  /**
   * Task 1 / Task 10 — the swap must not break the responsive layout. The
   * table scrolls inside its own container; the PAGE must not scroll
   * sideways.
   */
  for (const vp of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
  ]) {
    test(`no horizontal page overflow at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signIn(page);
      await openCosEot(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `page scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});
