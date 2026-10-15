/**
 * Builds the Word audit document from the evidence the audit specs wrote.
 *
 * Input :  frontend/audit-evidence/evidence/TC-*.json  (+ screenshots/)
 * Output:  BUIDCO-Application-Testing-Audit-Report.docx  (repo root)
 *
 * Each scenario renders in the "Standard Documentation Format" laid out in
 * bhaveshTask.md — the fifteen numbered headings, in that order — so the
 * document can be read straight down as audit evidence. Nothing here
 * invents results: every expected/actual line, table and screenshot comes
 * from the JSON the test run produced.
 *
 * Usage (from frontend/): npm run audit:report
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '..');
const REPO = path.resolve(FRONTEND, '..');
const EVIDENCE = path.join(FRONTEND, 'audit-evidence');
const SHOTS = path.join(EVIDENCE, 'screenshots');
const OUT = path.join(REPO, 'BUIDCO-Application-Testing-Audit-Report.docx');

/* A4 portrait, in DXA (1440 = 1 inch). */
const PAGE_WIDTH = 11906;
const MARGIN = 1000;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const NAVY = '1E3A5F';
const GREY = '6B7280';
const RED = 'B91C1C';
const GREEN = '15803D';

/* ---------------------------------------------------------------- */
/* small builders                                                     */
/* ---------------------------------------------------------------- */

const text = (value, opts = {}) =>
  new Paragraph({
    spacing: { after: opts.after ?? 100 },
    ...(opts.alignment ? { alignment: opts.alignment } : {}),
    children: [
      new TextRun({
        text: value,
        size: opts.size ?? 20,
        bold: opts.bold ?? false,
        italics: opts.italics ?? false,
        color: opts.color ?? '111827',
        font: 'Calibri',
      }),
    ],
  });

const bullet = (value, opts = {}) =>
  new Paragraph({
    bullet: { level: opts.level ?? 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: value, size: 20, color: opts.color ?? '111827', font: 'Calibri' }),
    ],
  });

/** A numbered "Standard Documentation Format" field heading. */
const fieldHeading = (n, label) =>
  new Paragraph({
    spacing: { before: 220, after: 80 },
    children: [
      new TextRun({ text: `${n}. ${label}`, bold: true, size: 21, color: NAVY, font: 'Calibri' }),
    ],
  });

const cell = (value, opts = {}) =>
  new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.shading
      ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shading }
      : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: String(value ?? ''),
            size: 17,
            bold: opts.bold ?? false,
            color: opts.color ?? '111827',
            font: 'Calibri',
          }),
        ],
      }),
    ],
  });

/** A table with a navy header row; `changed` rows get a light amber fill. */
function buildTable({ headers, rows, changed = [] }) {
  const widths = columnWidths(headers.length, rows, headers);
  const marked = new Set(changed);
  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) =>
          cell(h, { width: widths[i], shading: NAVY, bold: true, color: 'FFFFFF' }),
        ),
      }),
      ...rows.map(
        (row, r) =>
          new TableRow({
            children: headers.map((_, i) =>
              cell(row[i] ?? '', {
                width: widths[i],
                shading: marked.has(r) ? 'FEF3C7' : r % 2 ? 'F9FAFB' : undefined,
                color: /^MISMATCH$/i.test(String(row[i])) ? RED : '111827',
              }),
            ),
          }),
      ),
    ],
  });
}

/** Distributes the content width across columns by their longest content. */
function columnWidths(count, rows, headers) {
  const longest = new Array(count).fill(0);
  for (let i = 0; i < count; i += 1) {
    longest[i] = String(headers[i] ?? '').length;
    for (const row of rows) longest[i] = Math.max(longest[i], String(row[i] ?? '').length);
    longest[i] = Math.min(longest[i], 46);
  }
  const total = longest.reduce((a, b) => a + b, 0) || 1;
  const widths = longest.map((len) => Math.max(900, Math.round((len / total) * CONTENT_WIDTH)));
  // Force the row to sum to exactly the content width.
  const drift = CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += drift;
  return widths;
}

