/**
 * Responsive + runtime-health sweep across every authenticated page.
 *
 * Unlike login.spec.ts this suite talks to the REAL local backend, because
 * the whole point is to render real data at real widths. It signs in as the
 * seeded demo MD (the role that can see every page) and, at three viewports,
 * asserts:
 *   - the page has no horizontal overflow (the classic mobile-table break)
 *   - nothing threw at runtime (uncaught exceptions / failed requests)
 *   - the page actually rendered content rather than an error boundary
 *
 * Requires: backend on :4000 and `npm run db:seed-demo-roles`. It is kept
 * out of the default `npm run test:e2e` grep-free run only by its filename
 * suffix, so run it explicitly:  npx playwright test responsive.audit
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * Each of these tests signs in and then loads all 16 authenticated pages, so
 * one test does roughly sixteen tests' worth of work. Measured cold it takes
 * ~17s of page time, but inside the full serial suite — where every test
 * shares one dev server and one database — the third viewport was tipping
 * past the 60s suite default and failing on time rather than on any
 * assertion. The budget is raised to match the workload; every assertion
 * below is unchanged.
 */
test.setTimeout(180_000);

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const PAGES = [
  { path: '/', name: 'Overview' },
  { path: '/projects', name: 'Projects' },
  { path: '/schemes', name: 'Schemes' },
  { path: '/sectors', name: 'Sectors' },
  { path: '/districts', name: 'Districts' },
  { path: '/divisions', name: 'Divisions' },
  { path: '/input-sheet', name: 'Input Sheet' },
  { path: '/cos-eot', name: 'CoS/EoT' },
  { path: '/management-actions', name: 'Management Actions' },
  { path: '/gaps', name: 'Outstanding Gaps' },
  { path: '/pre-monsoon', name: 'Pre-Monsoon' },
  { path: '/funds-uc', name: 'Funds/UC' },
  { path: '/mom', name: 'MoM' },
  { path: '/om', name: 'O&M' },
  { path: '/audit', name: 'Audit Trail' },
  { path: '/users', name: 'User Management' },
] as const;

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill('demo_md');
  await page.getByLabel('Password').fill('Demo@1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 45_000 });
}

test.describe('Responsive + runtime sweep', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
      test(`no overflow or runtime errors on any page`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 200)}`);
        });

        await signIn(page);

        const overflowing: string[] = [];
        for (const p of PAGES) {
          await page.goto(p.path);
          // Let data land so tables reach full width before measuring.
          await page.waitForLoadState('networkidle').catch(() => undefined);
          // networkidle is best-effort — if it never settles we would sample
          // a half-rendered page and read an empty body. Wait for content to
          // actually exist before measuring anything.
          await expect
            .poll(
              async () => page.evaluate(() => (document.body.innerText || '').trim().length),
              { timeout: 15_000 },
            )
            .toBeGreaterThan(0);

          const metrics = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            bodyText: (document.body.innerText || '').trim().length,
          }));

          if (metrics.scrollWidth > metrics.clientWidth + 1) {
            overflowing.push(
              `${p.name} (${p.path}): scrollWidth ${metrics.scrollWidth} > viewport ${metrics.clientWidth}`,
            );
          }
          expect(metrics.bodyText, `${p.name} rendered no text`).toBeGreaterThan(0);
        }

        // Report everything at once rather than dying on the first page.
        expect(overflowing, `Horizontal overflow at ${vp.name}:\n${overflowing.join('\n')}`).toEqual([]);

        // Expected-by-design noise, excluded so a real fault stays visible:
        //  - 401: App.tsx probes /auth/refresh on boot; no cookie yet => 401.
        //  - 503: /api/uploads/* self-disables when UPLOADTHING_TOKEN is
        //    unset (see routes/uploads.ts), which is the norm locally.
        //  - React Router v7 future-flag deprecation warnings.
        const ignorable = [
          /status of 401/,
          /status of 503/,
          /React Router Future Flag/,
          /favicon/,
        ];
        const realErrors = errors.filter((e) => !ignorable.some((re) => re.test(e)));
        expect(realErrors, `Runtime errors at ${vp.name}:\n${realErrors.join('\n')}`).toEqual([]);
      });
    });
  }
});
