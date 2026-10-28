/**
 * Insurance validity tracking — UI acceptance (bhaveshTask.md Tasks 7-10).
 *
 *   Task 7 — the five fields exist in Contract & Security and save.
 *   Task 8 — the dashboard card counts what the API reports.
 *   Task 9 — the table column mirrors the PBG badge conventions.
 *   Task 10 — the expiry scenarios render correctly.
 *
 *   npx playwright test e2e/insurance
 */
import { expect, test, type Page } from '@playwright/test';
import {
  AUDIT_TAG,
  apiContext,
  apiCreateProject,
  apiDeleteAuditProject,
  cellInRow,
  gotoProjectsFiltered,
  projectRow,
  signIn,
} from './audit/audit-kit';

/** YYYY-MM-DD for today ± n days, local time. */
function day(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SCENARIOS = [
  { key: 'EXPIRED', offset: -1, badge: '—' },
  { key: 'IN7', offset: 7, badge: 'Expiring in 7d' },
  { key: 'IN30', offset: 30, badge: 'Expiring in 30d' },
  { key: 'VALID', offset: 90, badge: '—' },
] as const;

const created: string[] = [];

test.describe('Insurance validity tracking', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test.beforeAll(async () => {
    for (const s of SCENARIOS) {
      const p = await apiCreateProject(
        {
          projectName: `${AUDIT_TAG}-INS ${s.key}`,
          contractType: 'Work Contract',
          insurancePolicyNo: `POL/${s.key}/1`,
          insurer: 'Test General Insurance Co.',
          insuredAmountCr: 7.5,
          insuranceStartDate: day(-365),
          insuranceExpiryDate: day(s.offset),
        },
        'insurance-ui',
        'API (test fixture)',
      );
      created.push(p.projectId);
    }
  });

  test.afterAll(async () => {
    for (const id of created) await apiDeleteAuditProject(id);
  });

  /* ---------------- Task 9 ---------------- */

  test('Task 9 — Insurance Alert column sits beside PBG and uses the same badges', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await gotoProjectsFiltered(page, `${AUDIT_TAG}-INS`);

    const table = page.locator('table').first();
    const headers = (await table.locator('thead th').allInnerTexts()).map((t) =>
      t.replace(/\s+/g, ' ').trim().toLowerCase(),
    );
    const insIdx = headers.findIndex((h) => h.startsWith('insurance alert'));
    const pbgIdx = headers.findIndex((h) => h.startsWith('pbg alert'));
    expect(insIdx, `no Insurance Alert column. Headers: ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(0);
    expect(pbgIdx, 'PBG Alert column disappeared — regression').toBeGreaterThanOrEqual(0);
    // "next to the existing PBG alert column"
    expect(Math.abs(insIdx - pbgIdx), 'Insurance column is not adjacent to PBG').toBe(1);

    for (const s of SCENARIOS) {
      const row = projectRow(page, `${AUDIT_TAG}-INS ${s.key}`);
      await expect(row).toBeVisible();
      const cell = await cellInRow(page, row, 'Insurance Alert');
      await expect(cell, `${s.key} rendered the wrong badge`).toHaveText(s.badge);
    }
  });

  test('Task 9 — the Insurance Alert column filters', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await gotoProjectsFiltered(page, `${AUDIT_TAG}-INS`);

    const table = page.locator('table').first();
    const headers = (await table.locator('thead th').allInnerTexts()).map((t) =>
      t.replace(/\s+/g, ' ').trim().toLowerCase(),
    );
    const idx = headers.findIndex((h) => h.startsWith('insurance alert'));
    const filter = table.locator('thead th').nth(idx).locator('select');
    await expect(filter, 'no dropdown under Insurance Alert').toHaveCount(1);

    await filter.selectOption({ label: 'Expired' });
    await page.waitForTimeout(600);
    await expect(projectRow(page, `${AUDIT_TAG}-INS EXPIRED`)).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: `${AUDIT_TAG}-INS IN7` })).toHaveCount(0);
  });

  /* ---------------- Task 8 ---------------- */

  test('Task 8 — the dashboard card count matches the alerts API', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/');

    const card = page
      .locator('h3')
      .filter({ hasText: /Insurance Expiring/i })
      .first()
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await expect(card, 'Insurance Expiring card not on the dashboard').toBeVisible({ timeout: 30_000 });

    // The PBG card must still be there, beside it.
    await expect(page.locator('h3').filter({ hasText: /PBG Expiring/i })).toHaveCount(1);

    await page.waitForTimeout(1200);
    const cardText = await card.innerText();

    // Count straight from the API the card reads.
    const { api, token } = await apiContext();
    const res = await api.get('/api/kpis/insurance-expiry-alerts', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const items = ((await res.json()) as { items: unknown[] }).items ?? [];

    if (items.length === 0) {
      expect(cardText).toMatch(/All clear/i);
    } else {
      expect(cardText, `card badge should report ${items.length}`).toContain(String(items.length));
    }

    // Our two in-window fixtures must be listed by name.
    for (const key of ['IN7', 'IN30']) {
      expect(cardText, `${key} missing from the card`).toContain(`${AUDIT_TAG}-INS ${key}`);
    }
    // And the out-of-window ones must not be.
    for (const key of ['EXPIRED', 'VALID']) {
      expect(cardText, `${key} should not be on the card`).not.toContain(`${AUDIT_TAG}-INS ${key}`);
    }
  });

  /* ---------------- Task 7 ---------------- */

  test('Task 7 — the five fields are in Contract & Security and persist', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto(`/input-sheet/${created[0]}`);
    await page.getByRole('tab', { name: /ALL Fields/i }).click();

    const policy = page.getByLabel('Insurance Policy Number');
    await expect(policy, 'Insurance fields missing from the form').toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Insurer')).toBeVisible();
    await expect(page.getByLabel(/^Insured Amount/)).toBeVisible();
    await expect(page.getByLabel('Insurance Start Date')).toBeVisible();
    await expect(page.getByLabel('Insurance Expiry Date')).toBeVisible();

    // Edit and save.
    await policy.fill('POL/EDITED/9');
    await page.getByLabel('Insurer').fill('Edited Insurer Ltd.');
    await page.getByRole('button', { name: /Save Changes/i }).first().click();
    await expect(page.getByText('Project updated.')).toBeVisible({ timeout: 30_000 });

    // Reload and confirm it stuck.
    await page.reload();
    await page.getByRole('tab', { name: /ALL Fields/i }).click();
    await expect(page.getByLabel('Insurance Policy Number')).toHaveValue('POL/EDITED/9');
    await expect(page.getByLabel('Insurer')).toHaveValue('Edited Insurer Ltd.');
  });

  test('Task 7 — expiry before start is rejected before saving', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto(`/input-sheet/${created[0]}`);
    await page.getByRole('tab', { name: /ALL Fields/i }).click();

    await page.getByLabel('Insurance Start Date').fill(day(60));
    await page.getByLabel('Insurance Expiry Date').fill(day(10));
    await expect(
      page.getByText(/Expiry date cannot be before the start date/i),
      'no inline warning for inverted dates',
    ).toBeVisible();
  });

  /* ---------------- responsive ---------------- */

  test('insurance UI holds up at tablet and mobile widths', async ({ page }) => {
    await signIn(page);
    for (const [w, h] of [[768, 1024], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await expect(page.locator('h3').filter({ hasText: /Insurance Expiring/i })).toBeVisible({
        timeout: 30_000,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `dashboard scrolls sideways at ${w}px`).toBeLessThanOrEqual(1);
    }
  });
});
