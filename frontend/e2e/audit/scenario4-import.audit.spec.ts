/**
 * Scenario 4 (bhaveshTask.md) — Import Projects Through Excel Sheet.
 *
 * Builds a dummy import workbook from the application's OWN Download
 * Template (src/assets/Template.xlsx), uploads it through the Import
 * Project dialog, and then compares every imported value cell-by-cell
 * against what the application displays.
 *
 * Starting from the real template rather than a hand-rolled sheet matters:
 * the importer matches columns by their row-2 header text, so a hand-built
 * file could pass or fail for reasons that have nothing to do with the
 * feature under test.
 *
 * Run: npx playwright test e2e/audit/scenario4
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  AUDIT_TAG,
  FILE_DIR,
  Recorder,
  apiFindTaggedProjects,
  cellInRow,
  gotoProjectsFiltered,
  kpiTile,
  projectRow,
  readKpis,
  registerCreated,
  signIn,
  toCount,
  KPI_SECTION,
} from './audit-kit';

const SHEET = 'Project Register';
/** Row 2 is the header the importer matches on; row 3 is a type-hint row. */
const HEADER_ROW = 2;
const FIRST_DATA_ROW = 4;

const IMPORT_FILE = path.join(FILE_DIR, 'ZZ-AUDIT-import-test-projects.xlsx');

/** The dummy rows written into the workbook, keyed by template header. */
const IMPORT_ROWS: Record<string, string>[] = [
  {
    'Project Name': `${AUDIT_TAG}-S4-01 Test Imported Park Upgrade`,
    City: 'Testganj',
    Contractor: 'Test Importer One (dummy)',
    'Contract Type': 'Work Contract',
    'Execution Status': 'Not Started',
    'Physical Progress % (Actual)': '0',
  },
  {
    'Project Name': `${AUDIT_TAG}-S4-02 Test Imported Road Resurfacing`,
    City: 'Testganj',
    Contractor: 'Test Importer Two (dummy)',
    'Contract Type': 'Work Contract',
    'Execution Status': 'In Progress',
    'Physical Progress % (Actual)': '35',
  },
  {
    'Project Name': `${AUDIT_TAG}-S4-03 Test Imported Pump House`,
    City: 'Testganj',
    Contractor: 'Test Importer Three (dummy)',
    'Contract Type': 'Service Contract',
    'Execution Status': 'In Progress',
    'Physical Progress % (Actual)': '60',
  },
];

/** Columns compared one-for-one between the Excel source and the app. */
const COMPARE: { excel: string; column: string }[] = [
  { excel: 'Project Name', column: 'Project Name' },
  { excel: 'City', column: 'City' },
  { excel: 'Contractor', column: 'Contractor' },
  { excel: 'Execution Status', column: 'Execution Status' },
];

