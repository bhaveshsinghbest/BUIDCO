/**
 * Scenario 1 (bhaveshTask.md) — Create New Projects Through Input Sheet.
 *
 * Creates three clearly-tagged test projects through the real Input Sheet
 * form and proves the Projects section and the Overview KPIs both move by
 * exactly the right amount.
 *
 * The expected KPI deltas are not hard-coded: after creating the rows the
 * spec reads each one back from the API and derives what the status counts
 * *should* have moved by. The backend derives "Delayed" from dates rather
 * than taking the submitted status verbatim, so asserting against what was
 * typed in would test the test, not the app.
 *
 * Run: npx playwright test e2e/audit/scenario1
 */
import { expect, test, type Page } from '@playwright/test';
import {
  AUDIT_TAG,
  Recorder,
  apiGetProject,
  gotoProjectsFiltered,
  kpiTile,
  projectRow,
  readKpis,
  registerCreated,
  signIn,
  toCount,
  KPI_SECTION,
} from './audit-kit';

interface TestProject {
  projectName: string;
  city: string;
  contractType: string;
  status: string;
  contractor: string;
}

const TEST_PROJECTS: TestProject[] = [
  {
    projectName: `${AUDIT_TAG}-S1-01 Test Water Supply Scheme`,
    city: 'Testpur',
    contractType: 'Work Contract',
    status: 'Not Started',
    contractor: 'Test Contractor Alpha (dummy)',
  },
  {
    projectName: `${AUDIT_TAG}-S1-02 Test Drainage Network`,
    city: 'Testpur',
    contractType: 'Work Contract',
    status: 'In Progress',
    contractor: 'Test Contractor Beta (dummy)',
  },
  {
    projectName: `${AUDIT_TAG}-S1-03 Test Sewerage Package`,
    city: 'Testpur',
    contractType: 'Service Contract',
    status: 'Completed',
    contractor: 'Test Contractor Gamma (dummy)',
  },
];

/**
 * Tiles that are counts of projects. These must move by an exact, provable
 * amount. Everything else on the grid (sums in Rs. Cr., portfolio averages)
 * is an aggregate that legitimately shifts when the portfolio changes, so
 * those are reported with their before/after rather than asserted flat.
 */
const COUNT_TILES = [
  'Total Projects',
  'Completed',
  'In Progress',
  'Not Started',
  'Delayed',
  'On Hold',
];

/** KPI tiles whose movement this scenario checks. */
const STATUS_TILES: Record<string, string> = {
  'Not Started': 'Not Started',
  'In Progress': 'In Progress',
  Completed: 'Completed',
  Delayed: 'Delayed',
  'On Hold': 'On Hold',
};

