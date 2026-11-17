/**
 * Acceptance + regression checks for bhaveshTask.md Tasks 2-4.
 *
 *   Task 2 — the District column is gone from the Projects listing table.
 *   Task 3 — the Funds & UC table header stays put while scrolling (now the
 *            UC watch-list of the Funds Flow & UC Tracker).
 *   Task 4 — Central/State Share % show a figure for every funding source
 *            (now in the Project-wise project panel).
 *
 * Runs against the real local stack, because all three are about what
 * actually lands on screen with real data behind it.
 *
 *   npx playwright test e2e/tasks-district-funds
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { signIn } from './audit/audit-kit';

const SHOTS = path.resolve(process.cwd(), 'audit-evidence', 'task-verify');

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** Header texts of whichever table is being looked at. */
async function headerTexts(page: Page, tableIndex = 0): Promise<string[]> {
  const ths = page.locator('table').nth(tableIndex).locator('thead th');
  return (await ths.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
}

test.describe('bhaveshTask Tasks 2-4', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  /* ---------------- Task 2 ---------------- */

  test('Task 2 — Projects table no longer shows a District column', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

    const headers = await headerTexts(page);
    expect(headers.length).toBeGreaterThan(5);
    expect(
      headers.some((h) => /^district\b/i.test(h)),
      `District column still present. Headers: ${JSON.stringify(headers)}`,
    ).toBe(false);

    // The columns either side of where District used to sit must survive —
    // this is the regression that matters, not just the deletion.
    for (const keep of ['City', 'Division']) {
      expect(
        headers.some((h) => h.toLowerCase().startsWith(keep.toLowerCase())),
        `expected "${keep}" column to remain. Headers: ${JSON.stringify(headers)}`,
      ).toBe(true);
    }
    await shot(page, 'task2-projects-desktop');
  });

  test('Task 2 — District is not offered in the column picker either', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

    const picker = page.getByRole('button', { name: /column|field/i }).first();
    if (await picker.isVisible().catch(() => false)) {
      await picker.click();
      await page.waitForTimeout(400);
      // Exact match: the picker renders one label per column, so a surviving
      // District column would appear as a label of its own.
      const exact = page.getByText('District', { exact: true });
      const found = await exact.count();
      for (let i = 0; i < found; i += 1) {
        const where = await exact.nth(i).evaluate((el) => {
          const tag = el.tagName.toLowerCase();
          const cls = el.getAttribute('class') ?? '';
          const shown = (el as HTMLElement).offsetParent !== null;
          return tag + ' | class=' + cls + ' | visible=' + String(shown);
        });
        console.log('DISTRICT TEXT FOUND:', where);
      }
      expect(found, 'District still listed in the column picker').toBe(0);
      await shot(page, 'task2-column-picker');
    }
  });

  test('Task 2 — table stays usable at tablet and mobile widths', async ({ page }) => {
    await signIn(page);
    for (const [name, width, height] of [
      ['tablet', 768, 1024],
      ['mobile', 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/projects');
      await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

      const headers = await headerTexts(page);
      expect(headers.some((h) => /^district\b/i.test(h))).toBe(false);

      // The page itself must not scroll sideways — the table has its own
      // horizontal scroller, and that is where the overflow belongs.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `page scrolls horizontally at ${name} width by ${overflow}px`).toBeLessThanOrEqual(1);
      await shot(page, `task2-projects-${name}`);
    }
  });

  /* ---------------- Tasks 3 + 4 ---------------- */
  // The Funds & UC page is now the Funds Flow & UC Tracker. Its scrolling
  // table is the UC watch-list, and each project's Central/State split is
  // shown in the Project-wise panel.

  test('Task 3 — Funds & UC table header stays visible while scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/funds-uc');

    const watchList = page.getByTestId('uc-watch-list');
    const notCoveredTh = watchList.locator('th', { hasText: 'Not covered' }).first();
    await expect(notCoveredTh).toBeVisible({ timeout: 30_000 });
    await watchList.scrollIntoViewIfNeeded();

    const before = await notCoveredTh.boundingBox();
    expect(before).not.toBeNull();

    // Scroll the watch-list's own container to the bottom.
    const scrolled = await watchList.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    // A vacuous pass is worse than a failure: if nothing scrolled, the
    // sticky behaviour was never actually exercised.
    expect(scrolled, 'watch-list did not scroll — not enough rows to test stickiness').toBeGreaterThan(0);

    await page.waitForTimeout(300);
    await expect(notCoveredTh).toBeVisible();
    const after = await notCoveredTh.boundingBox();
    expect(after).not.toBeNull();
    expect(
      Math.abs(after!.y - before!.y),
      'header moved while the body scrolled — it is not sticky',
    ).toBeLessThan(3);

    await shot(page, 'task3-sticky-header-scrolled');
  });

  test('Task 4 — Central/State Share show a figure for every funding source', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/funds-uc');
    await page.getByRole('tab', { name: /Project-wise/ }).click();

    const rows = page.getByTestId('project-fund-table').locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    const count = Math.min(await rows.count(), 15);
    expect(count, 'no projects to verify').toBeGreaterThan(0);

    const seen = new Map<string, string>();
    for (let i = 0; i < count; i += 1) {
      await rows.nth(i).click();
      const line = page.getByTestId('project-uc-status').getByText(/^Funding source:/);
      await expect(line).toBeVisible();
      const text = (await line.innerText()).replace(/\s+/g, ' ').trim();
      const m = /^Funding source: (.+?) · Central (\d+(?:\.\d+)?)% \/ State (\d+(?:\.\d+)?)%$/.exec(text);
      expect(m, `project ${i + 1} shows no Central / State split: "${text}"`).not.toBeNull();
      const [, source, central, state] = m!;
      if (!seen.has(source!)) seen.set(source!, `${central}% / ${state}%`);
    }

    // Every funding source present produced a figure, and the derived ones
    // read the way the funding source implies.
    for (const [source, value] of seen) {
      if (source === 'Central - EAP' || source === 'Central - Non-EAP') {
        expect(value, `${source} should be fully central`).toBe('100% / 0%');
      }
      if (source === 'State Funded') {
        expect(value, `${source} should be fully state`).toBe('0% / 100%');
      }
    }
    expect(seen.size, 'expected more than one funding source').toBeGreaterThan(1);

    await shot(page, 'task4-share-percentages');
  });
});
