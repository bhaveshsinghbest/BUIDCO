/**
 * Acceptance checks for the bhaveshTask.md changes.
 *
 * Runs against the REAL local backend with the seeded demo MD, because each
 * of these is about how real data lands on screen. Run explicitly:
 *   npx playwright test tasks.audit
 */
import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill('demo_md');
  await page.getByLabel('Password').fill('Demo@1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 45_000 });

  // An explicit MD sign-in opens the Portfolio Briefing over the whole app
  // (authSlice.openMdBriefing). That is intended behaviour, but it covers the
  // sidebar — dismiss it so these tests can reach the nav.
  const briefing = page.getByRole('dialog', { name: 'MD Scheme Summary' });
  if (await briefing.isVisible().catch(() => false)) {
    // Two controls are named "Close": the full-viewport backdrop (first in
    // DOM) and the header button. The backdrop's centre sits under the modal
    // panel, so clicking it is intercepted — take the header one.
    await briefing.getByRole('button', { name: 'Close' }).last().click();
    await expect(briefing).toBeHidden({ timeout: 10_000 });
  }
}

test.describe('Task 5 — Tender Dashboard keeps the left nav', () => {
  test('sidebar stays visible and usable with the dashboard open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    const sidebar = page.getByRole('complementary', { name: 'Primary navigation' });
    await expect(sidebar).toBeVisible();

    await page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
    await expect(page.getByRole('dialog', { name: 'Tender Dashboard' })).toBeVisible();

    // The whole point of the fix: the nav survives the panel opening.
    await expect(sidebar).toBeVisible();

    // And the panel is docked clear of it, not painted over it.
    const navBox = await sidebar.boundingBox();
    const panelBox = await page.getByRole('dialog', { name: 'Tender Dashboard' }).boundingBox();
    expect(navBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.x).toBeGreaterThanOrEqual(navBox!.x + navBox!.width - 1);
  });

  test('collapse still works while the dashboard is open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    await page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
    await expect(page.getByRole('dialog', { name: 'Tender Dashboard' })).toBeVisible();

    const panel = page.getByRole('dialog', { name: 'Tender Dashboard' });
    const before = (await panel.boundingBox())!.x;

    await page.getByRole('button', { name: /Collapse sidebar/i }).click();
    // Width transition is 200ms.
    await page.waitForTimeout(400);

    const after = (await panel.boundingBox())!.x;
    expect(after).toBeLessThan(before);
  });

  /**
   * Below `lg` the sidebar is an off-canvas drawer reached via the hamburger,
   * and the panel is a sibling of the app shell — so it paints above the shell
   * whatever z-indexes TopNav and Sidebar use. It used to cover the top bar
   * outright, which left no way to open the left nav at all while the
   * dashboard was up, even though every other section worked fine.
   */
  test('below lg the top bar stays reachable and the drawer still opens', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await signIn(page);

    const burger = page.getByRole('button', { name: /open navigation|menu/i }).first();
    await burger.click();
    await page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
    await expect(page.getByRole('dialog', { name: 'Tender Dashboard' })).toBeVisible();

    // The panel must sit below the 50px top bar, not on top of it.
    const panelBox = await page.getByRole('dialog', { name: 'Tender Dashboard' }).boundingBox();
    expect(panelBox!.y).toBeGreaterThanOrEqual(50);

    // The hamburger must still be clickable, and reveal a usable nav.
    await burger.click({ timeout: 5000 });
    const sidebar = page.getByRole('complementary', { name: 'Primary navigation' });
    await expect(sidebar).toBeVisible();
    // The drawer slides in over 200ms — poll until it has settled flush left
    // rather than catching it mid-transition.
    await expect
      .poll(async () => Math.round((await sidebar.boundingBox())?.x ?? -999))
      .toBe(0);

    await page.getByRole('link', { name: /^Projects$/ }).click();
    await expect(page).toHaveURL(/\/projects/);
  });

  test('the Tender Dashboard item is the only one highlighted while open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
    await expect(page.getByRole('dialog', { name: 'Tender Dashboard' })).toBeVisible();

    // Poll rather than sample once: these items carry `transition-colors`, so
    // reading immediately catches an interpolated background mid-animation.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const aside = document.querySelector('aside[aria-label="Primary navigation"]')!;
          const ACTIVE = 'rgb(30, 58, 95)';
          return Array.from(aside.querySelectorAll('a,button'))
            // The mobile-only Quick Actions cluster is `lg:hidden` but still
            // in the DOM with its own dark background — count only what is
            // actually rendered at this breakpoint.
            .filter((el) => el.getClientRects().length > 0)
            .filter((el) => getComputedStyle(el).backgroundColor === ACTIVE)
            .map((el) => (el.textContent || '').trim());
        }),
      )
      // Exactly one item reads as current, and it is the Tender Dashboard —
      // the underlying route's link steps back while the panel owns the view.
      .toEqual(['Tender Dashboard']);

    const ariaCurrent = await page.evaluate(() => {
      const aside = document.querySelector('aside[aria-label="Primary navigation"]')!;
      const tender = Array.from(aside.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Tender Dashboard'),
      );
      return tender?.getAttribute('aria-current') ?? null;
    });
    expect(ariaCurrent).toBe('true');
  });

  /**
   * The sidebar sized itself against a hard-coded 50px top bar, but TopNav
   * renders two rows (~100px), so it hung ~50px past the bottom of the screen
   * and its last items were unreachable — indistinguishable from a sidebar
   * that won't scroll.
   */
  test('sidebar fits the viewport and its nav scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 560 });
    await signIn(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
    await expect(page.getByRole('dialog', { name: 'Tender Dashboard' })).toBeVisible();

    const m = await page.evaluate(() => {
      const aside = document.querySelector('aside[aria-label="Primary navigation"]') as HTMLElement;
      const nav = aside.querySelector('nav[aria-label="Primary"]') as HTMLElement;
      const header = document.querySelector('header.sticky') as HTMLElement;
      const ar = aside.getBoundingClientRect();
      return {
        overhang: Math.round(ar.bottom - window.innerHeight),
        asideTop: Math.round(ar.top),
        realTopNavH: Math.round(header.getBoundingClientRect().height),
        navScrolls: nav.scrollHeight > nav.clientHeight,
        navMinHeight: getComputedStyle(nav).minHeight,
      };
    });

    expect(m.overhang).toBeLessThanOrEqual(0);
    expect(m.asideTop).toBe(m.realTopNavH);
    expect(m.navScrolls).toBe(true);
    expect(m.navMinHeight).toBe('0px');

    // Every item must be reachable by scrolling the nav.
    const last = page.getByRole('button', { name: /Tender Dashboard/i }).first();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
  });

  test('navigating from the sidebar closes the dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    await page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
    await expect(page.getByRole('dialog', { name: 'Tender Dashboard' })).toBeVisible();

    await page.getByRole('link', { name: /^Projects$/ }).click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByRole('dialog', { name: 'Tender Dashboard' })).toHaveCount(0);
  });
});

