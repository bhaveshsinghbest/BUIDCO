/**
 * Phase 5 (UI/UX) + Phase 9 (responsive) sweep.
 *
 * Visits every routed page at desktop, tablet and mobile widths and checks
 * the things that are cheap to get wrong and expensive to notice late:
 * the page actually rendered, it did not blow up, and it does not scroll
 * sideways. Horizontal overflow belongs to the inner table scroller, never
 * to the document.
 *
 *   npx playwright test e2e/qa-responsive-sweep
 */
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './audit/audit-kit';

const PAGES: { path: string; name: string }[] = [
  { path: '/', name: 'overview' },
  { path: '/sectors', name: 'sectors' },
  { path: '/schemes', name: 'schemes' },
  { path: '/projects', name: 'projects' },
  { path: '/divisions', name: 'divisions' },
  { path: '/cos-eot', name: 'cos-eot' },
  { path: '/management-actions', name: 'mgmt-actions' },
  { path: '/gaps', name: 'gaps' },
  { path: '/pre-monsoon', name: 'pre-monsoon' },
  { path: '/funds-uc', name: 'funds-uc' },
  { path: '/mom', name: 'mom' },
  { path: '/om', name: 'om' },
  { path: '/audit', name: 'audit' },
  { path: '/users', name: 'users' },
  { path: '/input-sheet', name: 'input-sheet' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

/** Console errors worth failing on — ignore known third-party noise. */
function isRealError(text: string): boolean {
  const ignore = [
    'Download the React DevTools',
    'React Router Future Flag',
    'Failed to load resource', // surfaced separately as a network check
  ];
  return !ignore.some((i) => text.includes(i));
}

test.describe('QA sweep — every page, every breakpoint', () => {
  test.describe.configure({ mode: 'serial', timeout: 900_000 });

  for (const vp of VIEWPORTS) {
    test(`${vp.name} (${vp.width}px) — all pages render without layout breakage`, async ({ page }) => {
      const problems: string[] = [];
      const consoleErrors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && isRealError(m.text())) consoleErrors.push(m.text());
      });
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signIn(page);

      for (const p of PAGES) {
        consoleErrors.length = 0;
        await page.goto(p.path, { waitUntil: 'domcontentloaded' });
        // Let data queries settle; these pages all fetch on mount.
        await page.waitForTimeout(1200);

        // 1. Something actually rendered.
        const bodyText = (await page.locator('body').innerText()).trim();
        if (bodyText.length < 20) problems.push(`${p.name}: page appears blank`);

        // 2. No error boundary / crash text.
        if (/something went wrong|unexpected error|cannot read propert/i.test(bodyText)) {
          problems.push(`${p.name}: error text on screen`);
        }

        // 3. The document must not scroll sideways.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) problems.push(`${p.name}: horizontal page overflow ${overflow}px`);

        // 4. No uncaught runtime errors while rendering it.
        if (consoleErrors.length > 0) {
          problems.push(`${p.name}: console error — ${consoleErrors[0]?.slice(0, 120)}`);
        }
      }

      expect(problems, `layout/runtime problems at ${vp.name}:\n${problems.join('\n')}`).toEqual([]);
    });
  }
});
