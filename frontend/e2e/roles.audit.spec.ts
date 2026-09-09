/**
 * UAT — each role's real journey through the app.
 *
 * Complements the API-level RBAC checks: those prove the server refuses
 * unauthorised calls, these prove the UI doesn't offer them in the first
 * place and that each role can actually do its job.
 *
 * Runs against the real backend with the seeded demo accounts.
 *   npx playwright test roles.audit
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'Demo@1234';

async function signIn(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // PD sign-in is a two-step handshake: credentials verify, then a division
  // picker appears and must be confirmed. Race the picker against the
  // redirect rather than sampling once — polling the combobox too early
  // silently skipped the second step and left the test sitting on /login.
  const carryOn = page.getByRole('button', { name: /^Continue$/ });
  await Promise.race([
    carryOn.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
    page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20_000 }).catch(() => undefined),
  ]);
  if (await carryOn.isVisible().catch(() => false)) {
    await carryOn.click();
  }

  await expect(page).not.toHaveURL(/\/login$/, { timeout: 45_000 });

  const briefing = page.getByRole('dialog', { name: 'MD Scheme Summary' });
  if (await briefing.isVisible().catch(() => false)) {
    await briefing.getByRole('button', { name: 'Close' }).last().click();
    await expect(briefing).toBeHidden({ timeout: 10_000 });
  }
}

/** Pages every signed-in role should be able to open. */
const COMMON_PAGES = ['/', '/projects', '/sectors', '/schemes', '/cos-eot', '/funds-uc', '/mom'];

for (const { username, role, canSeeAudit, canSeeDivisions } of [
  { username: 'demo_md', role: 'MD', canSeeAudit: true, canSeeDivisions: true },
  { username: 'demo_admin', role: 'Admin', canSeeAudit: true, canSeeDivisions: true },
  { username: 'demo_viewer', role: 'Viewer', canSeeAudit: false, canSeeDivisions: true },
  { username: 'demo_pd', role: 'PD', canSeeAudit: false, canSeeDivisions: false },
]) {
  test(`${role} can sign in and use the app`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

    await signIn(page, username);

    // Every common page renders real content for this role.
    for (const path of COMMON_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await expect
        .poll(
          async () => page.evaluate(() => (document.body.innerText || '').trim().length),
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0);
      // An unhandled error boundary or a bounce back to /login would both
      // mean this role cannot actually work here.
      await expect(page, `${role} was bounced from ${path}`).not.toHaveURL(/\/login$/);
    }

    // Audit Trail is MD/Admin only — the nav must not offer it otherwise.
    const auditLink = page.getByRole('link', { name: /Audit Trail/i });
    if (canSeeAudit) {
      await expect(auditLink.first()).toBeVisible();
    } else {
      await expect(auditLink).toHaveCount(0);
    }

    // PDs are pinned to one division, so portfolio-wide Divisions is hidden.
    const divisionsLink = page.getByRole('link', { name: /^Divisions$/ });
    if (canSeeDivisions) {
      await expect(divisionsLink.first()).toBeVisible();
    } else {
      await expect(divisionsLink).toHaveCount(0);
    }

    expect(errors, `${role} hit runtime errors:\n${errors.join('\n')}`).toEqual([]);
  });
}

test('PD sees only their own division’s projects', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await signIn(page, 'demo_md');
  await page.goto('/projects');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const mdRows = await page.locator('tbody tr').count();

  await page.goto('/login');
  await page.evaluate(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  });
  await page.context().clearCookies();

  await signIn(page, 'demo_pd');
  await page.goto('/projects');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const pdRows = await page.locator('tbody tr').count();

  expect(pdRows).toBeGreaterThan(0);
  expect(pdRows, 'PD must see a strict subset of the portfolio').toBeLessThan(mdRows);
});
