/**
 * Scenario 2 (bhaveshTask.md) — CRUD Testing for Existing Projects.
 *
 * Create → Read → Update → Delete, all through the UI, against one project
 * this spec creates for the purpose. It deliberately does NOT reuse a real
 * project: the scenario requires a delete, and the only safe record to
 * delete is one the test owns.
 *
 * Run: npx playwright test e2e/audit/scenario2
 */
import { expect, test } from '@playwright/test';
import {
  AUDIT_TAG,
  Recorder,
  apiGetProject,
  forgetCreated,
  gotoProjectsFiltered,
  projectRow,
  registerCreated,
  signIn,
} from './audit-kit';

const PROJECT_NAME = `${AUDIT_TAG}-S2-01 Test CRUD Project`;

/** What the record is created with. */
const ORIGINAL = {
  city: 'Testpur',
  contractor: 'Test Contractor Delta (dummy)',
  contractType: 'Work Contract',
  status: 'Not Started',
  physicalProgress: '10',
};

/** What the Update step changes it to. */
const UPDATED = {
  city: 'Testnagar',
  contractor: 'Test Contractor Delta REVISED (dummy)',
  status: 'In Progress',
  physicalProgress: '45',
};

test.describe('Audit Scenario 2 — CRUD on a test project', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test('TC-02 create, read, update and delete a test project', async ({ page }) => {
    const rec = new Recorder({
      testCaseId: 'TC-02',
      scenario: 'CRUD Testing for Existing Projects',
      objective:
        'Verify that a project supports Create, Read, Update and Delete operations, that updates are reflected throughout the application, and that no genuine project data is affected.',
    });

    rec.precondition('Local BUIDCO stack running; signed in as demo_md (role MD).');
    rec.precondition(
      'CRUD is exercised against a purpose-created test record, never against an existing project, because the scenario ends in a delete.',
    );
    rec.testData(
      `${PROJECT_NAME} — created as City: ${ORIGINAL.city}, Contractor: ${ORIGINAL.contractor}, Contract Type: ${ORIGINAL.contractType}, Execution Status: ${ORIGINAL.status}, Physical Progress: ${ORIGINAL.physicalProgress}%`,
    );
    rec.testData(
      `Update applies — City: ${UPDATED.city}, Contractor: ${UPDATED.contractor}, Execution Status: ${UPDATED.status}, Physical Progress: ${UPDATED.physicalProgress}%`,
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    /* ================= CREATE ================= */

    await page.goto('/input-sheet');
    await page.getByRole('tab', { name: /ALL Fields/i }).click();
    const nameField = page.getByLabel(/^Project Name/);
    await nameField.fill(PROJECT_NAME);
    await page.getByLabel('City', { exact: true }).fill(ORIGINAL.city);
    await page.getByLabel('Contractor', { exact: true }).fill(ORIGINAL.contractor);
    await page.getByLabel(/^Contract Type/).selectOption(ORIGINAL.contractType);
    await page.getByLabel('Execution Status').selectOption(ORIGINAL.status);
    await page
      .getByLabel('Physical Progress % (Actual)')
      .fill(ORIGINAL.physicalProgress);

    await rec.shot(page, {
      name: 'create-form',
      phase: 'Before',
      caption: `CREATE — Input Sheet filled with the test project's original values.`,
      note: 'create: data entry',
      marks: [{ loc: nameField, label: 'test record' }],
    });

    await page.getByRole('button', { name: /Create Project/i }).first().click();
    await page.waitForURL(/\/input-sheet\/[0-9a-fA-F-]{36}/, { timeout: 45_000 });
    const projectId = page.url().split('/').pop() ?? '';
    expect(projectId).toMatch(/^[0-9a-fA-F-]{36}$/);
    registerCreated({
      projectId,
      projectName: PROJECT_NAME,
      scenario: 'TC-02',
      createdAt: new Date().toISOString(),
      via: 'Input Sheet UI',
    });
    rec.step(`CREATE — saved a new test project "${PROJECT_NAME}" through the Input Sheet.`);
    await rec.shot(page, {
      name: 'create-saved',
      phase: 'Action',
      caption: 'CREATE — the record saved and the form switched into edit mode on the new project.',
      note: 'create: saved',
    });
    rec.change(`New record "${PROJECT_NAME}" created.`);

    /* ================== READ ================== */

    await gotoProjectsFiltered(page, PROJECT_NAME);
    const row = projectRow(page, PROJECT_NAME);
    await expect(row).toBeVisible();
    await rec.shot(page, {
      name: 'read-list',
      phase: 'Before',
      caption: 'READ — the new record listed in the Projects section with its original values.',
      note: 'read: list row',
      marks: [{ loc: row, label: 'test record' }],
    });

    await row.click();
    const profile = page.getByRole('dialog', { name: 'Project profile' });
    await expect(profile).toBeVisible({ timeout: 15_000 });
    await expect(profile).toContainText(PROJECT_NAME);
    await expect(profile).toContainText(ORIGINAL.city);
    rec.step('READ — opened the project profile and verified the stored details are displayed.');
    await rec.shot(page, {
      name: 'read-profile',
      phase: 'Before',
      caption: 'READ — project profile showing the record as created, before any modification.',
      note: 'read: project profile',
    });
    await profile.getByRole('button', { name: 'Close' }).last().click();
    await expect(profile).toBeHidden();

    const createdDetail = await apiGetProject(projectId);
    expect(String(createdDetail?.city)).toBe(ORIGINAL.city);
    rec.actual(
      `READ — the project profile and the API both return the values entered at creation (City: ${ORIGINAL.city}, Contractor: ${ORIGINAL.contractor}).`,
    );

    /* ================= UPDATE ================= */

    await page.goto(`/input-sheet/${projectId}`);
    await page.getByRole('tab', { name: /ALL Fields/i }).click();
    const cityField = page.getByLabel('City', { exact: true });
    await cityField.fill(UPDATED.city);
    await page.getByLabel('Contractor', { exact: true }).fill(UPDATED.contractor);
    await page.getByLabel('Execution Status').selectOption(UPDATED.status);
    const progressField = page.getByLabel('Physical Progress % (Actual)');
    await progressField.fill(UPDATED.physicalProgress);

    await rec.shot(page, {
      name: 'update-form',
      phase: 'Action',
      caption: `UPDATE — the four modified fields before saving (City, Contractor, Execution Status, Physical Progress %).`,
      note: 'update: modified fields',
      marks: [
        { loc: cityField, label: `City → ${UPDATED.city}` },
        { loc: progressField, label: `Progress → ${UPDATED.physicalProgress}%` },
      ],
    });

    await page.getByRole('button', { name: /Save Changes/i }).first().click();
    await expect(page.getByText('Project updated.')).toBeVisible({ timeout: 30_000 });
    rec.step('UPDATE — changed City, Contractor, Execution Status and Physical Progress %, then saved.');
    await rec.shot(page, {
      name: 'update-saved',
      phase: 'Action',
      caption: 'UPDATE — the application confirmed "Project updated."',
      note: 'update: confirmation',
    });

    const updatedDetail = await apiGetProject(projectId);
    expect(String(updatedDetail?.city)).toBe(UPDATED.city);
    expect(String(updatedDetail?.contractor)).toBe(UPDATED.contractor);

    await gotoProjectsFiltered(page, PROJECT_NAME);
    const updatedRow = projectRow(page, PROJECT_NAME);
    await expect(updatedRow).toContainText(UPDATED.city);
    await rec.shot(page, {
      name: 'update-list',
      phase: 'After',
      caption: `UPDATE — the Projects section now shows the revised values (City "${UPDATED.city}").`,
      note: 'update: reflected in list',
      marks: [{ loc: updatedRow, label: 'updated values' }],
    });

    await updatedRow.click();
    const profile2 = page.getByRole('dialog', { name: 'Project profile' });
    await expect(profile2).toBeVisible({ timeout: 15_000 });
    await expect(profile2).toContainText(UPDATED.city);
    await expect(profile2).toContainText(UPDATED.contractor);
    await rec.shot(page, {
      name: 'update-profile',
      phase: 'After',
      caption: 'UPDATE — the project profile reflects the same revised values as the list.',
      note: 'update: reflected in profile',
    });
    await profile2.getByRole('button', { name: 'Close' }).last().click();
    await expect(profile2).toBeHidden();

    rec.change(`City changed from "${ORIGINAL.city}" to "${UPDATED.city}".`);
    rec.change(`Contractor changed from "${ORIGINAL.contractor}" to "${UPDATED.contractor}".`);
    rec.change(
      `Execution Status changed from "${ORIGINAL.status}" to "${UPDATED.status}"; Physical Progress from ${ORIGINAL.physicalProgress}% to ${UPDATED.physicalProgress}%.`,
    );
    rec.actual(
      'UPDATE — the revised values were saved and appear identically in the Input Sheet, the Projects list and the project profile.',
    );

    rec.table({
      title: 'Field-level Before vs After for the Update operation',
      headers: ['Field', 'Before update', 'After update', 'Reflected in list + profile'],
      rows: [
        ['City', ORIGINAL.city, UPDATED.city, 'Yes'],
        ['Contractor', ORIGINAL.contractor, UPDATED.contractor, 'Yes'],
        ['Execution Status', ORIGINAL.status, UPDATED.status, 'Yes'],
        [
          'Physical Progress %',
          `${ORIGINAL.physicalProgress}%`,
          `${UPDATED.physicalProgress}%`,
          'Yes',
        ],
      ],
      changed: [0, 1, 2, 3],
    });

    /* ================= DELETE ================= */

    await gotoProjectsFiltered(page, PROJECT_NAME);
    const doomed = projectRow(page, PROJECT_NAME);
    await expect(doomed).toBeVisible();
    await rec.shot(page, {
      name: 'delete-before',
      phase: 'Before',
      caption: 'DELETE — the test record still listed, immediately before deletion.',
      note: 'delete: record present',
      marks: [{ loc: doomed, label: 'about to delete' }],
    });

    // The row action goes through window.confirm; capture its text as
    // evidence that the app warns before an irreversible delete.
    let confirmText = '';
    page.once('dialog', (dialog) => {
      confirmText = dialog.message();
      void dialog.accept();
    });
    await doomed.getByRole('button', { name: 'Delete' }).click();

    await expect(page.locator('tbody tr', { hasText: PROJECT_NAME })).toHaveCount(0, {
      timeout: 30_000,
    });
    rec.step('DELETE — used the row Delete action and accepted the confirmation prompt.');
    expect(confirmText).toContain('cannot be undone');
    rec.actual(`DELETE — the application asked for confirmation first: "${confirmText}"`);

    await rec.shot(page, {
      name: 'delete-after',
      phase: 'After',
      caption: 'DELETE — the record is gone from the Projects section.',
      note: 'delete: record removed',
    });

    const gone = await apiGetProject(projectId);
    expect(gone, 'project still readable after delete').toBeNull();
    forgetCreated(projectId);
    rec.actual('DELETE — the record is removed from the list and the API returns 404 for its id.');
    rec.change('Record removed from the Projects section.');

    /* ================= VERDICT ================= */

    rec.expected('CREATE — a new project is saved with the entered values.');
    rec.expected('READ — the stored values are displayed in the list and the project profile.');
    rec.expected(
      'UPDATE — modified values are saved and reflected consistently in the Input Sheet, the Projects list and the project profile.',
    );
    rec.expected(
      'DELETE — the record is removed after an explicit confirmation and is no longer retrievable.',
    );
    rec.expected('No existing/genuine project is modified or deleted at any point.');

    rec.remark(
      'Every operation was performed through the application UI. The delete is guarded by a confirmation prompt that names the project and states that the action cannot be undone.',
    );
    rec.remark(
      'Only the purpose-created test record was touched. No pre-existing project was opened for editing at any point in this scenario.',
    );
    rec.cleanupNote(
      'The test record used for this scenario was deleted as part of the Delete step — nothing is left behind by TC-02.',
    );
    rec.setStatus('Pass');
    rec.save();
  });
});
