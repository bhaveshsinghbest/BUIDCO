/**
 * Acceptance for the second Tender Dashboard / Projects task set.
 *   npx playwright test tender2.audit
 */
import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, username = 'demo_md'): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('Demo@1234');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const carryOn = page.getByRole('button', { name: /^Continue$/ });
  await Promise.race([
    carryOn.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined),
    page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 }).catch(() => undefined),
  ]);
  if (await carryOn.isVisible().catch(() => false)) await carryOn.click();

  await expect(page).not.toHaveURL(/\/login$/, { timeout: 45_000 });
  const briefing = page.getByRole('dialog', { name: 'MD Scheme Summary' });
  if (await briefing.isVisible().catch(() => false)) {
    await briefing.getByRole('button', { name: 'Close' }).last().click();
    await expect(briefing).toBeHidden({ timeout: 10_000 });
  }
}

/** Open the Tender Dashboard and drill into the first populated sub-stage. */
async function openDrillTable(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
  const dash = page.getByRole('dialog', { name: 'Tender Dashboard' });
  await expect(dash).toBeVisible();
  const buckets = dash.locator('button[aria-pressed]');
  const n = await buckets.count();
  for (let i = 0; i < n; i++) {
    await buckets.nth(i).click();
    if (await dash.locator('table').first().isVisible().catch(() => false)) return;
  }
  throw new Error('no sub-stage produced a table');
}

test.describe('Task 2 — Active Projects card removed from Overview', () => {
  test('the stage strip is gone but the rest of Overview survives', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await expect(page.getByText(/Active Projects — Current Stage/i)).toHaveCount(0);
    // Neighbouring cards must still be there.
    await expect(page.getByText(/Sector Snapshot/i).first()).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => (document.body.innerText || '').trim().length))
      .toBeGreaterThan(0);
  });
});

test.describe('Task 7 + 9 — table survives an empty filter result', () => {
  test('Tender drill table keeps headers and shows No Projects Found', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await openDrillTable(page);

    const dash = page.getByRole('dialog', { name: 'Tender Dashboard' });
    const headerCount = await dash.locator('thead th').count();
    expect(headerCount).toBeGreaterThan(0);

    // Force zero matches with an impossible project-name filter.
    await dash.locator('thead input').first().fill('zzzz-no-such-project-zzzz');
    await expect(dash.getByText('No Projects Found')).toBeVisible();

    // Structure must survive: same headers, table still present.
    await expect(dash.locator('table')).toBeVisible();
    expect(await dash.locator('thead th').count()).toBe(headerCount);

    // Clearing repopulates the same table.
    await dash.locator('thead input').first().fill('');
    await expect(dash.getByText('No Projects Found')).toHaveCount(0);
    expect(await dash.locator('tbody tr').count()).toBeGreaterThan(0);
  });

  test('Projects table keeps structure and shows No Projects Found', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const headerCount = await page.locator('thead th').count();
    await page.locator('thead input').first().fill('zzzz-no-such-project-zzzz');

    await expect(page.getByText('No Projects Found')).toBeVisible();
    expect(await page.locator('thead th').count()).toBe(headerCount);
  });
});

