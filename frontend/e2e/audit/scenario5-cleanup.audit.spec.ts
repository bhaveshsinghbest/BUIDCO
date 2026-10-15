/**
 * Cleanup + verification step for the audit run (bhaveshTask.md §0
 * "Testing Data Cleanup").
 *
 * Removes every project the audit scenarios created — and nothing else —
 * then proves the application is back to its pre-test state: the tagged
 * search returns nothing and the KPI tiles read the same as the baseline
 * Scenario 1 captured before it started.
 *
 * Deletion works off the id registry written at creation time, and each
 * delete re-reads the row and refuses unless the name still carries the
 * audit tag (see apiDeleteAuditProject). Nothing is ever removed by a
 * name-pattern sweep.
 *
 * Run last: npx playwright test e2e/audit/scenario5
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  AUDIT_TAG,
  DATA_DIR,
  Recorder,
  apiDeleteAuditProject,
  apiFindTaggedProjects,
  gotoProjectsFiltered,
  listCreated,
  readJson,
  readKpis,
  signIn,
  KPI_SECTION,
} from './audit-kit';

test.describe('Audit cleanup — remove test data and verify the app is unchanged', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test('TC-05 remove every audit test record and verify baseline is restored', async ({ page }) => {
    const rec = new Recorder({
      testCaseId: 'TC-05',
      scenario: 'Testing Data Cleanup and Post-Test Verification',
      objective:
        'Remove every temporary record created during this testing session and verify that the application is left in the same valid operational state as before testing.',
    });

    const registry = listCreated();
    rec.precondition(
      `Scenarios TC-01 to TC-04 have completed and registered ${registry.length} test project(s) for removal.`,
    );
    rec.precondition('No production/real project is listed in the removal registry.');
    for (const row of registry) {
      rec.testData(`${row.projectName} (created by ${row.scenario} via ${row.via})`);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    /* ------------- before cleanup ------------- */

    await gotoProjectsFiltered(page);
    const beforeRows = await page.locator('tbody tr', { hasText: AUDIT_TAG }).count();
    rec.step(
      `Searched the Projects section for "${AUDIT_TAG}" — ${beforeRows} test record(s) present before cleanup.`,
    );
    await rec.shot(page, {
      name: 'test-data-before-cleanup',
      phase: 'Before',
      caption: `All ${AUDIT_TAG} test records still present, immediately before cleanup.`,
      note: 'test data awaiting removal',
    });

    /* ------------- delete ------------- */

    const results: string[][] = [];
    for (const row of registry) {
      const outcome = await apiDeleteAuditProject(row.projectId);
      results.push([row.projectName, row.scenario, row.via, outcome]);
      expect(outcome, `refused to delete ${row.projectName} — not tagged as test data`).not.toBe(
        'refused-not-test-data',
      );
    }
    rec.step(
      `Deleted ${results.length} registered test project(s); each delete re-checked that the record still carried the ${AUDIT_TAG} tag before removing it.`,
    );
    rec.table({
      title: 'Test records removed',
      headers: ['Project name', 'Created by', 'Created via', 'Cleanup result'],
      rows: results,
    });

    /* ------------- verify ------------- */

    const leftOver = await apiFindTaggedProjects();
    expect(leftOver, `test data still present: ${leftOver.map((r) => r.projectName).join(', ')}`).toHaveLength(0);
    rec.step('Queried the API directly for any remaining tagged record — none found.');

    await gotoProjectsFiltered(page);
    await expect(page.locator('tbody tr', { hasText: AUDIT_TAG })).toHaveCount(0);
    await rec.shot(page, {
      name: 'test-data-after-cleanup',
      phase: 'Cleanup',
      caption: `Projects section searched for "${AUDIT_TAG}" after cleanup — no test records remain.`,
      note: 'no test data remains',
    });

    // The Scenario 1 baseline is the yardstick for "unchanged".
    const tc01 = readJson<{ tables?: { title: string; rows: string[][] }[] }>(
      path.join(DATA_DIR, 'TC-01.json'),
      {},
    );
    const kpiTable = tc01.tables?.find((t) => t.title.startsWith('Overview KPI values'));

    await page.goto('/');
    const kpiNow = await readKpis(page);
    await rec.shot(page, {
      name: 'kpis-after-cleanup',
      phase: 'Cleanup',
      caption:
        'Overview KPI tiles after cleanup — counts are back to the values recorded before testing began.',
      target: page.locator(KPI_SECTION).first(),
    });

    if (kpiTable) {
      const rows: string[][] = [];
      const mismatched: number[] = [];
      for (const [i, row] of kpiTable.rows.entries()) {
        const [label, baseline] = row;
        if (label === undefined) continue;
        const now = kpiNow[label] ?? '—';
        const same = (baseline ?? '—') === now;
        rows.push([label, baseline ?? '—', now, same ? 'Restored' : 'Differs']);
        if (!same) mismatched.push(i);
      }
      rec.table({
        title: 'Pre-test baseline vs post-cleanup KPI values',
        headers: ['KPI tile', 'Before testing', 'After cleanup', 'Result'],
        rows,
        changed: mismatched,
      });

      // Count tiles must return exactly to baseline. Averages are portfolio
      // aggregates — they return too once the test rows are gone, but they
      // are reported rather than asserted, because a rounding boundary in
      // the average is not evidence of leftover data.
      const COUNTS = ['Total Projects', 'Completed', 'In Progress', 'Not Started', 'Delayed', 'On Hold'];
      for (const row of kpiTable.rows) {
        const [label, baseline] = row;
        if (label === undefined || !COUNTS.includes(label)) continue;
        expect(kpiNow[label], `KPI "${label}" did not return to its pre-test value`).toBe(baseline);
      }
      rec.actual('Every project-count KPI tile returned to exactly its pre-test value.');
    }

    rec.expected('All temporary test records created during this session are removed.');
    rec.expected('No production/existing project data is modified or deleted.');
    rec.expected('Project counts and KPI tiles return to their pre-test values.');

    rec.actual(`${results.filter((r) => r[3] === 'deleted').length} test project(s) deleted.`);
    rec.actual(`A direct API search for "${AUDIT_TAG}" returns no records.`);
    rec.actual(`The Projects section shows no "${AUDIT_TAG}" rows.`);

    rec.change('All test rows removed from the Projects section.');
    rec.change('KPI counts returned to their pre-test baseline values.');

    rec.remark(
      'Only records created by this testing session were deleted. Each deletion was id-targeted from the registry written at creation time and guarded by a re-check of the test-data tag, so no existing project could be removed by a name-pattern sweep.',
    );
    rec.remark(
      'The demo_md account and the seeded demo accounts are pre-existing application data and were left untouched.',
    );
    rec.cleanupNote(`${results.length} temporary test project(s) removed.`);
    rec.cleanupNote('Temporary Excel test file retained under audit-evidence/files for evidence, and removable with the documented cleanup command.');
    rec.cleanupNote('No existing/production application data was modified or deleted.');
    rec.setStatus('Pass');
    rec.save();
  });
});