/**
 * Task 2 names two routes to the project details view, and they land on
 * DIFFERENT components: the Projects table and the Tender Dashboard both open
 * ProjectProfileModal, while /projects/:id renders ProjectDetailPage. All
 * three have to be clear of the Milestones section.
 */
test.describe('Task 2 — Milestones removed from project details', () => {
  test('via Projects table → project profile modal', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const firstRow = page.locator('tbody tr').first();
    await firstRow.waitFor();
    await firstRow.click();
    const modal = page.getByRole('dialog').first();
    await modal.waitFor();
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await expect(modal.getByText(/^Milestones/)).toHaveCount(0);
    // The sibling resource cards must survive the removal.
    await expect(modal.getByText(/CoS \/ EoT/).first()).toBeVisible();
    await expect(modal.getByText(/Management Actions/).first()).toBeVisible();
  });

  test('via Tender Dashboard → project', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    await page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
    const dash = page.getByRole('dialog', { name: 'Tender Dashboard' });
    await expect(dash).toBeVisible();
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Pick the first stage bucket that actually holds projects, then open one.
    const buckets = dash.locator('button[aria-pressed]');
    const count = await buckets.count();
    let opened = false;
    for (let i = 0; i < count; i++) {
      await buckets.nth(i).click();
      const projectLink = dash.locator('button[title="Open project details"]').first();
      if (await projectLink.isVisible().catch(() => false)) {
        await projectLink.click();
        opened = true;
        break;
      }
    }
    expect(opened, 'no tender stage had a project to open').toBe(true);

    const profile = page.getByRole('dialog').last();
    await profile.waitFor();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(profile.getByText(/^Milestones/)).toHaveCount(0);
  });

  test('via /projects/:id detail page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    await page.goto('/projects/c6515768-d278-453f-9242-688b60834a71');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await expect(page.getByRole('heading', { name: /^Milestones/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Geo-tagged Photos/ })).toBeVisible();
  });
});

test.describe('Task 7 — Outstanding Gap wraps inside its column', () => {
  test('long gap text does not push the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // The table scrolls in its own container; the document must not.
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
  });

  test('the gap cell is width-capped and wraps rather than running on', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const gapCell = page
      .locator('td')
      .filter({ hasText: /No outstanding issues|Escalated to|blocking/ })
      .first();
    await gapCell.waitFor();

    // The cell must allow wrapping...
    const cellWhiteSpace = await gapCell.evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(cellWhiteSpace).not.toBe('nowrap');

    // ...and the cap lives on the content, because `table-layout: auto`
    // ignores max-width on the <td> itself.
    const chip = gapCell.locator('span').first();
    const chipStyle = await chip.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { maxWidth: cs.maxWidth, width: el.getBoundingClientRect().width };
    });
    expect(chipStyle.maxWidth).not.toBe('none');
    expect(chipStyle.width).toBeLessThanOrEqual(300);
  });
});

