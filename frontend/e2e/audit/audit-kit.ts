/**
 * Shared kit for the four audit scenarios in bhaveshTask.md.
 *
 * These specs are NOT ordinary regression tests — they exist to produce
 * *audit evidence*: Before → Action → After screenshots with the changed
 * thing outlined, plus a machine-readable record of what was expected and
 * what actually happened. `scripts/build-audit-report.mjs` turns that record
 * into the final Word document.
 *
 * Safety rules the whole kit is built around (bhaveshTask.md §0):
 *
 *  - Every record these specs create is named with the AUDIT_TAG prefix, so
 *    anyone scanning the database can tell test data from real data at a
 *    glance.
 *  - Nothing is ever deleted by name pattern. Each created row's id goes
 *    into a registry file the moment it exists, cleanup reads that registry,
 *    and `apiDeleteAuditProject` re-reads the row and refuses to delete it
 *    unless the name still carries the tag. A crashed run therefore leaves a
 *    registry the cleanup spec can still finish from.
 *  - No pre-existing row is ever updated. Scenarios 2 and 3 mutate only
 *    projects they created themselves in the same run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { request, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/** Prefix on every project these specs create. "ZZ" also sorts it to the
 *  bottom of any A→Z project list, out of the way of real data. */
export const AUDIT_TAG = 'ZZ-AUDIT';

/** Where evidence lands. Gitignored; the Word report is built from it. */
export const OUT_ROOT = process.env.AUDIT_OUT ?? path.resolve(process.cwd(), 'audit-evidence');
export const SHOT_DIR = path.join(OUT_ROOT, 'screenshots');
export const DATA_DIR = path.join(OUT_ROOT, 'evidence');
export const FILE_DIR = path.join(OUT_ROOT, 'files');

/** The app under test. Local dev stack only — never a deployed environment. */
export const APP_URL = process.env.AUDIT_APP_URL ?? 'http://localhost:5173';

/**
 * MD, because MD bypasses the granular permission flags (see
 * makeProjectPermissionGate in backend/src/middleware/auth.ts) and so can
 * exercise create, update and delete in one session. Seeded by
 * `npm run db:seed-demo-roles`; a demo_* account can never be mistaken for
 * a real user.
 */
export const AUDIT_USER = {
  username: process.env.AUDIT_USER ?? 'demo_md',
  password: process.env.AUDIT_PASS ?? 'Demo@1234',
};

/* ------------------------------------------------------------------ */
/* filesystem                                                          */
/* ------------------------------------------------------------------ */

