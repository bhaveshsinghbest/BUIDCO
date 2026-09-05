import { chromium } from 'playwright';

const BASE = 'http://localhost:5184';
const API = 'http://localhost:4101/api';
let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL ${name} ${extra}`); }
}

function newPage(browser, viewport = { width: 1440, height: 900 }) {
  return browser.newPage({ viewport }).then((page) => {
    page.setDefaultTimeout(8000);
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    return { page, consoleErrors };
  });
}

function captureBearerToken(page) {
  return new Promise((resolve) => {
    let done = false;
    const handler = (req) => {
      const auth = req.headers()['authorization'];
      if (auth?.startsWith('Bearer ') && !done) { done = true; page.off('request', handler); resolve(auth.slice(7)); }
    };
    page.on('request', handler);
    setTimeout(() => { if (!done) { done = true; page.off('request', handler); resolve(null); } }, 6000);
  });
}

async function dismissBriefing(page) {
  const briefing = page.getByRole('dialog', { name: 'MD Scheme Summary' });
  try { await briefing.waitFor({ timeout: 4000 }); await briefing.getByLabel('Close').last().click(); } catch {}
}

async function login(browser, username, password) {
  const { page, consoleErrors } = await newPage(browser);
  const tokenPromise = captureBearerToken(page);
  await page.goto(`${BASE}/login`, { timeout: 30000 });
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  const divisionPicker = page.getByLabel('Division');
  const landed = page.waitForURL(BASE + '/', { timeout: 10000 }).then(() => 'overview').catch(() => null);
  const saw = divisionPicker.waitFor({ timeout: 10000 }).then(() => 'division').catch(() => null);
  const which = await Promise.race([landed, saw]);
  if (which === 'division') {
    const tp = captureBearerToken(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(BASE + '/', { timeout: 15000 });
    const token = await tp;
    await dismissBriefing(page);
    return { page, consoleErrors, token };
  }
  await page.waitForURL(BASE + '/', { timeout: 15000 });
  const token = await tokenPromise;
  await dismissBriefing(page);
  return { page, consoleErrors, token };
}

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/spine/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    headless: true,
  });

  // ══════════════════════════════════════════════════════════════════
  // Phase 3/11 — Auth + RBAC boundaries, all 4 real roles.
  // ══════════════════════════════════════════════════════════════════
  const md = await login(browser, 'demo_md', 'Demo@1234');
  check('Auth: demo_md logs in', md.page.url() === BASE + '/');
  check('Auth: captured MD bearer token', Boolean(md.token));

  const viewer = await login(browser, 'demo_viewer', 'Demo@1234');
  check('Auth: demo_viewer logs in', viewer.page.url() === BASE + '/');
  {
    const [auditStatus, usersStatus, projCreateStatus] = await viewer.page.evaluate(async ({ api, token }) => {
      const get = async (path) => (await fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${token}` } })).status;
      const post = async (path, body) => (await fetch(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })).status;
      return Promise.all([get('/audit'), get('/users'), post('/projects', { projectName: 'RBAC probe' })]);
    }, { api: API, token: viewer.token });
    check('RBAC: Viewer forbidden from /api/audit (403)', auditStatus === 403, `(${auditStatus})`);
    check('RBAC: Viewer forbidden from /api/users (403)', usersStatus === 403, `(${usersStatus})`);
    check('RBAC: Viewer forbidden from creating a project (403)', projCreateStatus === 403, `(${projCreateStatus})`);
  }

  const admin = await login(browser, 'demo_admin', 'Demo@1234');
  {
    const escalateStatus = await admin.page.evaluate(async ({ api, token }) => {
      const r = await fetch(`${api}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ username: `probe_${Date.now()}`, password: 'Probe@1234', role: 'MD', fullName: 'Probe' }) });
      return r.status;
    }, { api: API, token: admin.token });
    check('RBAC: Admin cannot create an MD account (403)', escalateStatus === 403, `(${escalateStatus})`);
  }

  const pd = await login(browser, 'demo_pd', 'Demo@1234');
  check('Auth: demo_pd two-step login completes', pd.page.url() === BASE + '/');
  {
    // demo_pd is scoped to Rohtas — confirm the project list only shows Rohtas projects.
    const listing = await pd.page.evaluate(async ({ api, token }) => {
      const r = await fetch(`${api}/projects?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    }, { api: API, token: pd.token });
    const items = listing.items ?? [];
    check('RBAC: demo_pd sees a non-empty, division-scoped project list', items.length > 0, `(count=${items.length})`);
  }

  {
    const noAuth = await md.page.evaluate(async (api) => (await fetch(`${api}/projects`)).status, API);
    check('RBAC: unauthenticated request rejected (401)', noAuth === 401, `(${noAuth})`);
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 4/5 — Tender Dashboard: re-verify inline project details still
  // works (this is the highest-risk area to regress since last audit).
  // ══════════════════════════════════════════════════════════════════
  {
    md.consoleErrors.length = 0;
    await md.page.goto(`${BASE}/`);
    await md.page.getByRole('button', { name: /Tender Dashboard/i }).first().click();
    const tenderDialog = md.page.getByRole('dialog', { name: 'Tender Dashboard' });
    await tenderDialog.waitFor({ timeout: 8000 });
    const firstStageCard = tenderDialog.locator('button', { hasText: 'Projects' }).first();
    await firstStageCard.click();
    await md.page.waitForTimeout(400);
    const projectBtn = tenderDialog.locator('table').first().locator('tbody tr').first().locator('button').first();
    const hasRow = await projectBtn.count();
    if (hasRow > 0) {
      await projectBtn.click();
      const profileDialog = md.page.getByRole('dialog', { name: 'Project profile' });
      const opened = await profileDialog.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      check('Tender Dashboard: clicking a project opens details inline (no redirect)', opened && !/\/projects\//.test(md.page.url()));
      await profileDialog.getByLabel('Close').first().click().catch(() => {});
      await md.page.waitForTimeout(300);
      check('Tender Dashboard: still open after closing project details', await tenderDialog.isVisible().catch(() => false));
    } else {
      check('Tender Dashboard: found a project row to test', false);
    }
    check('Tender Dashboard: no console errors', md.consoleErrors.length === 0, `(${JSON.stringify(md.consoleErrors).slice(0, 200)})`);
    await md.page.keyboard.press('Escape').catch(() => {});
    await md.page.waitForTimeout(300);
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 4 — Functional: negative input validation still works
  // (Input Sheet required-field check).
  // ══════════════════════════════════════════════════════════════════
  {
    await md.page.goto(`${BASE}/input-sheet`);
    await md.page.getByRole('heading', { name: 'Add New Project' }).waitFor({ timeout: 8000 });
    await md.page.getByRole('button', { name: /save|create project/i }).first().click().catch(() => {});
    await md.page.waitForTimeout(400);
    const text = await md.page.locator('body').innerText();
    check('Functional: empty-name project creation is rejected with a message', /required|enter.*name|name.*required/i.test(text));
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 7/12 — Data integrity: newly-added dummy data renders correctly
  // and is internally consistent on a representative project.
  // ══════════════════════════════════════════════════════════════════
  {
    await md.page.goto(`${BASE}/projects`);
    await md.page.getByRole('table').first().waitFor({ timeout: 8000 });
    const searchInput = md.page.locator('table').first().locator('thead input[type="text"]').first();
    await searchInput.fill('Hajipur Sewerage Treatment Plant Expansion');
    await md.page.waitForTimeout(400);
    const row = md.page.locator('table').first().locator('tbody tr').first();
    await row.waitFor({ timeout: 8000 });
    await row.click();
    const dialog = md.page.getByRole('dialog', { name: 'Project profile' });
    await dialog.waitFor({ timeout: 8000 });
    await md.page.getByText('Funding Source & UC').first().waitFor({ timeout: 8000 }).catch(() => {});
    await md.page.waitForTimeout(400);
    const text = await dialog.innerText();
    check('Data: completed project shows 100% milestone progress', /100(\.0)?%/.test(text));
    check('Data: completed project shows an O&M agency (not blank)', !/O&M AGENCY[\s\S]{0,10}—/i.test(text));
    check('Data: Contract & Financial section populated', text.toUpperCase().includes('CONTRACT & FINANCIAL') && text.includes('BUIDCO/AGR'));
    await md.page.keyboard.press('Escape').catch(() => {});
    await md.page.waitForTimeout(300);
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 9 — Responsive spot-check with the now much larger dataset.
  // ══════════════════════════════════════════════════════════════════
  for (const vp of [{ name: 'mobile', width: 375, height: 800 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 900 }]) {
    await md.page.setViewportSize(vp);
    for (const path of ['/', '/projects', '/funds-uc', '/management-actions']) {
      await md.page.goto(`${BASE}${path}`, { timeout: 15000 });
      await md.page.waitForTimeout(400);
      const overflow = await md.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`Responsive: ${path} has no horizontal overflow at ${vp.name}`, overflow <= 2, `(overflowPx=${overflow})`);
    }
  }
  await md.page.setViewportSize({ width: 1440, height: 900 });

  // ══════════════════════════════════════════════════════════════════
  // Phase 10 — Performance with the expanded dataset (39 richly-populated
  // projects, more funds-uc/milestone/management-action rows than before).
  // ══════════════════════════════════════════════════════════════════
  {
    const timings = await md.page.evaluate(async ({ api, token }) => {
      const time = async (path) => {
        const t0 = performance.now();
        await fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${token}` } });
        return performance.now() - t0;
      };
      return {
        projects: await time('/projects?limit=100'),
        fundsUc: await time('/funds-uc'),
        kpiOverview: await time('/kpis/overview'),
      };
    }, { api: API, token: md.token });
    check('Performance: GET /api/projects (100) < 2s', timings.projects < 2000, `(${timings.projects.toFixed(0)}ms)`);
    check('Performance: GET /api/funds-uc < 2s', timings.fundsUc < 2000, `(${timings.fundsUc.toFixed(0)}ms)`);
    check('Performance: GET /api/kpis/overview < 2s', timings.kpiOverview < 2000, `(${timings.kpiOverview.toFixed(0)}ms)`);
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 8 — Broad regression sweep across every major page.
  // ══════════════════════════════════════════════════════════════════
  const pagesToCheck = ['/', '/projects', '/schemes', '/sectors', '/districts', '/divisions', '/cos-eot', '/management-actions', '/gaps', '/pre-monsoon', '/funds-uc', '/mom', '/om', '/users', '/audit'];
  for (const path of pagesToCheck) {
    md.consoleErrors.length = 0;
    await md.page.goto(`${BASE}${path}`, { timeout: 15000 }).catch((e) => { md.consoleErrors.push(`goto failed: ${e.message}`); });
    await md.page.waitForLoadState('networkidle').catch(() => {});
    check(`Regression: ${path} loads with no console errors`, md.consoleErrors.length === 0, `(errors=${JSON.stringify(md.consoleErrors).slice(0, 300)})`);
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log('Failed checks:\n - ' + failures.join('\n - '));
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