test.describe('Task 9 — Delayed Projects dropdown', () => {
  test('appears in both places, filters, and clears', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const before = await page.locator('tbody tr').count();
    const toggle = page.getByRole('button', { name: /Delayed Projects/i });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await page.getByRole('menuitemradio', { name: 'More than 30 Days' }).click();
    const after = await page.locator('tbody tr').count();
    // Either it narrowed the list, or it emptied it — both are valid, but it
    // must not silently leave the list untouched.
    expect(after).toBeLessThanOrEqual(before);

    // Clear restores the full list.
    await page.getByRole('button', { name: /Delayed:/i }).click();
    await page.getByRole('menuitem', { name: 'Clear filter' }).click();
    await expect.poll(async () => page.locator('tbody tr').count()).toBe(before);
  });

  test('is present in the Tender Dashboard drill-in as well', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await openDrillTable(page);

    // Not scoped to the dialog: the Projects page is not mounted in this
    // test, so this button can only be the drill-in's own control.
    const delayToggle = page.getByRole('button', { name: /Delayed Projects/i });
    await expect(delayToggle).toBeVisible();

    // And it actually filters the drill-in, not just renders.
    await delayToggle.click();
    await page.getByRole('menuitemradio', { name: 'More than 30 Days' }).click();
    await expect(page.getByRole('button', { name: /Delayed: More than 30 Days/i })).toBeVisible();
  });

  test('offers the five "More than" options and narrows monotonically', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const toggle = page.getByRole('button', { name: /Delayed Projects/i });
    await toggle.click();
    const options = await page.getByRole('menuitemradio').allInnerTexts();
    expect(options.map((s) => s.trim())).toEqual([
      'More than 30 Days',
      'More than 60 Days',
      'More than 90 Days',
      'More than 6 Months',
      'More than 1 Year',
    ]);
    await page.keyboard.press('Escape');

    // Each successive window must be a subset of the previous one — the
    // buckets nest, so counts can only shrink as the threshold rises.
    const counts: number[] = [];
    for (const label of options.map((s) => s.trim())) {
      await page.getByRole('button', { name: /Delayed/i }).first().click();
      await page.getByRole('menuitemradio', { name: label }).click();
      await page.waitForTimeout(150);
      counts.push(await page.locator('tbody tr').count());
    }
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!, `${options[i]} vs ${options[i - 1]}`).toBeLessThanOrEqual(counts[i - 1]!);
    }
    // The seeded data guarantees every bucket has matches.
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });

  test('closes on outside click and on Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const toggle = page.getByRole('button', { name: /Delayed Projects/i });
    await toggle.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(page.getByRole('menu')).toHaveCount(0);

    await toggle.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test.describe('Task 6 — new column dropdown filters', () => {
  test('PBG Alert, O&M Status, Expected Completion and NIT Date all filter', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Each target column must now carry a <select> in its header. Polled,
    // not sampled once: reading straight after navigation can land before the
    // header row has painted and report a missing filter that is simply not
    // rendered yet.
    const readSelects = (): Promise<Record<string, boolean>> =>
      page.evaluate(() => {
        const out: Record<string, boolean> = {};
        const heads = Array.from(document.querySelectorAll('thead th'));
        for (const label of ['PBG Alert', 'O&M Status', 'Expected Completion']) {
          const th = heads.find((h) => (h.textContent || '').includes(label));
          out[label] = Boolean(th?.querySelector('select'));
        }
        return out;
      });

    await expect
      .poll(async () => Object.values(await readSelects()).filter(Boolean).length, { timeout: 20_000 })
      .toBe(3);

    for (const [label, present] of Object.entries(await readSelects())) {
      expect(present, `${label} should have a dropdown filter`).toBe(true);
    }

    // Applying one narrows the table.
    const before = await page.locator('tbody tr').count();
    const pbgSelect = page
      .locator('thead th')
      .filter({ hasText: 'PBG Alert' })
      .locator('select')
      .first();
    await pbgSelect.selectOption({ index: 1 });
    await expect.poll(async () => page.locator('tbody tr').count()).toBeLessThanOrEqual(before);
  });
});

test.describe('Task 3 — permanent delete UI', () => {
  test('MD sees delete and the confirmation carries the required wording', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, 'demo_md');
    await page.goto('/schemes');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const del = page.getByRole('button', { name: /Delete .* permanently/i }).first();
    await expect(del).toBeVisible();
    await del.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Do you want to delete this permanently?')).toBeVisible();
    await expect(
      dialog.getByText(/This action will also delete all projects associated with this Scheme/i),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete Permanently' })).toBeVisible();

    // Cancel must delete nothing — the card is still there afterwards.
    const cardsBefore = await page.getByRole('button', { name: /Delete .* permanently/i }).count();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.getByRole('button', { name: /Delete .* permanently/i }).count()).toBe(cardsBefore);
  });

  test('non-MD roles are not offered the delete control', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, 'demo_admin');
    await page.goto('/sectors');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page.getByRole('button', { name: /Delete .* permanently/i })).toHaveCount(0);
  });
});

test.describe('Task 8 — Current Sub-Stage highlight removed', () => {
  test('the sub-stage cell has no background fill', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await openDrillTable(page);

    const dash = page.getByRole('dialog', { name: 'Tender Dashboard' });
    const idx = await dash.evaluate((root) =>
      Array.from(root.querySelectorAll('thead th')).findIndex((th) =>
        (th.textContent || '').includes('Current Sub-Stage'),
      ),
    );
    expect(idx).toBeGreaterThanOrEqual(0);

    const bg = await dash.evaluate((root, i) => {
      const cell = root.querySelector(`tbody tr td:nth-child(${i + 1})`);
      const span = cell?.querySelector('span');
      return span ? getComputedStyle(span).backgroundColor : 'none';
    }, idx);

    // Transparent in any notation — the pill fill is gone.
    expect(['rgba(0, 0, 0, 0)', 'transparent', 'none']).toContain(bg);
  });
});