function ensureDirs(): void {
  for (const dir of [OUT_ROOT, SHOT_DIR, DATA_DIR, FILE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown): void {
  ensureDirs();
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/* ------------------------------------------------------------------ */
/* registry of rows this run created — the cleanup safety net          */
/* ------------------------------------------------------------------ */

export interface CreatedProject {
  projectId: string;
  projectName: string;
  scenario: string;
  createdAt: string;
  /** How it was created, for the audit trail: 'UI form' | 'Excel import' | 'API'. */
  via: string;
}

const REGISTRY = path.join(DATA_DIR, 'created-projects.json');

export function registerCreated(row: CreatedProject): void {
  const all = readJson<CreatedProject[]>(REGISTRY, []);
  if (!all.some((r) => r.projectId === row.projectId)) all.push(row);
  writeJson(REGISTRY, all);
}

export function listCreated(): CreatedProject[] {
  return readJson<CreatedProject[]>(REGISTRY, []);
}

export function forgetCreated(projectId: string): void {
  writeJson(
    REGISTRY,
    listCreated().filter((r) => r.projectId !== projectId),
  );
}

/* ------------------------------------------------------------------ */
/* sign-in                                                             */
/* ------------------------------------------------------------------ */

/**
 * Signs in and clears the MD Portfolio Briefing, which opens over the whole
 * app on an explicit MD sign-in (authSlice.openMdBriefing) and would other-
 * wise cover the nav in every screenshot.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(AUDIT_USER.username);
  await page.getByLabel('Password').fill(AUDIT_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 45_000 });

  const briefing = page.getByRole('dialog', { name: 'MD Scheme Summary' });
  if (await briefing.isVisible().catch(() => false)) {
    // Two controls are named "Close" — the full-viewport backdrop and the
    // header button. Take the header one; the backdrop's centre is covered.
    await briefing.getByRole('button', { name: 'Close' }).last().click();
    await briefing.waitFor({ state: 'hidden', timeout: 10_000 });
  }
}

/* ------------------------------------------------------------------ */
/* API access — test setup and cleanup only                            */
/* ------------------------------------------------------------------ */

let cached: { api: APIRequestContext; token: string } | null = null;

/**
 * An authenticated APIRequestContext pointed at the Vite dev server, so
 * requests take exactly the same /api proxy path the browser does.
 */
export async function apiContext(): Promise<{ api: APIRequestContext; token: string }> {
  if (cached) return cached;
  const api = await request.newContext({ baseURL: APP_URL });
  const res = await api.post('/api/auth/login', { data: AUDIT_USER });
  if (!res.ok()) throw new Error(`audit sign-in failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { accessToken: string };
  cached = { api, token: body.accessToken };
  return cached;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function apiGetProject(projectId: string): Promise<Record<string, unknown> | null> {
  const { api, token } = await apiContext();
  const res = await api.get(`/api/projects/${projectId}`, { headers: authHeaders(token) });
  if (res.status() === 404) return null;
  if (!res.ok()) throw new Error(`GET project ${projectId}: ${res.status()} ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function apiCreateProject(
  body: Record<string, unknown>,
  scenario: string,
  via = 'API',
): Promise<{ projectId: string; projectName: string }> {
  const { api, token } = await apiContext();
  const res = await api.post('/api/projects', { headers: authHeaders(token), data: body });
  if (!res.ok()) throw new Error(`create project: ${res.status()} ${await res.text()}`);
  const row = (await res.json()) as { projectId: string; projectName: string };
  registerCreated({
    projectId: row.projectId,
    projectName: row.projectName,
    scenario,
    createdAt: new Date().toISOString(),
    via,
  });
  return row;
}

export async function apiPatchProject(
  projectId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { api, token } = await apiContext();
  const res = await api.patch(`/api/projects/${projectId}`, {
    headers: authHeaders(token),
    data: body,
  });
  if (!res.ok()) throw new Error(`patch project ${projectId}: ${res.status()} ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Deletes a project ONLY if it is still tagged audit test data.
 *
 * The guard is the point: cleanup works off a registry of ids, and a stale
 * or hand-edited registry must never be able to take a real project with
 * it. Returns what happened so the cleanup spec can report it.
 */
export async function apiDeleteAuditProject(
  projectId: string,
): Promise<'deleted' | 'already-gone' | 'refused-not-test-data'> {
  const row = await apiGetProject(projectId);
  if (row === null) {
    forgetCreated(projectId);
    return 'already-gone';
  }
  const name = String(row.projectName ?? '');
  if (!name.startsWith(AUDIT_TAG)) return 'refused-not-test-data';

  const { api, token } = await apiContext();
  const res = await api.delete(`/api/projects/${projectId}`, { headers: authHeaders(token) });
  if (!res.ok()) throw new Error(`delete project ${projectId}: ${res.status()} ${await res.text()}`);
  forgetCreated(projectId);
  return 'deleted';
}

/** Every project whose name carries the tag, straight from the API. Used by
 *  the cleanup spec to prove nothing was left behind. */
export async function apiFindTaggedProjects(): Promise<
  { projectId: string; projectName: string }[]
> {
  const { api, token } = await apiContext();
  const res = await api.get(`/api/projects?search=${encodeURIComponent(AUDIT_TAG)}&pageSize=100`, {
    headers: authHeaders(token),
  });
  if (!res.ok()) throw new Error(`list projects: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { items?: { projectId: string; projectName: string }[] };
  return (body.items ?? []).filter((r) => r.projectName.startsWith(AUDIT_TAG));
}

/* ------------------------------------------------------------------ */
/* screenshot annotation                                               */
/* ------------------------------------------------------------------ */

const OVERLAY_CLASS = 'audit-evidence-overlay';

/**
 * Stamps a caption bar onto the page so the screenshot itself carries the
 * scenario, the phase and the timestamp — bhaveshTask.md asks for dates and
 * timestamps on the evidence, and a bar baked into the image cannot drift
 * from the file it belongs to.
 */
export async function banner(
  page: Page,
  text: { scenario: string; phase: string; note?: string },
): Promise<void> {
  await page.evaluate(
    ({ scenario, phase, note, cls }) => {
      const bar = document.createElement('div');
      bar.className = cls;
      Object.assign(bar.style, {
        // Anchored to the bottom: the app's own header lives at the top and
        // the caption must not cover the thing being evidenced.
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        zIndex: '2147483647',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        padding: '6px 12px',
        background: '#111827',
        color: '#fff',
        font: '600 12px/1.4 system-ui, -apple-system, Segoe UI, sans-serif',
        pointerEvents: 'none',
      });
      const tag = (label: string, bg: string): HTMLElement => {
        const el = document.createElement('span');
        el.textContent = label;
        Object.assign(el.style, {
          background: bg,
          padding: '2px 8px',
          borderRadius: '4px',
          letterSpacing: '.03em',
          textTransform: 'uppercase',
        });
        return el;
      };
      const phaseColor = phase.toLowerCase().startsWith('before')
        ? '#2563EB'
        : phase.toLowerCase().startsWith('after')
          ? '#15803D'
          : '#B45309';
      bar.append(tag(phase, phaseColor));
      const title = document.createElement('span');
      title.textContent = note ? `${scenario} — ${note}` : scenario;
      bar.append(title);
      const stamp = document.createElement('span');
      stamp.textContent = new Date().toLocaleString();
      Object.assign(stamp.style, { marginLeft: 'auto', opacity: '.85', fontWeight: '500' });
      bar.append(stamp);
      document.body.append(bar);
    },
    { ...text, cls: OVERLAY_CLASS },
  );
}

/**
 * Outlines an element in red with an optional caption, so the "highlight the
 * exact change" requirement is met by the image itself rather than by a note
 * beside it.
 */
export async function highlight(loc: Locator, label?: string): Promise<void> {
  const count = await loc.count();
  for (let i = 0; i < count; i += 1) {
    const one = loc.nth(i);
    if (!(await one.isVisible().catch(() => false))) continue;
    await one.evaluate(
      (el, { label: caption, cls }) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const box = document.createElement('div');
        box.className = cls;
        Object.assign(box.style, {
          position: 'absolute',
          left: `${r.left + window.scrollX - 4}px`,
          top: `${r.top + window.scrollY - 4}px`,
          width: `${r.width + 8}px`,
          height: `${r.height + 8}px`,
          border: '3px solid #DC2626',
          borderRadius: '6px',
          boxShadow: '0 0 0 3px rgba(220,38,38,.22)',
          zIndex: '2147483646',
          pointerEvents: 'none',
        });
        if (caption) {
          const tag = document.createElement('div');
          tag.textContent = caption;
          Object.assign(tag.style, {
            position: 'absolute',
            left: '-3px',
            top: '-22px',
            background: '#DC2626',
            color: '#fff',
            font: '700 11px/1 system-ui, -apple-system, Segoe UI, sans-serif',
            padding: '4px 7px',
            borderRadius: '4px 4px 4px 0',
            whiteSpace: 'nowrap',
          });
          box.append(tag);
        }
        document.body.append(box);
      },
      { label, cls: OVERLAY_CLASS },
    );
  }
}

export async function clearOverlays(page: Page): Promise<void> {
  await page.evaluate((cls) => {
    document.querySelectorAll(`.${cls}`).forEach((el) => el.remove());
  }, OVERLAY_CLASS);
}

/* ------------------------------------------------------------------ */
/* evidence recorder                                                   */
/* ------------------------------------------------------------------ */

export interface ShotRef {
  file: string;
  caption: string;
  phase: string;
  takenAt: string;
}

export interface EvidenceTable {
  title: string;
  headers: string[];
  rows: string[][];
  /** Indexes of rows the report should mark as changed. */
  changed?: number[];
}

export interface ScenarioEvidence {
  testCaseId: string;
  scenario: string;
  objective: string;
  preConditions: string[];
  testData: string[];
  steps: string[];
  shots: ShotRef[];
  tables: EvidenceTable[];
  highlightedChanges: string[];
  expected: string[];
  actual: string[];
  status: 'Pass' | 'Fail' | 'Pass with observations';
  remarks: string[];
  cleanup: string[];
  startedAt: string;
  finishedAt: string;
}

export interface ShotOptions {
  /** Short slug used in the filename, e.g. 'kpis-before'. */
  name: string;
  phase: 'Before' | 'Action' | 'After' | 'Cleanup';
  caption: string;
  /** Capture just this element instead of the viewport. */
  target?: Locator;
  /** Elements to outline in red, with their captions. */
  marks?: { loc: Locator; label?: string }[];
  /** Extra note for the banner bar. */
  note?: string;
  fullPage?: boolean;
}

/**
 * Accumulates one scenario's worth of audit evidence and writes it as JSON
 * for the report builder. The field names follow the "Standard Documentation
 * Format" list in bhaveshTask.md so the Word sections map one-to-one.
 */
export class Recorder {
  private readonly data: ScenarioEvidence;
  private shotSeq = 0;

  constructor(meta: { testCaseId: string; scenario: string; objective: string }) {
    ensureDirs();
    this.data = {
      ...meta,
      preConditions: [],
      testData: [],
      steps: [],
      shots: [],
      tables: [],
      highlightedChanges: [],
      expected: [],
      actual: [],
      status: 'Pass',
      remarks: [],
      cleanup: [],
      startedAt: new Date().toISOString(),
      finishedAt: '',
    };
  }

  precondition(text: string): void {
    this.data.preConditions.push(text);
  }
  testData(text: string): void {
    this.data.testData.push(text);
  }
  step(text: string): void {
    this.data.steps.push(text);
  }
  change(text: string): void {
    this.data.highlightedChanges.push(text);
  }
  expected(text: string): void {
    this.data.expected.push(text);
  }
  actual(text: string): void {
    this.data.actual.push(text);
  }
  remark(text: string): void {
    this.data.remarks.push(text);
  }
  cleanupNote(text: string): void {
    this.data.cleanup.push(text);
  }
  setStatus(value: ScenarioEvidence['status']): void {
    this.data.status = value;
  }
  table(t: EvidenceTable): void {
    this.data.tables.push(t);
  }

  /** Annotate, capture, de-annotate, and record the reference. */
  async shot(page: Page, opts: ShotOptions): Promise<string> {
    this.shotSeq += 1;
    const seq = String(this.shotSeq).padStart(2, '0');
    const file = `${this.data.testCaseId}-${seq}-${opts.name}.png`;
    const abs = path.join(SHOT_DIR, file);

    if (opts.target) await opts.target.scrollIntoViewIfNeeded().catch(() => undefined);
    for (const mark of opts.marks ?? []) await highlight(mark.loc, mark.label);
    if (!opts.target) {
      await banner(page, {
        scenario: `${this.data.testCaseId} · ${this.data.scenario}`,
        phase: opts.phase,
        ...(opts.note === undefined ? {} : { note: opts.note }),
      });
    }

    // Let the outlines paint before the shutter.
    await page.waitForTimeout(150);
    if (opts.target) {
      await opts.target.screenshot({ path: abs });
    } else {
      await page.screenshot({ path: abs, fullPage: opts.fullPage ?? false });
    }
    await clearOverlays(page);

    this.data.shots.push({
      file,
      caption: opts.caption,
      phase: opts.phase,
      takenAt: new Date().toISOString(),
    });
    return file;
  }

  save(): void {
    this.data.finishedAt = new Date().toISOString();
    writeJson(path.join(DATA_DIR, `${this.data.testCaseId}.json`), this.data);
  }
}

/* ------------------------------------------------------------------ */
/* KPI helpers                                                         */
/* ------------------------------------------------------------------ */

export const KPI_SECTION = 'section[aria-label="Portfolio KPIs"]';

/** Reads every visible tile on the Overview KPI grid as label → value. */
export async function readKpis(page: Page): Promise<Record<string, string>> {
  await page.locator(KPI_SECTION).first().waitFor({ state: 'visible', timeout: 30_000 });
  // The value only settles once the query resolves; "—" is the loading text.
  await page
    .waitForFunction(
      (sel) => {
        const root = document.querySelector(sel);
        const first = root?.querySelector('div.text-2xl');
        return Boolean(first && first.textContent && first.textContent.trim() !== '—');
      },
      KPI_SECTION,
      { timeout: 30_000 },
    )
    .catch(() => undefined);

  return page.evaluate((sel) => {
    const out: Record<string, string> = {};
    const root = document.querySelector(sel);
    if (!root) return out;
    root.querySelectorAll('div.text-2xl').forEach((valueEl) => {
      const card = valueEl.parentElement;
      const label = card?.querySelector('span.uppercase')?.textContent?.trim();
      const value = valueEl.textContent?.trim();
      if (label && value !== undefined) out[label] = value;
    });
    return out;
  }, KPI_SECTION);
}

/** XPath has no escape syntax; labels here never mix both quote styles. */
export function xpathLiteral(value: string): string {
  return value.includes("'") ? `"${value}"` : `'${value}'`;
}

/** The whole tile for a KPI label, so it can be outlined. */
export function kpiTile(page: Page, label: string): Locator {
  return page
    .locator(KPI_SECTION)
    .locator(
      `xpath=.//span[normalize-space(text())=${xpathLiteral(label)}]/ancestor::*[contains(@class,"rounded-lg")][1]`,
    )
    .first();
}

/** Parses "1,234" / "12" / "—" into a number, or null when not a count. */
export function toCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const digits = value.replace(/[^\d-]/g, '');
  if (digits === '' || digits === '-') return null;
  return Number(digits);
}

/* ------------------------------------------------------------------ */
/* projects page helpers                                               */
/* ------------------------------------------------------------------ */

/** Opens Projects filtered to this run's test data. */
export async function gotoProjectsFiltered(page: Page, search = AUDIT_TAG): Promise<void> {
  await page.goto('/projects');
  const box = page.getByPlaceholder('Name, NIT number, or project ID…');
  await box.waitFor({ state: 'visible', timeout: 30_000 });
  await box.fill(search);
  // The list is debounced; wait for the table to settle on the filtered set.
  await page.waitForTimeout(900);
}

/** The <tr> for a project, located by its name cell. */
export function projectRow(page: Page, projectName: string): Locator {
  return page.locator('tbody tr').filter({ hasText: projectName }).first();
}

/**
 * A cell in a Projects row, found by its column header rather than a fixed
 * index — the table's visible columns are user-configurable.
 *
 * Matching is case-insensitive because header cells are styled `uppercase`
 * and innerText returns the transformed text, not the label as written in
 * the column definition.
 */
export async function cellInRow(page: Page, row: Locator, header: string): Promise<Locator> {
  const headers = await page.locator('thead th').allInnerTexts();
  const want = header.toLowerCase();
  const index = headers.findIndex((h) =>
    h.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(want),
  );
  if (index < 0) {
    throw new Error(
      `column "${header}" is not visible in the Projects table. Headers seen: ${JSON.stringify(headers)}`,
    );
  }
  return row.locator('td').nth(index);
}

/**
 * The whole dashboard alert Card carrying a given title.
 *
 * Titles are styled `uppercase`, so the match is a case-insensitive regex
 * against the CardTitle <h3>, and the card root is its nearest `rounded-lg`
 * ancestor (see components/ui/card.tsx).
 */
export function alertCard(page: Page, title: RegExp): Locator {
  return page
    .locator('h3')
    .filter({ hasText: title })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
}