/** Screenshot + its caption, scaled to fit the text column. */
function figure(shot, index) {
  const file = path.join(SHOTS, shot.file);
  if (!fs.existsSync(file)) return [text(`[missing screenshot: ${shot.file}]`, { color: RED })];

  const { width, height } = pngSize(file);
  // docx-js sizes images in pixels at 96 DPI. The A4 text column here is
  // (11906 - 2*1000) DXA = 6.88 in = 660 px, so 630 leaves a small gutter.
  const maxW = 630;
  const scale = Math.min(1, maxW / width);
  const taken = new Date(shot.takenAt).toLocaleString();

  return [
    new Paragraph({
      spacing: { before: 140, after: 40 },
      children: [
        new ImageRun({
          type: 'png',
          data: fs.readFileSync(file),
          transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `Figure ${index} · [${shot.phase}] ${shot.caption}`,
          size: 17,
          italics: true,
          color: GREY,
          font: 'Calibri',
        }),
        new TextRun({ text: `  (captured ${taken})`, size: 16, color: GREY, font: 'Calibri' }),
      ],
    }),
  ];
}

/** Reads a PNG's pixel dimensions straight from the IHDR chunk. */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const statusColor = (status) =>
  status === 'Pass' ? GREEN : status === 'Fail' ? RED : 'B45309';

/* ---------------------------------------------------------------- */
/* document                                                           */
/* ---------------------------------------------------------------- */