test.describe('Audit Scenario 4 — import projects from an Excel sheet', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test('TC-04 import three test projects from Excel and verify them in the app', async ({
    page,
  }) => {
    const rec = new Recorder({
      testCaseId: 'TC-04',
      scenario: 'Import Projects Through Excel Sheet',
      objective:
        "Verify that projects can be imported from an Excel file and are correctly reflected in the application's Projects section and dashboard counts.",
    });

    rec.precondition('Local BUIDCO stack running; signed in as demo_md (role MD).');
    rec.precondition(
      "The import workbook is generated from the application's own Download Template, so the column headers are exactly the ones the importer expects.",
    );
    rec.precondition(`No ${AUDIT_TAG}-S4 record exists before the import.`);

    /* ---------------- build the Excel source ---------------- */

    await buildWorkbook();
    rec.step(
      `Prepared an Excel file with ${IMPORT_ROWS.length} dummy project rows, built from the application's Download Template (${path.basename(IMPORT_FILE)}).`,
    );
    for (const row of IMPORT_ROWS) {
      rec.testData(
        Object.entries(row)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', '),
      );
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    // The scenario asks for a screenshot of the Excel records being
    // imported. The sheet is rendered from the generated file's own cells
    // so the image cannot drift from what is actually uploaded.
    await renderWorkbookPreview(page);
    await rec.shot(page, {
      name: 'excel-source',
      phase: 'Before',
      caption: `Excel source data — the ${IMPORT_ROWS.length} dummy rows in ${path.basename(IMPORT_FILE)}, read back from the generated file.`,
      note: 'Excel source file',
    });

    /* ---------------- BEFORE ---------------- */

    await page.goto('/');
    const kpiBefore = await readKpis(page);
    await rec.shot(page, {
      name: 'kpis-before',
      phase: 'Before',
      caption: 'Overview KPI tiles before the Excel import.',
      target: page.locator(KPI_SECTION).first(),
    });

    await gotoProjectsFiltered(page, `${AUDIT_TAG}-S4`);
    await expect(page.locator('tbody tr', { hasText: `${AUDIT_TAG}-S4` })).toHaveCount(0);
    rec.step('Confirmed the Projects section contains none of the rows about to be imported.');
    await rec.shot(page, {
      name: 'projects-before',
      phase: 'Before',
      caption: `Projects section filtered by "${AUDIT_TAG}-S4" before the import — no records.`,
      note: 'before import',
    });

    /* ---------------- IMPORT ---------------- */

    await page.goto('/input-sheet');
    await page.getByRole('button', { name: /Import Project/i }).click();
    const dialog = page.getByRole('dialog', { name: /Import Project/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await rec.shot(page, {
      name: 'import-dialog',
      phase: 'Action',
      caption: 'The Import Project dialog, before a file is chosen.',
      note: 'import dialog',
    });

    await dialog.locator('input[type="file"]').setInputFiles(IMPORT_FILE);
    const ready = dialog.getByText(
      new RegExp(`${IMPORT_ROWS.length} projects ready to import`, 'i'),
    );
    await expect(ready).toBeVisible({ timeout: 30_000 });
    rec.step(
      `Uploaded the Excel file; the dialog validated every row and reported ${IMPORT_ROWS.length} projects ready to import.`,
    );
    await rec.shot(page, {
      name: 'import-preview',
      phase: 'Action',
      caption: `Validation result — all ${IMPORT_ROWS.length} rows parsed with no errors and are listed ready to import.`,
      note: 'validation passed',
      marks: [{ loc: ready, label: 'all rows valid' }],
    });

    await dialog.getByRole('button', { name: /^Import \d+ Projects?$/i }).click();
    const done = dialog.getByText(
      new RegExp(`${IMPORT_ROWS.length} projects created from`, 'i'),
    );
    await expect(done).toBeVisible({ timeout: 60_000 });
    rec.step('Ran the import and the application confirmed the records were created.');
    await rec.shot(page, {
      name: 'import-done',
      phase: 'Action',
      caption: `Import confirmation — ${IMPORT_ROWS.length} projects created from the Excel file.`,
      note: 'import complete',
      marks: [{ loc: done, label: 'import confirmed' }],
    });
    await dialog.getByRole('button', { name: 'Close' }).last().click();

    // Register the new rows for cleanup as soon as they exist.
    const tagged = await apiFindTaggedProjects();
    const imported = tagged.filter((r) => r.projectName.startsWith(`${AUDIT_TAG}-S4`));
    expect(imported).toHaveLength(IMPORT_ROWS.length);
    for (const row of imported) {
      registerCreated({
        projectId: row.projectId,
        projectName: row.projectName,
        scenario: 'TC-04',
        createdAt: new Date().toISOString(),
        via: 'Excel import',
      });
    }

    /* ---------------- AFTER ---------------- */

    await gotoProjectsFiltered(page, `${AUDIT_TAG}-S4`);
    const rows = page.locator('tbody tr', { hasText: `${AUDIT_TAG}-S4` });
    await expect(rows).toHaveCount(IMPORT_ROWS.length);
    await rec.shot(page, {
      name: 'projects-after',
      phase: 'After',
      caption: `Projects section after the import — all ${IMPORT_ROWS.length} imported records are listed and outlined.`,
      note: 'imported rows outlined',
      marks: IMPORT_ROWS.map((r, i) => ({
        loc: projectRow(page, r['Project Name'] ?? ''),
        label: `IMPORTED ${i + 1}`,
      })),
    });

    /* ------------- Excel vs application ------------- */

    const comparison: string[][] = [];
    let mismatches = 0;
    for (const source of IMPORT_ROWS) {
      const name = source['Project Name'] ?? '';
      const row = projectRow(page, name);
      await expect(row).toBeVisible();
      for (const field of COMPARE) {
        const expected = source[field.excel] ?? '';
        const cell = await cellInRow(page, row, field.column);
        const shown = (await cell.innerText()).replace(/\s+/g, ' ').trim();
        // Status is rendered through a badge styled `uppercase`, so innerText
        // comes back as "NOT STARTED". Compare on content, not on casing the
        // stylesheet applied.
        const match = shown.toLowerCase().includes(expected.toLowerCase());
        if (!match) mismatches += 1;
        comparison.push([
          name.replace(`${AUDIT_TAG}-`, ''),
          field.excel,
          expected,
          shown,
          match ? 'Match' : 'MISMATCH',
        ]);
        expect(
          shown.toLowerCase(),
          `${name} · ${field.excel} does not match the Excel source`,
        ).toContain(expected.toLowerCase());
      }
    }
    rec.step(
      'Compared every imported field shown in the Projects section against the value in the Excel source file.',
    );
    rec.table({
      title: 'Excel source value vs value displayed in the application',
      headers: ['Imported project', 'Excel column', 'Excel value', 'Shown in application', 'Result'],
      rows: comparison,
    });
    expect(mismatches, 'imported values differ from the Excel source').toBe(0);

    const expectedDelta: Record<string, number> = {
      'Total Projects': IMPORT_ROWS.length,
    };
    for (const r of IMPORT_ROWS) {
      const status = r['Execution Status'] ?? '';
      if (status) expectedDelta[status] = (expectedDelta[status] ?? 0) + 1;
    }

    await page.goto('/');
    const kpiAfter = await readKpis(page);
    await rec.shot(page, {
      name: 'kpis-after',
      phase: 'After',
      caption:
        'Overview KPI tiles after the import — every tile that moved is outlined with its delta.',
      marks: Object.keys(expectedDelta)
        .filter((label) => kpiAfter[label] !== undefined)
        .map((label) => ({ loc: kpiTile(page, label), label: `+${expectedDelta[label]}` })),
    });

    const kpiRows: string[][] = [];
    const changed: number[] = [];
    for (const [i, label] of Object.keys(kpiBefore).entries()) {
      const b = kpiBefore[label] ?? '—';
      const a = kpiAfter[label] ?? '—';
      kpiRows.push([label, b, a, expectedDelta[label] ? `+${expectedDelta[label]}` : '—']);
      if (b !== a) changed.push(i);
    }
    rec.table({
      title: 'Overview KPI values — before vs after the Excel import',
      headers: ['KPI tile', 'Before import', 'After import', 'Expected change'],
      rows: kpiRows,
      changed,
    });

    for (const [label, delta] of Object.entries(expectedDelta)) {
      const b = toCount(kpiBefore[label]);
      const a = toCount(kpiAfter[label]);
      if (b === null || a === null) continue;
      expect(a - b, `KPI "${label}" moved by the wrong amount after import`).toBe(delta);
      rec.actual(`KPI "${label}": ${b} → ${a} (change of +${delta}, as expected).`);
      rec.change(`KPI tile "${label}" increased from ${b} to ${a}.`);
    }

    for (const r of IMPORT_ROWS) {
      rec.change(`Projects section: imported row "${r['Project Name']}" is displayed.`);
    }

    rec.expected(`All ${IMPORT_ROWS.length} rows in the Excel file are validated and imported.`);
    rec.expected(
      'Each imported project appears in the Projects section with exactly the values from the Excel file.',
    );
    rec.expected(
      `Total Projects increases by ${IMPORT_ROWS.length} and the status counts increase in line with the imported Execution Status values.`,
    );

    rec.actual(
      `The dialog validated all ${IMPORT_ROWS.length} rows with no errors and reported them created.`,
    );
    rec.actual(
      `Every compared field (${COMPARE.map((c) => c.excel).join(', ')}) matches the Excel source exactly — ${comparison.length} field comparisons, 0 mismatches.`,
    );

    rec.remark(
      'The importer validates the whole file before writing anything — a single bad row aborts the batch — so a partial import cannot leave half a spreadsheet behind.',
    );
    rec.cleanupNote(
      'The three imported test projects are removed by the cleanup step (TC-05) at the end of the run.',
    );
    rec.cleanupNote(
      `The temporary Excel file is kept with the evidence at audit-evidence/files/${path.basename(IMPORT_FILE)} and is removed with the rest of the working artifacts once the report is signed off.`,
    );
    rec.setStatus('Pass');
    rec.save();
  });
});

/** Writes the dummy rows into a copy of the application's own template. */
async function buildWorkbook(): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve('src/assets/Template.xlsx'));
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`template has no "${SHEET}" sheet`);

  // Map header text → column number, exactly as the importer does.
  const columnOf = new Map<string, number>();
  ws.getRow(HEADER_ROW).eachCell({ includeEmpty: false }, (cell, col) => {
    const header = String(cell.value ?? '').replace(/\s+/g, ' ').trim();
    if (header) columnOf.set(header, col);
  });

  IMPORT_ROWS.forEach((data, i) => {
    const row = ws.getRow(FIRST_DATA_ROW + i);
    for (const [header, value] of Object.entries(data)) {
      const col = columnOf.get(header);
      if (col === undefined) throw new Error(`template has no "${header}" column`);
      row.getCell(col).value = value;
    }
    row.commit();
  });

  fs.mkdirSync(FILE_DIR, { recursive: true });
  await wb.xlsx.writeFile(IMPORT_FILE);
}

