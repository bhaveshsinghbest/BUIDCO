/**
 * Funds Flow & UC Tracker — acceptance checks for bhaveshTask.md.
 *
 * Two halves:
 *   1. A fixed /api/funds-uc fixture (four of the spec's test cases), so the
 *      cards, breakups, diagram, tables and UC tracker can be checked against
 *      exact figures worked out by hand.
 *   2. The real stack: the sidebar entry, the Input Sheet "09 Funds & UC"
 *      section saving to the database and the Audit Trail, on a tagged
 *      ZZ-AUDIT project that is deleted again afterwards.
 *
 *   npx playwright test e2e/funds-flow-tracker
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AUDIT_TAG, apiContext, apiCreateProject, apiDeleteAuditProject, signIn } from './audit/audit-kit';

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function entry(id: string, name: string, scheme: string, over: Record<string, unknown>): Record<string, unknown> {
  return {
    fundsUcId: id.length,
    projectId: id,
    fundingSource: 'Central - Non-EAP',
    fundSanctionAgency: null,
    fundSanctionedAmountCr: null,
    sanctionNo: null,
    sanctionDate: null,
    centralSharePct: null,
    stateSharePct: null,
    fundReleasedToUdhdCr: null,
    openingBalanceCr: 0,
    grantReceivedCr: 0,
    expenditureIncurredCr: 0,
    closingBalanceCr: 0,
    ucAmountCertifiedCr: null,
    ucSentTo: null,
    ucSubmittedDate: null,
    ucStatusOverride: null,
    ucStatus: 'Not Due',
    ucDaysSinceSubmission: null,
    remarks: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastUpdated: null,
    project: { projectName: name, divisionId: 1, schemeNames: [scheme], aaAmountCr: null, revisedAaAmountCr: null },
    ...over,
  };
}

/**
 * Spec rows 1, 2, 4 and 5. Worked totals:
 *   yet 30+80+50+15 = 175 · with UDHD 20+40+45+0 = 105 · balance 13+15+7+7 = 42
 *   paid 62+75+48+20 = 205 of 510 sanctioned = 40%
 *   UC: 2 of 4 sent, 2 not sent, 1 overdue; covered 50+40 = 90 → 115 not covered (44% covered)
 */
const FIXTURE = {
  items: [
    entry('FX-A', 'Fixture Alpha STP', 'Namami Gange', {
      fundSanctionAgency: 'NMCG – Govt. of India', fundSanctionedAmountCr: 120, fundReleasedToUdhdCr: 90,
      openingBalanceCr: 5, grantReceivedCr: 70, expenditureIncurredCr: 62, ucAmountCertifiedCr: 50,
      ucSubmittedDate: daysAgo(40), ucSentTo: 'UDHD, Govt. of Bihar', sanctionNo: 'NMCG/FX/1', sanctionDate: '2025-04-01',
      remarks: 'Fixture remark',
    }),
    entry('FX-B', 'Fixture Bravo Water Supply', 'AMRUT 2.0', {
      fundSanctionAgency: 'MoHUA – Govt. of India', fundSanctionedAmountCr: 200, fundReleasedToUdhdCr: 120,
      openingBalanceCr: 10, grantReceivedCr: 80, expenditureIncurredCr: 75, ucAmountCertifiedCr: 40,
      ucSubmittedDate: daysAgo(140), ucSentTo: 'MoHUA / SPMG',
    }),
    entry('FX-C', 'Fixture Charlie Drainage', 'AMRUT 2.0', {
      fundingSource: 'Central - EAP', fundSanctionAgency: 'MoHUA – Govt. of India', fundSanctionedAmountCr: 150,
      fundReleasedToUdhdCr: 100, grantReceivedCr: 55, expenditureIncurredCr: 48,
    }),
    entry('FX-D', 'Fixture Delta Crematorium', 'Saat Nischay', {
      fundingSource: 'State Funded', fundSanctionedAmountCr: 40, openingBalanceCr: 2, grantReceivedCr: 25, expenditureIncurredCr: 20,
    }),
  ],
};