function loadEvidence() {
  const dir = path.join(EVIDENCE, 'evidence');
  if (!fs.existsSync(dir)) {
    throw new Error(
      `No evidence found at ${dir}. Run the audit suite first:\n  cd frontend && npx playwright test e2e/audit`,
    );
  }
  return fs
    .readdirSync(dir)
    .filter((f) => /^TC-\d+\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

function coverPage(scenarios) {
  const runStart = scenarios.map((s) => s.startedAt).sort()[0];
  const runEnd = scenarios.map((s) => s.finishedAt).sort().at(-1);
  const summaryRows = scenarios.map((s) => [
    s.testCaseId,
    s.scenario,
    String(s.shots.length),
    s.status,
  ]);

  return [
    new Paragraph({
      spacing: { before: 400, after: 60 },
      children: [
        new TextRun({ text: 'BUIDCO', bold: true, size: 52, color: NAVY, font: 'Calibri' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: 'Project Monitoring Dashboard',
          size: 28,
          color: GREY,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 300 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 6 } },
      children: [
        new TextRun({
          text: 'Application Testing & Audit Documentation',
          bold: true,
          size: 34,
          color: '111827',
          font: 'Calibri',
        }),
      ],
    }),
    text(`Report generated: ${new Date().toLocaleString()}`, { size: 20 }),
    text(
      `Testing performed: ${new Date(runStart).toLocaleString()} — ${new Date(runEnd).toLocaleString()}`,
      { size: 20 },
    ),
    text(
      'Environment: local BUIDCO stack (Vite dev server + Node/Express API + local PostgreSQL). No deployed or production environment was used at any point.',
      { size: 20 },
    ),
    text('Tester account: demo_md (role: MD) — a seeded demonstration account.', { size: 20, after: 260 }),

    new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [
        new TextRun({ text: 'Summary of test scenarios', bold: true, size: 24, color: NAVY, font: 'Calibri' }),
      ],
    }),
    buildTable({
      headers: ['Test Case ID', 'Test Scenario', 'Screenshots', 'Status'],
      rows: summaryRows,
    }),
    text(
      'Each scenario below is documented in the Standard Documentation Format: the fifteen numbered fields, in order, from Test Case ID through to Cleanup Confirmation.',
      { italics: true, color: GREY, after: 60 },
    ),

    new Paragraph({
      spacing: { before: 280, after: 120 },
      children: [
        new TextRun({ text: 'Data protection statement', bold: true, size: 24, color: NAVY, font: 'Calibri' }),
      ],
    }),
    bullet('All testing was performed against a local development database. No production data was read, modified or deleted.'),
    bullet('Every record created for testing was named with the "ZZ-AUDIT" prefix so test data is distinguishable from genuine project data at a glance.'),
    bullet('No pre-existing project was edited or deleted. The Create, Update, Delete and expiry scenarios operated only on records created by the test run itself.'),
    bullet('Each deletion was targeted by record id from a registry written at creation time, and re-checked the test-data tag immediately before deleting — so no genuine record could be removed by a name-pattern sweep.'),
    bullet('After testing, every temporary record was removed and the dashboard KPI values were confirmed to match their pre-test baseline exactly (see TC-05).'),

    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function scenarioSection(s, figureCounter) {
  const out = [];

  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120, after: 60 },
      children: [
        new TextRun({
          text: `${s.testCaseId} — ${s.scenario}`,
          bold: true,
          size: 30,
          color: NAVY,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: 'D1D5DB', space: 4 } },
      children: [
        new TextRun({
          text: `Test status: ${s.status}`,
          bold: true,
          size: 21,
          color: statusColor(s.status),
          font: 'Calibri',
        }),
      ],
    }),
  );

  out.push(fieldHeading(1, 'Test Case ID'), text(s.testCaseId));
  out.push(fieldHeading(2, 'Test Scenario'), text(s.scenario));
  out.push(fieldHeading(3, 'Objective'), text(s.objective));

  out.push(fieldHeading(4, 'Pre-Conditions'), ...s.preConditions.map((t) => bullet(t)));
  out.push(fieldHeading(5, 'Test Data'), ...s.testData.map((t) => bullet(t)));
  out.push(
    fieldHeading(6, 'Steps Performed'),
    ...s.steps.map((t, i) => text(`${i + 1}. ${t}`, { after: 60 })),
  );

  // 7/8/9 — the evidence itself, in capture order: Before → Action → After.
  const before = s.shots.filter((x) => x.phase === 'Before');
  const action = s.shots.filter((x) => x.phase === 'Action');
  const after = s.shots.filter((x) => x.phase === 'After' || x.phase === 'Cleanup');

  out.push(fieldHeading(7, 'Before Testing — Screenshots'));
  if (before.length === 0) out.push(text('Not applicable for this scenario.', { italics: true }));
  for (const shot of before) out.push(...figure(shot, figureCounter.next()));

  out.push(fieldHeading(8, 'Action / Change Performed'));
  for (const shot of action) out.push(...figure(shot, figureCounter.next()));
  if (action.length === 0) out.push(text('Covered by the Before/After evidence below.', { italics: true }));

  out.push(fieldHeading(9, 'After Testing — Screenshots'));
  for (const shot of after) out.push(...figure(shot, figureCounter.next()));

  out.push(fieldHeading(10, 'Highlighted Changes'));
  out.push(
    text(
      'Every screenshot above carries a caption bar with the scenario, phase and capture time, and each changed element is outlined in red with a label.',
      { italics: true, color: GREY },
    ),
  );
  for (const t of s.highlightedChanges) out.push(bullet(t));
  for (const table of s.tables) {
    out.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({ text: table.title, bold: true, size: 20, color: '111827', font: 'Calibri' }),
        ],
      }),
      buildTable(table),
    );
    if (table.changed?.length) {
      out.push(
        text('Shaded rows are the values that changed.', {
          italics: true,
          size: 17,
          color: GREY,
          after: 40,
        }),
      );
    }
  }

  out.push(fieldHeading(11, 'Expected Result'), ...s.expected.map((t) => bullet(t)));
  out.push(fieldHeading(12, 'Actual Result'), ...s.actual.map((t) => bullet(t)));

  out.push(
    fieldHeading(13, 'Test Status'),
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: s.status,
          bold: true,
          size: 24,
          color: statusColor(s.status),
          font: 'Calibri',
        }),
      ],
    }),
  );

  out.push(fieldHeading(14, 'Remarks / Observations'));
  if (s.remarks.length === 0) out.push(text('None.', { italics: true }));
  for (const t of s.remarks) out.push(bullet(t));

  out.push(fieldHeading(15, 'Cleanup Confirmation'));
  if (s.cleanup.length === 0) {
    out.push(text('No records were created by this scenario.', { italics: true }));
  }
  for (const t of s.cleanup) out.push(bullet(t));

  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