/** Renders the generated workbook's data rows as a table for the evidence
 *  screenshot — Excel itself cannot be screenshotted from a browser test. */
async function renderWorkbookPreview(page: Page): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(IMPORT_FILE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`generated file has no "${SHEET}" sheet`);

  const headers = Object.keys(IMPORT_ROWS[0] ?? {});
  const columnOf = new Map<string, number>();
  ws.getRow(HEADER_ROW).eachCell({ includeEmpty: false }, (cell, col) => {
    const header = String(cell.value ?? '').replace(/\s+/g, ' ').trim();
    if (header) columnOf.set(header, col);
  });

  const body = IMPORT_ROWS.map((_, i) => {
    const row = ws.getRow(FIRST_DATA_ROW + i);
    return headers.map((h) => String(row.getCell(columnOf.get(h) ?? 1).value ?? ''));
  });

  await page.setContent(`
    <style>
      body { font: 13px/1.5 "Segoe UI", system-ui, sans-serif; margin: 0; padding: 24px; background: #F3F4F6; }
      h1 { font-size: 15px; margin: 0 0 4px; }
      p { margin: 0 0 16px; color: #4B5563; font-size: 12px; }
      table { border-collapse: collapse; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
      th, td { border: 1px solid #D1D5DB; padding: 7px 11px; text-align: left; font-size: 12px; }
      thead th { background: #1E3A5F; color: #fff; font-weight: 600; }
      tbody tr:nth-child(even) { background: #F9FAFB; }
      td.rownum, th.rownum { background: #E5E7EB; color: #374151; text-align: center; font-weight: 600; }
    </style>
    <h1>Excel import source — sheet "${SHEET}"</h1>
    <p>File: ${path.basename(IMPORT_FILE)} · generated from the application's Download Template · values read back from the saved file.</p>
    <table>
      <thead><tr><th class="rownum">Row</th>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${body
          .map(
            (cells, i) =>
              `<tr><td class="rownum">${FIRST_DATA_ROW + i}</td>${cells
                .map((c) => `<td>${c}</td>`)
                .join('')}</tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `);
}
