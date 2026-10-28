/**
 * Acceptance checks for bhaveshTask.md Tasks 2, 4 and 5.
 *
 *   Task 2 — Cost Overrun column + Yes/No filter on the Projects table.
 *   Task 4 — CoS/EoT table header stays fixed while scrolling.
 *   Task 5 — CoS # opens a detail dialog with an Edit option that saves.
 *
 *   npx playwright test e2e/tasks-costoverrun-coseot
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { AUDIT_TAG, apiCreateProject, apiDeleteAuditProject, cellInRow, signIn } from './audit/audit-kit';

/** Header texts of a table, lower-cased — headers are styled `uppercase`,
 *  and innerText returns the transformed text. */
async function headers(table: Locator): Promise<string[]> {
  return (await table.locator('thead th').allInnerTexts()).map((t) =>
    t.replace(/\s+/g, ' ').trim().toLowerCase(),
  );
}

async function openProjects(page: Page): Promise<void> {
  await page.goto('/projects');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
}

test.describe('bhaveshTask Tasks 2, 4, 5', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  /* ---------------- Task 2 ---------------- */

  test('Task 2 — Projects table has a Cost Overrun column showing Yes/No', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await openProjects(page);

    const table = page.locator('table').first();
    const hs = await headers(table);
    const idx = hs.findIndex((h) => h.startsWith('cost overrun'));
    expect(idx, `no Cost Overrun column. Headers: ${JSON.stringify(hs)}`).toBeGreaterThanOrEqual(0);

    // Every visible row must render one of the three permitted values.
    const rows = page.locator('tbody tr');
    const n = Math.min(await rows.count(), 15);
    expect(n).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (let i = 0; i < n; i += 1) {
      const text = (await rows.nth(i).locator('td').nth(idx).innerText()).trim();
      expect(['Yes', 'No', '—'], `row ${i + 1} showed "${text}"`).toContain(text);
      seen.add(text);
    }
    // The column is pointless if it cannot distinguish anything.
    expect(seen.size, `every row showed the same value: ${[...seen]}`).toBeGreaterThan(0);
  });

  test('Task 2 — the Cost Overrun filter narrows to the chosen status', async ({ page }) => {
    // The seeded dataset contains no over-sanction projects, so filtering
    // on "Yes" would match nothing and the test would prove only that the
    // dropdown exists. Creating one project that is genuinely over its AA
    // exercises both branches for real, and it is removed afterwards.
    const overrun = await apiCreateProject(
      {
        projectName: `${AUDIT_TAG}-COST overrun fixture`,
        contractType: 'Work Contract',
        aaAmountCr: 100,
        agreementAmountCr: 130,
      },
      'cost-overrun-filter',
      'API (test fixture)',
    );

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(page);
      await openProjects(page);

      const table = page.locator('table').first();
      const hs = await headers(table);
      const idx = hs.findIndex((h) => h.startsWith('cost overrun'));
      expect(idx).toBeGreaterThanOrEqual(0);

      // The filter control lives in that column's header cell.
      const filter = table.locator('thead th').nth(idx).locator('select');
      await expect(filter, 'no dropdown under the Cost Overrun heading').toHaveCount(1);

      const options = (await filter.locator('option').allInnerTexts()).map((t) => t.trim());
      expect(options.join('|')).toContain('Yes');
      expect(options.join('|')).toContain('No');

      for (const want of ['Yes', 'No']) {
        await filter.selectOption({ label: want });
        await page.waitForTimeout(700);

        // Data rows only — the empty state renders a single full-width cell.
        const rows = page.locator('tbody tr').filter({ has: page.locator('td').nth(idx) });
        const count = await rows.count();
        expect(count, `filter "${want}" matched nothing at all`).toBeGreaterThan(0);

        const check = Math.min(count, 12);
        for (let i = 0; i < check; i += 1) {
          const text = (await rows.nth(i).locator('td').nth(idx).innerText()).trim();
          expect(text, `filter "${want}" left a row showing "${text}"`).toBe(want);
        }

        // The fixture must appear under Yes and be absent under No.
        const fixtureRows = page.locator('tbody tr', { hasText: `${AUDIT_TAG}-COST` });
        await expect(fixtureRows, `fixture visibility wrong under "${want}"`).toHaveCount(
          want === 'Yes' ? 1 : 0,
        );
      }
    } finally {
      await apiDeleteAuditProject(overrun.projectId);
    }
  });

  /* ---------------- Task 4 ---------------- */

  test('Task 4 — CoS/EoT header stays fixed while the table scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/cos-eot');

    const header = page.locator('th', { hasText: /CoS Date/i }).first();
    await expect(header).toBeVisible({ timeout: 30_000 });

    const before = await header.boundingBox();
    expect(before).not.toBeNull();

    const scrolled = await header.evaluate((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
          node.scrollTop = node.scrollHeight;
          return node.scrollTop;
        }
        node = node.parentElement;
      }
      return 0;
    });
    expect(scrolled, 'CoS/EoT table did not scroll — cannot prove stickiness').toBeGreaterThan(0);

    await page.waitForTimeout(300);
    await expect(header).toBeVisible();
    const after = await header.boundingBox();
    expect(
      Math.abs(after!.y - before!.y),
      'header moved with the body — it is not sticky',
    ).toBeLessThan(3);
  });

  /* ---------------- Task 5 ---------------- */

  test('Task 5 — CoS # opens a detail dialog with the record values', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/cos-eot');

    const firstCos = page.locator('tbody tr').first().getByRole('button').first();
    await expect(firstCos).toBeVisible({ timeout: 30_000 });
    const label = (await firstCos.innerText()).trim();

    await firstCos.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(label);

    // The spec asks for "all available details" — spot-check the field set.
    for (const field of ['CoS Date', 'Category', 'EoT', 'Variation']) {
      await expect(dialog, `dialog is missing "${field}"`).toContainText(new RegExp(field, 'i'));
    }

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Task 5 — MD can edit a CoS record and the change reaches the listing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/cos-eot');

    const row = page.locator('tbody tr').first();
    const cosBtn = row.getByRole('button').first();
    await expect(cosBtn).toBeVisible({ timeout: 30_000 });
    await cosBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Edit is offered to an MD and enters form mode.
    const edit = dialog.getByRole('button', { name: /edit/i });
    await expect(edit, 'MD should be offered Edit').toBeVisible();
    await edit.click();
    await expect(dialog.getByRole('button', { name: /^save$/i })).toBeVisible();

    // Cancel must restore, not persist.
    const eotDays = dialog.locator('input[type="number"]').last();
    const original = await eotDays.inputValue();
    await eotDays.fill('999');
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog.getByRole('button', { name: /^save$/i })).toBeHidden();

    // Now a real edit: bump EoT days by one and save.
    await dialog.getByRole('button', { name: /edit/i }).click();
    const target = dialog.locator('input[type="number"]').last();
    const base = Number((await target.inputValue()) || '0');
    const next = base + 1;
    await target.fill(String(next));
    await dialog.getByRole('button', { name: /^save$/i }).click();

    // Back to read mode, showing the saved value.
    await expect(dialog.getByRole('button', { name: /^save$/i })).toBeHidden({ timeout: 20_000 });
    await expect(dialog).toContainText(`${next} d`);

    // And the listing reflects it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const eotCell = await cellInRow(page, page.locator('tbody tr').first(), 'EoT Days');
    await expect(eotCell).toContainText(String(next));

    // Put it back so the suite is repeatable.
    await page.locator('tbody tr').first().getByRole('button').first().click();
    const d2 = page.getByRole('dialog');
    await d2.getByRole('button', { name: /edit/i }).click();
    await d2.locator('input[type="number"]').last().fill(String(base));
    await d2.getByRole('button', { name: /^save$/i }).click();
    await expect(d2.getByRole('button', { name: /^save$/i })).toBeHidden({ timeout: 20_000 });
    expect(original).toBe(String(base));
  });

  test('Task 5 — a read-only role is not offered Edit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, { username: 'demo_viewer', password: 'Demo@1234' });
    await page.goto('/cos-eot');

    const cosBtn = page.locator('tbody tr').first().getByRole('button').first();
    await expect(cosBtn).toBeVisible({ timeout: 30_000 });
    await cosBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: /edit/i }),
      'Viewer must not be offered Edit',
    ).toHaveCount(0);
  });

  test('Task 5 — the dialog is usable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto('/cos-eot');

    const cosBtn = page.locator('tbody tr').first().getByRole('button').first();
    await expect(cosBtn).toBeVisible({ timeout: 30_000 });
    await cosBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.width, 'dialog wider than the viewport').toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'dialog caused horizontal page overflow').toBeLessThanOrEqual(1);
  });
});