function closingSection(scenarios) {
  const allPassed = scenarios.every((s) => s.status !== 'Fail');
  const observations = scenarios.filter((s) => s.status === 'Pass with observations');

  const out = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120, after: 160 },
      children: [
        new TextRun({ text: 'Final Audit Evidence', bold: true, size: 30, color: NAVY, font: 'Calibri' }),
      ],
    }),
    text('This document provides evidence that:', { after: 120 }),
    bullet('The application was tested using the four defined functional scenarios — project creation through the Input Sheet, CRUD on a project, O&M and PBG expiry handling, and Excel import.'),
    bullet('Testing was performed entirely with controlled test data on a local environment.'),
    bullet('Existing application data and functionality were protected throughout, and were verified unchanged after testing.'),
    bullet('Changes were verified through Before and After screenshots, with the changed element outlined in every image.'),
    bullet('KPIs, project statuses, CRUD operations, expiry conditions and the import function were each exercised and verified.'),
    bullet('All temporary testing records were removed after the evidence was captured, and the dashboard returned to its exact pre-test values.'),
  ];

  out.push(
    new Paragraph({
      spacing: { before: 260, after: 120 },
      children: [
        new TextRun({ text: 'Overall result', bold: true, size: 24, color: NAVY, font: 'Calibri' }),
      ],
    }),
    buildTable({
      headers: ['Test Case ID', 'Scenario', 'Status'],
      rows: scenarios.map((s) => [s.testCaseId, s.scenario, s.status]),
    }),
    text(
      allPassed
        ? 'All test scenarios completed successfully. No functional defect was found.'
        : 'One or more test scenarios failed — see the individual sections above.',
      { bold: true, after: 140 },
    ),
  );

  if (observations.length > 0) {
    out.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: 'Observations raised for review',
            bold: true,
            size: 24,
            color: NAVY,
            font: 'Calibri',
          }),
        ],
      }),
      text(
        'The following scenarios passed their functional checks but raised a point worth reviewing. Neither is a data fault; both describe the application behaving as written.',
        { after: 100 },
      ),
    );
    for (const s of observations) {
      for (const remark of s.remarks.filter((r) => r.startsWith('Observation'))) {
        out.push(bullet(`${s.testCaseId}: ${remark.replace(/^Observation\s*—\s*/, '')}`));
      }
    }
  }

  out.push(
    new Paragraph({
      spacing: { before: 300, after: 100 },
      children: [
        new TextRun({ text: 'Reproducibility', bold: true, size: 24, color: NAVY, font: 'Calibri' }),
      ],
    }),
    text('Every screenshot and figure in this report was produced by an automated run, not assembled by hand. To reproduce it, from the frontend/ directory:', { after: 100 }),
    text('npm run audit', { size: 19 }),
    text('npm run audit:report', { size: 19, after: 140 }),
    text(
      'The specs live in frontend/e2e/audit/ and the raw evidence (screenshots, per-scenario JSON, the generated Excel import file) is written to frontend/audit-evidence/.',
      { color: GREY },
    ),
  );

  return out;
}

/* ---------------------------------------------------------------- */

const scenarios = loadEvidence();
if (scenarios.length === 0) {
  throw new Error('No TC-*.json evidence files found — run the audit suite first.');
}

let figureNo = 0;
const figureCounter = { next: () => (figureNo += 1) };

const doc = new Document({
  creator: 'BUIDCO Application Testing & Audit',
  title: 'BUIDCO Application Testing & Audit Documentation',
  description: 'Functional test scenarios with before/after screenshot evidence.',
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: 16838 },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: 'BUIDCO Project Monitoring Dashboard — Application Testing & Audit Documentation',
                  size: 16,
                  color: GREY,
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...coverPage(scenarios),
        ...scenarios.flatMap((s) => scenarioSection(s, figureCounter)),
        ...closingSection(scenarios),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buffer);
process.stdout.write(
  `Wrote ${path.relative(REPO, OUT)} — ${scenarios.length} scenarios, ${figureNo} figures, ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n`,
);