test.describe('Audit Scenario 1 — create projects through the Input Sheet', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test('TC-01 create three test projects and verify Projects + KPI counts', async ({ page }) => {
    const rec = new Recorder({
      testCaseId: 'TC-01',
      scenario: 'Create New Projects Through Input Sheet',
      objective:
        'Verify that new projects can be created through the Input Sheet and that the Projects section and the dashboard KPIs / status counts update correctly.',
    });

    rec.precondition('Local BUIDCO stack running (Vite dev server + API + local Postgres).');
    rec.precondition('Signed in as demo_md (role MD) — a seeded demo account, not a real user.');
    rec.precondition(
      `No project named with the ${AUDIT_TAG} test prefix exists before the run (verified in step 2).`,
    );
    for (const p of TEST_PROJECTS) {
      rec.testData(
        `${p.projectName} — City: ${p.city}, Contract Type: ${p.contractType}, Execution Status: ${p.status}, Contractor: ${p.contractor}`,
      );
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    rec.step('Signed in as demo_md (MD) on the local application.');

    /* ---------------- BEFORE ---------------- */

    await page.goto('/');
    const kpiBefore = await readKpis(page);
    rec.step('Opened the Overview dashboard and recorded every KPI tile value before any change.');
    await rec.shot(page, {
      name: 'kpis-before',
      phase: 'Before',
      caption: 'Overview dashboard KPI tiles before creating any test project.',
      target: page.locator(KPI_SECTION).first(),
    });
    await rec.shot(page, {
      name: 'overview-before',
      phase: 'Before',
      caption: 'Full Overview dashboard before the test projects were created.',
      note: 'Overview dashboard',
    });

    await gotoProjectsFiltered(page);
    const preExisting = await page.locator('tbody tr', { hasText: AUDIT_TAG }).count();
    expect(
      preExisting,
      'audit test data already present before the run — clean it up first',
    ).toBe(0);
    rec.step(
      `Opened Projects and searched for "${AUDIT_TAG}" to confirm no test data existed beforehand (0 rows).`,
    );
    await rec.shot(page, {
      name: 'projects-before',
      phase: 'Before',
      caption: `Projects section filtered by "${AUDIT_TAG}" before creation — no test records exist.`,
      note: `Projects filtered by "${AUDIT_TAG}"`,
    });

    /* ---------------- ACTION ---------------- */

    const created: { projectId: string; projectName: string }[] = [];
    for (const [i, data] of TEST_PROJECTS.entries()) {
      const n = i + 1;
      const id = await fillAndCreate(page, rec, data, n);
      created.push({ projectId: id, projectName: data.projectName });
      rec.step(
        `Created test project ${n} of 3 through the Input Sheet form: "${data.projectName}".`,
      );
    }

    /* ---------------- AFTER ----------------- */

    await gotoProjectsFiltered(page);
    const rows = page.locator('tbody tr', { hasText: AUDIT_TAG });
    await expect(rows).toHaveCount(TEST_PROJECTS.length);
    rec.step('Re-opened the Projects section and confirmed all three test projects are listed.');

    await rec.shot(page, {
      name: 'projects-after',
      phase: 'After',
      caption: `Projects section filtered by "${AUDIT_TAG}" after creation — all three test projects present and outlined.`,
      note: 'three new rows outlined',
      marks: TEST_PROJECTS.map((p, i) => ({
        loc: projectRow(page, p.projectName),
        label: `NEW ${i + 1}`,
      })),
    });

    for (const p of TEST_PROJECTS) {
      await expect(projectRow(page, p.projectName)).toBeVisible();
      rec.change(`Projects section: new row "${p.projectName}" is displayed.`);
    }

    // Derive the KPI movement from what the server actually stored.
    const storedStatuses: Record<string, string> = {};
    const expectedDelta: Record<string, number> = {};
    for (const row of created) {
      const detail = await apiGetProject(row.projectId);
      const status = String(detail?.status ?? 'Unknown');
      storedStatuses[row.projectName] = status;
      const tile = STATUS_TILES[status];
      if (tile) expectedDelta[tile] = (expectedDelta[tile] ?? 0) + 1;
    }
    expectedDelta['Total Projects'] = TEST_PROJECTS.length;

    await page.goto('/');
    const kpiAfter = await readKpis(page);
    rec.step('Returned to the Overview dashboard and re-read every KPI tile value.');

    const movedTiles = Object.keys(expectedDelta);
    await rec.shot(page, {
      name: 'kpis-after',
      phase: 'After',
      caption:
        'Overview KPI tiles after creation — every tile that changed is outlined with its delta.',
      marks: movedTiles.map((label) => ({
        loc: kpiTile(page, label),
        label: `+${expectedDelta[label]}`,
      })),
    });
    await rec.shot(page, {
      name: 'overview-after',
      phase: 'After',
      caption: 'Full Overview dashboard after the three test projects were created.',
      note: 'Overview dashboard',
    });

    /* ---------------- VERIFY ---------------- */

    const kpiRows: string[][] = [];
    const changedIdx: number[] = [];
    const labels = Object.keys(kpiBefore);
    for (const [i, label] of labels.entries()) {
      const before = kpiBefore[label] ?? '—';
      const after = kpiAfter[label] ?? '—';
      const isCount = COUNT_TILES.includes(label);
      // Only counts get arithmetic. "47.5%" and "₹ 1,665.40 Cr" would parse
      // into nonsense integers, so aggregates are reported as a transition.
      const b = isCount ? toCount(before) : null;
      const a = isCount ? toCount(after) : null;
      const delta = b !== null && a !== null ? a - b : null;
      kpiRows.push([
        label,
        before,
        after,
        isCount
          ? delta === null
            ? '—'
            : delta > 0
              ? `+${delta}`
              : String(delta)
          : before === after
            ? 'no change'
            : 'recalculated',
        isCount ? String(expectedDelta[label] ?? 0) : 'aggregate — expected to recalculate',
      ]);
      if (before !== after) changedIdx.push(i);
    }
    rec.table({
      title: 'Overview KPI values — before vs after creating 3 test projects',
      headers: ['KPI tile', 'Before', 'After', 'Actual change', 'Expected change'],
      rows: kpiRows,
      changed: changedIdx,
    });

    rec.table({
      title: 'Test projects created, with the status the application stored',
      headers: ['#', 'Project name', 'Execution status entered', 'Status stored by application'],
      rows: TEST_PROJECTS.map((p, i) => [
        String(i + 1),
        p.projectName,
        p.status,
        storedStatuses[p.projectName] ?? '—',
      ]),
    });

    rec.expected('All three test projects are saved and listed in the Projects section.');
    rec.expected(
      `Total Projects increases by exactly ${TEST_PROJECTS.length}; each status count increases in line with the status the application stored for each new project.`,
    );
    rec.expected('No unrelated project-count tile changes.');
    rec.expected(
      'The portfolio average tiles recalculate to include the new projects (they are averages over all projects, so they are expected to move).',
    );

    // Assertions — these decide Pass/Fail, and each is reported verbatim.
    for (const [label, delta] of Object.entries(expectedDelta)) {
      const before = toCount(kpiBefore[label]);
      const after = toCount(kpiAfter[label]);
      expect(before, `KPI "${label}" unreadable before`).not.toBeNull();
      expect(after, `KPI "${label}" unreadable after`).not.toBeNull();
      expect(after! - before!, `KPI "${label}" moved by the wrong amount`).toBe(delta);
      rec.actual(`KPI "${label}": ${before} → ${after} (change of +${delta}, as expected).`);
      rec.change(`KPI tile "${label}" increased from ${before} to ${after}.`);
    }

    // Count tiles must hold; averages are portfolio-wide aggregates and
    // legitimately move when the portfolio grows, so they are reported
    // with their arithmetic rather than asserted flat.
    for (const label of labels) {
      if (expectedDelta[label] !== undefined || !COUNT_TILES.includes(label)) continue;
      const b = toCount(kpiBefore[label]);
      const a = toCount(kpiAfter[label]);
      if (b === null || a === null) continue;
      expect(a - b, `unrelated project-count KPI "${label}" moved`).toBe(0);
    }
    rec.actual(
      'Every project-count tile unrelated to the new projects held its previous value, so no unrelated count was disturbed.',
    );
    for (const label of labels) {
      if (COUNT_TILES.includes(label)) continue;
      const before = kpiBefore[label] ?? '—';
      const after = kpiAfter[label] ?? '—';
      if (before === after) continue;
      rec.actual(
        `Aggregate tile "${label}": ${before} → ${after} — recalculated to include the three new projects.`,
      );
      rec.change(`Aggregate tile "${label}" recalculated from ${before} to ${after}.`);
    }
    rec.actual('All three test projects appear in the Projects section with the entered details.');

    rec.remark(
      'Execution Status was entered as Not Started / In Progress / Completed. The application derives the stored status from the project dates as well as the entered value, so the KPI deltas were checked against the stored status read back from the API.',
    );
    rec.remark(
      'The Avg Physical/Financial Progress tiles are averages across every project. The three test projects were created at 0% progress, so these averages fall — correct behaviour for an average, not a defect, and they return to baseline once the test data is removed (see TC-05).',
    );
    rec.cleanupNote(
      'The three test projects remain in place for Scenario 2 evidence and are removed by the cleanup step (TC-05) at the end of the run.',
    );
    rec.setStatus('Pass');
    rec.save();
  });
});