async function openWithFixture(page: Page, body: unknown = FIXTURE): Promise<void> {
  await page.route('**/api/funds-uc', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
  await page.goto('/funds-uc');
  await expect(page.getByRole('heading', { name: 'Funds Flow & UC Tracker' })).toBeVisible({ timeout: 30_000 });
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

test.describe('Funds Flow & UC Tracker', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
  });

  test('T-01 sidebar entry opens the page and is highlighted', async ({ page }) => {
    const link = page.getByRole('link', { name: 'Funds Flow & UC' });
    await link.click();
    await expect(page).toHaveURL(/\/funds-uc$/);
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Funds Flow & UC Tracker' })).toBeVisible({ timeout: 30_000 });
  });

  test('T-17/T-19 header, chain and "Where is the money?" cards', async ({ page }) => {
    await openWithFixture(page);
    for (const chip of ['Sanctioning Agency (MoHUA / NMCG / State)', 'UDHD', 'BUIDCo', 'Contractors / Payees']) {
      await expect(page.getByText(chip, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('UC travels back: BUIDCo → UDHD → Agency')).toBeVisible();
    await expect(page.getByRole('tab', { name: '📊 Overall' })).toHaveAttribute('aria-selected', 'true');

    const cards = page.getByTestId('where-cards');
    await expect(cards.locator('[data-stage=yet]')).toContainText('₹175.00');
    await expect(cards.locator('[data-stage=withUDHD]')).toContainText('₹105.00');
    await expect(cards.locator('[data-stage=balance]')).toContainText('₹42.00');
    await expect(cards.locator('[data-stage=paid]')).toContainText('₹205.00');
    await expect(cards.locator('[data-stage=paid]')).toContainText('40% of sanctioned');
    await expect(page.getByTestId('fund-flow-card')).toContainText('4 project(s) with funds data');
    // One project has no Released-to-UDHD figure.
    await expect(page.getByTestId('fund-data-notes')).toContainText('1 project(s): "Released to UDHD" not entered');
  });

  test('T-20 breakup panel toggles, lists largest first and totals 100%', async ({ page }) => {
    await openWithFixture(page);
    const yet = page.getByTestId('where-cards').locator('[data-stage=yet]');
    await yet.click();
    const panel = page.getByTestId('fund-breakup-panel');
    await expect(panel.getByRole('heading')).toHaveText('Breakup — Yet to be released by Agency: ₹175.00 Cr.');
    await expect(panel).toContainText('Sanctioned − Released to UDHD');
    await expect(panel).toContainText('By scheme');
    await expect(panel).toContainText('By sanctioning agency');
    const rows = panel.locator('tbody tr');
    await expect(rows.first()).toContainText('Fixture Bravo Water Supply'); // 80 is the largest gap
    await expect(rows.last()).toContainText('TOTAL');
    await expect(rows.last()).toContainText('100%');
    await expect(yet).toHaveAttribute('aria-pressed', 'true');

    // Same card again closes it.
    await yet.click();
    await expect(panel).toHaveCount(0);

    // A breakup row opens that project in Project-wise.
    await page.getByTestId('where-cards').locator('[data-stage=paid]').click();
    await page.getByTestId('fund-breakup-panel').locator('tbody tr', { hasText: 'Fixture Charlie Drainage' }).click();
    await expect(page.getByRole('tab', { name: '🏗️ Project-wise' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('selected-project')).toContainText('Fixture Charlie Drainage');
  });

  test('T-21 diagram: bars, opening segment and chips open their breakups', async ({ page }) => {
    await openWithFixture(page);
    const diagram = page.getByTestId('fund-flow-diagram');
    await expect(diagram).toContainText('₹510.00'); // ① sanctioned
    await expect(diagram).toContainText('₹247.00'); // ③ received 230 + opening 17
    await expect(diagram).toContainText('₹335.00'); // ② 90 + 120 + 100 + 25 assumed
    // 17 of a 510 scale is ~6px tall: the segment is drawn, its label (only above 14px) is not.
    await expect(diagram.locator('g[data-stage=opening] rect')).toHaveCount(1);
    await expect(diagram).not.toContainText('Opening b/f');
    const panelTitle = page.getByTestId('fund-breakup-panel').getByRole('heading');

    await diagram.locator('g[data-stage=relUDHD]').click();
    await expect(panelTitle).toContainText('Released by Agency to UDHD');
    await diagram.locator('g[data-stage=opening]').click();
    await expect(panelTitle).toHaveText('Breakup — Opening Balance b/f with BUIDCo: ₹17.00 Cr.');
    await diagram.locator('div[data-stage=withUDHD]').click();
    await expect(panelTitle).toHaveText('Breakup — Lying with UDHD: ₹105.00 Cr.');
    await diagram.locator('div[data-stage=balance]').click();
    await expect(panelTitle).toHaveText('Breakup — Available with BUIDCo: ₹42.00 Cr.');
  });

  test('T-23 By Sanctioning Agency table and T-26 UC tracker', async ({ page }) => {
    await openWithFixture(page);
    const agency = page.getByTestId('by-agency');
    const names = (await agency.locator('tbody tr td:first-child').allInnerTexts()).map(squash);
    expect(names).toEqual(['MoHUA – Govt. of India', 'NMCG – Govt. of India', 'Not specified', 'TOTAL']);
    await expect(agency.locator('tbody tr').last()).toContainText('₹510.00');

    const uc = page.getByTestId('uc-tracker');
    await expect(uc).toContainText('2 / 4');
    await expect(uc).toContainText('₹115.00 Cr.');
    await expect(uc).toContainText('44% of payments covered');
    await expect(uc).toContainText('UC watch-list — action needed (4)');
    const watch = (await uc.getByTestId('uc-watch-list').locator('tbody tr td:first-child').allInnerTexts()).map(squash);
    expect(watch).toEqual(['Fixture Charlie Drainage', 'Fixture Bravo Water Supply', 'Fixture Delta Crematorium', 'Fixture Alpha STP']);
    await expect(uc.getByTestId('uc-watch-list').locator('tbody tr').nth(1)).toContainText('→ MoHUA / SPMG · overdue');
    await expect(uc.getByTestId('uc-watch-list').locator('tbody tr').first()).toContainText('❌ Not sent');
  });

  test('T-24 Scheme-wise: chart, breakup table and a selected scheme', async ({ page }) => {
    await openWithFixture(page);
    await page.getByRole('tab', { name: '🗂️ Scheme-wise' }).click();
    await expect(page.getByTestId('scheme-chart')).toBeVisible();
    const breakup = page.getByTestId('scheme-breakup');
    const names = (await breakup.locator('tbody tr td:first-child').allInnerTexts()).map(squash);
    expect(names).toEqual(['AMRUT 2.0', 'Namami Gange', 'Saat Nischay', 'TOTAL']);
    await expect(breakup).toContainText('counted once, under its first-listed scheme');

    await breakup.locator('tbody tr', { hasText: 'AMRUT 2.0' }).click();
    await expect(page.getByRole('button', { name: 'AMRUT 2.0', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('fund-flow-card')).toContainText('Flow of Funds — AMRUT 2.0');
    await expect(page.getByTestId('fund-flow-card')).toContainText('2 project(s) · ₹ Cr.');
    await expect(page.getByTestId('scheme-projects')).toContainText('Projects under AMRUT 2.0');
    await page.getByRole('button', { name: 'All schemes' }).click();
    await expect(page.getByTestId('scheme-chart')).toBeVisible();
  });

  test('T-25 Project-wise: filters and one project in detail', async ({ page }) => {
    await openWithFixture(page);
    await page.getByRole('tab', { name: '🏗️ Project-wise' }).click();
    const table = page.getByTestId('project-fund-table');
    await expect(table.locator('tbody tr')).toHaveCount(4);
    // Sorted by sanctioned, largest first.
    await expect(table.locator('tbody tr').first()).toContainText('Fixture Bravo Water Supply');
    // Released-to-UDHD not entered → amber asterisk.
    await expect(table.locator('tbody tr', { hasText: 'Fixture Delta Crematorium' })).toContainText('₹25.00*');

    await page.getByLabel('UC not sent only').check();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await page.getByLabel('UC not sent only').uncheck();
    await page.getByLabel('Filter by scheme').selectOption('AMRUT 2.0');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await page.getByLabel('Filter by scheme').selectOption('All');
    await page.getByLabel('Search project').fill('alpha');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('Search project').fill('no such project');
    await expect(table).toContainText('No projects match.');
    await page.getByLabel('Search project').fill('');

    await table.locator('tbody tr', { hasText: 'Fixture Alpha STP' }).click();
    const status = page.getByTestId('project-uc-status');
    await expect(page.getByTestId('selected-project')).toContainText('Namami Gange · NMCG – Govt. of India');
    await expect(status).toContainText('✅ Yes');
    await expect(status).toContainText('40 days ago');
    await expect(status).toContainText('Submitted');
    await expect(status).toContainText('₹50.00 Cr.'); // covered
    await expect(status).toContainText('₹12.00 Cr.'); // spent, not covered
    await expect(status).toContainText('Sanction ref: NMCG/FX/1');
    await expect(status).toContainText('Remarks: Fixture remark');
    await expect(status).toContainText('Central 100% / State 0%');

    // A project with nothing parked at UDHD: its breakup says so.
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByTestId('selected-project')).toHaveCount(0);
    await table.locator('tbody tr', { hasText: 'Fixture Delta Crematorium' }).click();
    await page.getByTestId('where-cards').locator('[data-stage=withUDHD]').click();
    await expect(page.getByTestId('fund-breakup-panel')).toContainText('Nothing recorded under this head.');
  });

  test('T-18 empty state and sample-data preview', async ({ page }) => {
    await openWithFixture(page, { items: [] });
    await expect(page.getByTestId('funds-empty')).toContainText('No funds data recorded yet');
    await expect(page.getByTestId('funds-uc-page').getByRole('tab')).toHaveCount(0);
    await page.getByRole('button', { name: 'Preview this screen with sample numbers' }).click();
    await expect(page.getByText('SAMPLE DATA')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('where-cards')).toBeVisible();
    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(page.getByTestId('funds-empty')).toBeVisible();
  });

  test('Part C — Input Sheet "09 Funds & UC" saves, recalculates and is audited', async ({ page }) => {
    const created = await apiCreateProject({ projectName: `${AUDIT_TAG} Funds Flow check`, aaAmountCr: 50 }, 'funds-flow-tracker');
    try {
      await page.goto(`/input-sheet/${created.projectId}`);
      const section = page.getByTestId('funds-uc-section');
      await expect(section).toContainText('Funds Flow & Utilization Certificate (UC)', { timeout: 30_000 });
      for (const group of ['① Sanction', '② Released by Sanctioning Agency → UDHD', '③ Released by UDHD → BUIDCo', '④ Payment released by BUIDCo', '⑤ Utilization Certificate (UC)']) {
        await expect(section.getByText(group, { exact: false })).toBeVisible();
      }
      const spin = (name: string) => section.getByRole('spinbutton', { name });

      // Saving needs a Funding Source.
      await spin('UC Opening Balance (₹ Cr.)').fill('2');
      await section.getByRole('button', { name: 'Save Funds & UC' }).click();
      await expect(section.getByText('Select a Funding Source to save this section.')).toBeVisible();

      await section.getByRole('combobox', { name: /Funding Source/ }).selectOption('State Funded');
      await section.getByRole('combobox', { name: 'Sanctioning Agency' }).selectOption('UDHD – Govt. of Bihar');
      await spin('Received by BUIDCo (₹ Cr.)').fill('25');
      await spin('Paid / Released by BUIDCo (₹ Cr.)').fill('20');
      // T-13: Opening + Received − Paid.
      await expect(page.getByTestId('funds-closing-balance')).toHaveValue('7');
      // T-14: Sanctioned falls back to AA 50; Released to UDHD assumed = 25.
      await expect(page.getByTestId('funds-summary-strip')).toContainText('Yet to be released by agency: ₹25.00 Cr.');
      await expect(page.getByTestId('funds-summary-strip')).toContainText('Available with BUIDCo: ₹7.00 Cr.');
      await expect(page.getByTestId('funds-summary-strip')).toContainText('Spent, not covered by UC: ₹20.00 Cr.');
      // T-15: the UC strip appears once a UC date is entered.
      await expect(page.getByTestId('funds-uc-strip')).toHaveCount(0);
      await section.getByLabel('UC Submission Date').fill(daysAgo(120));
      await expect(page.getByTestId('funds-uc-strip')).toContainText('UC Status: Overdue');
      await expect(page.getByTestId('funds-uc-strip')).toContainText('(overdue — quarterly filing expected within 100 days)');

      await section.getByRole('button', { name: 'Save Funds & UC' }).click();
      await expect(section.getByText('Funds & UC details saved.')).toBeVisible({ timeout: 15_000 });

      // Saved to the database, and every changed field audited with its label.
      const { api, token } = await apiContext();
      const headers = { Authorization: `Bearer ${token}` };
      const saved = await (await api.get(`/api/funds-uc/project/${created.projectId}`, { headers })).json();
      expect(saved).toMatchObject({
        fundingSource: 'State Funded',
        fundSanctionAgency: 'UDHD – Govt. of Bihar',
        openingBalanceCr: 2,
        grantReceivedCr: 25,
        expenditureIncurredCr: 20,
        closingBalanceCr: 7,
        fundReleasedToUdhdCr: null,
        ucStatus: 'Overdue',
      });

      // An edit through the Input Sheet's main Save writes an "Updated" entry with before/after.
      await section.getByRole('textbox', { name: 'UC / Funds Remarks' }).fill('Audited remark');
      await page.locator('footer').getByRole('button', { name: /Save Changes/ }).click();
      await expect(page.getByText('Project updated.').first()).toBeVisible({ timeout: 15_000 });
      const audit = await (await api.get(`/api/audit?projectId=${created.projectId}`, { headers })).json();
      const changes = JSON.stringify(audit);
      expect(changes).toContain('UC / Funds Remarks');
      expect(changes).toContain('Audited remark');
      expect(changes).toContain('Paid / Released by BUIDCo (₹ Cr.)');

      // The detail view shows the group with the derived balance.
      await page.goto(`/projects/${created.projectId}`);
      const group = page.getByTestId('funds-detail-group');
      await expect(group).toContainText('Balance with BUIDCo (₹ Cr.) — auto', { timeout: 30_000 });
      await expect(group).toContainText('₹ 7.00 Cr');
      await expect(group).toContainText('Audited remark');
    } finally {
      await apiDeleteAuditProject(created.projectId);
    }
  });

  test('T-16 Excel import carries the Funds Flow fields', async ({ page }) => {
    const projectName = `${AUDIT_TAG} Funds Flow import check`;
    const values: Record<string, string | number> = {
      'Project Name': projectName,
      'Contract Type': 'Work Contract',
      'Funding Source of the Project': 'Central - Non-EAP',
      'Sanctioning Agency': 'NMCG – Govt. of India',
      'Amount Sanctioned by Agency (Rs. Cr.)': 120,
      'Sanction No. / Letter Ref.': 'NMCG/IMP/7',
      'Sanction Date (Funds)': '2025-06-01',
      'Released by Agency to UDHD (Rs. Cr.)': 90,
      'Opening Balance (Rs. Cr.)': 5,
      'Grant Received (Rs. Cr.)': 70,
      'Expenditure Incurred (Rs. Cr.)': 62,
      'UC Submission Date': '2026-10-01',
      'UC Sent To (Department)': 'UDHD, Govt. of Bihar',
      'Amount Covered by Submitted UC (Rs. Cr.)': 50,
      'UC Status (Manual Override)': 'Acknowledged',
      'UC / Funds Remarks': 'Imported from Excel',
    };

    // The shipped template plus any Funds Flow header it does not carry yet
    // (the importer matches columns by header text, wherever they sit).
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve('src/assets/Template.xlsx'));
    const ws = wb.getWorksheet('Project Register')!;
    const columnOf = new Map<string, number>();
    ws.getRow(2).eachCell({ includeEmpty: false }, (cell, col) => {
      columnOf.set(String(cell.value ?? '').replace(/\s+/g, ' ').trim(), col);
    });
    let next = ws.getRow(2).cellCount + 1;
    for (const header of Object.keys(values)) {
      if (!columnOf.has(header)) {
        ws.getRow(2).getCell(next).value = header;
        columnOf.set(header, next);
        next += 1;
      }
    }
    const row = ws.getRow(4);
    for (const [header, value] of Object.entries(values)) row.getCell(columnOf.get(header)!).value = value;
    row.commit();
    const file = path.join(os.tmpdir(), `zz-audit-funds-import-${Date.now()}.xlsx`);
    await wb.xlsx.writeFile(file);

    let projectId: string | null = null;
    try {
      await page.goto('/input-sheet');
      await page.getByRole('button', { name: /Import Project/i }).click();
      const dialog = page.getByRole('dialog', { name: /Import Project/i });
      await dialog.locator('input[type="file"]').setInputFiles(file);
      await expect(dialog.getByText(/1 project ready to import/i)).toBeVisible({ timeout: 30_000 });
      await dialog.getByRole('button', { name: /^Import \d+ Projects?$/i }).click();
      await expect(dialog.getByText(/1 project created from/i)).toBeVisible({ timeout: 60_000 });

      const { api, token } = await apiContext();
      const headers = { Authorization: `Bearer ${token}` };
      const list = (await (await api.get('/api/funds-uc', { headers })).json()) as {
        items: Array<{ projectId: string; project: { projectName: string } | null } & Record<string, unknown>>;
      };
      const saved = list.items.find((e) => e.project?.projectName === projectName);
      expect(saved, 'imported project has no Funds & UC entry').toBeTruthy();
      projectId = saved!.projectId;
      expect(saved).toMatchObject({
        fundingSource: 'Central - Non-EAP',
        fundSanctionAgency: 'NMCG – Govt. of India',
        fundSanctionedAmountCr: 120,
        sanctionNo: 'NMCG/IMP/7',
        sanctionDate: '2025-06-01',
        fundReleasedToUdhdCr: 90,
        openingBalanceCr: 5,
        grantReceivedCr: 70,
        expenditureIncurredCr: 62,
        closingBalanceCr: 13,
        ucSubmittedDate: '2026-10-01',
        ucSentTo: 'UDHD, Govt. of Bihar',
        ucAmountCertifiedCr: 50,
        ucStatusOverride: 'Acknowledged',
        ucStatus: 'Acknowledged',
        remarks: 'Imported from Excel',
      });
    } finally {
      fs.rmSync(file, { force: true });
      if (projectId) await apiDeleteAuditProject(projectId);
    }
  });
});