/**
 * Reads the six status blocks on the Division page as {label: count}.
 *
 * Polls rather than sampling once: a single `evaluate` immediately after
 * navigation can land before React has painted the cards, yielding `{}` and
 * failing on "missing block" for what is really a timing issue. Waits for the
 * full set so callers always get a complete, settled reading.
 */
async function readStatusBlocks(page: Page, expected = 6): Promise<Record<string, number>> {
  const read = (): Promise<Record<string, number>> =>
    page.evaluate(() => {
      const out: Record<string, number> = {};
      for (const btn of Array.from(document.querySelectorAll('button[aria-pressed]'))) {
        const label = btn.querySelector('div:nth-child(1)')?.textContent?.trim() ?? '';
        const value = btn.querySelector('div:nth-child(2)')?.textContent?.trim() ?? '';
        // Region chips also carry aria-pressed; only the metric blocks have a
        // pure-numeric second line.
        if (label && /^\d+$/.test(value)) out[label] = Number(value);
      }
      return out;
    });

  await expect
    .poll(async () => Object.keys(await read()).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(expected);

  return read();
}

test.describe('Division section — status blocks and region scoping', () => {
  test('shows all six status blocks and the statuses sum to the total', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/divisions');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const blocks = await readStatusBlocks(page);
    const labels = Object.keys(blocks).map((l) => l.toUpperCase());
    for (const expected of [
      'TOTAL PROJECTS', 'COMPLETED', 'DELAYED', 'NOT STARTED', 'IN PROGRESS', 'ON HOLD',
    ]) {
      expect(labels, `missing block: ${expected}`).toContain(expected);
    }

    const get = (name: string): number =>
      Object.entries(blocks).find(([k]) => k.toUpperCase() === name)?.[1] ?? -1;

    // Every project has exactly one status, so the five must reconcile.
    const sum = get('COMPLETED') + get('DELAYED') + get('NOT STARTED')
      + get('IN PROGRESS') + get('ON HOLD');
    expect(sum).toBe(get('TOTAL PROJECTS'));
  });

  test('selecting a region rescopes the blocks and the drill-in', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/divisions');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const all = await readStatusBlocks(page);
    const totalAll = Object.entries(all).find(([k]) => k.toUpperCase() === 'TOTAL PROJECTS')?.[1] ?? 0;
    expect(totalAll).toBeGreaterThan(0);

    const perRegion: Record<string, number> = {};
    for (const region of ['North Bihar', 'South Bihar']) {
      await page.getByRole('button', { name: new RegExp(region) }).first().click();
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const blocks = await readStatusBlocks(page);
      const get = (name: string): number =>
        Object.entries(blocks).find(([k]) => k.toUpperCase() === name)?.[1] ?? -1;

      const total = get('TOTAL PROJECTS');
      perRegion[region] = total;

      // Scoped, not portfolio-wide, and still internally consistent.
      expect(total, `${region} should be a subset of ${totalAll}`).toBeLessThan(totalAll);
      const sum = get('COMPLETED') + get('DELAYED') + get('NOT STARTED')
        + get('IN PROGRESS') + get('ON HOLD');
      expect(sum, `${region} statuses must sum to its total`).toBe(total);

      // The table below the blocks must contain only this region's projects.
      await page.getByRole('button', { name: /Total projects/i }).first().click();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await expect(page.getByText(new RegExp(`All projects · ${region}`))).toBeVisible();
      const rows = await page.locator('tbody tr').count();
      expect(rows, `${region} drill-in row count`).toBe(total);

      // Collapse the drill-in and the region before the next iteration.
      await page.getByRole('button', { name: /Total projects/i }).first().click();
      await page.getByRole('button', { name: new RegExp(region) }).first().click();
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }

    // The two regions partition the portfolio — no project counted twice.
    expect(perRegion['North Bihar']! + perRegion['South Bihar']!).toBe(totalAll);
  });
});

test.describe('Task 4 — remark colour coding', () => {
  test('different remark meanings render in different colours', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const clear = page.locator('td span').filter({ hasText: /No outstanding issues/ }).first();
    const attention = page.locator('td span').filter({ hasText: /Escalated to/ }).first();
    await clear.waitFor();
    await attention.waitFor();

    const colourOf = (el: Element): string => getComputedStyle(el).color;
    const clearColour = await clear.evaluate(colourOf);
    const attentionColour = await attention.evaluate(colourOf);

    expect(clearColour).not.toBe(attentionColour);
  });
});