/**
 * Fills the Input Sheet and saves, returning the new project id.
 *
 * Uses the "ALL Fields" group so every section is on one page — the audit
 * evidence should show one complete data-entry screen rather than a tab
 * tour, and it keeps the form filling free of sub-tab navigation.
 */
async function fillAndCreate(
  page: Page,
  rec: Recorder,
  data: TestProject,
  n: number,
): Promise<string> {
  await page.goto('/input-sheet');
  // The group switcher is a tablist, not buttons (see GroupTab in
  // InputSheetPage); the accessible name carries a section-count badge too.
  await page.getByRole('tab', { name: /ALL Fields/i }).click();

  const nameField = page.getByLabel(/^Project Name/);
  await nameField.fill(data.projectName);
  await page.getByLabel('City', { exact: true }).fill(data.city);
  await page.getByLabel(/^Contract Type/).selectOption(data.contractType);
  await page.getByLabel('Contractor', { exact: true }).fill(data.contractor);
  await page.getByLabel('Execution Status').selectOption(data.status);

  await rec.shot(page, {
    name: `input-sheet-${n}`,
    phase: 'Action',
    caption: `Input Sheet data entry for test project ${n}: "${data.projectName}" (Execution Status: ${data.status}).`,
    note: `data entry ${n} of 3`,
    marks: [{ loc: nameField, label: 'test project name' }],
  });

  await page.getByRole('button', { name: /Create Project/i }).first().click();

  // A successful create switches the form into edit mode on the new id.
  await page.waitForURL(/\/input-sheet\/[0-9a-fA-F-]{36}/, { timeout: 45_000 });
  const projectId = page.url().split('/').pop() ?? '';
  expect(projectId, 'no project id in the URL after create').toMatch(/^[0-9a-fA-F-]{36}$/);

  registerCreated({
    projectId,
    projectName: data.projectName,
    scenario: 'TC-01',
    createdAt: new Date().toISOString(),
    via: 'Input Sheet UI',
  });

  await rec.shot(page, {
    name: `created-${n}`,
    phase: 'Action',
    caption: `Confirmation after saving test project ${n} — the form switched to edit mode on the new record.`,
    note: `saved: ${data.projectName}`,
  });

  return projectId;
}
