/**
 * Renders scripts/presentation-notes.html to a print-ready PDF.
 *
 * Chromium (already present for Playwright) does the rendering, so the PDF
 * matches exactly what the HTML says — no second layout engine to disagree
 * with, and no LibreOffice/pandoc dependency.
 *
 * Also writes a PNG of each page next to the PDF so the layout can be
 * eyeballed without opening a PDF reader.
 *
 * Usage (from frontend/): npm run notes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '..');
const REPO = path.resolve(FRONTEND, '..');

const SOURCE = path.join(HERE, 'presentation-notes.html');
const OUT_PDF = path.join(REPO, 'BUIDCO-Project-Presentation-Notes.pdf');
const PREVIEW_DIR = path.join(FRONTEND, 'presentation-preview');

const browser = await chromium.launch();
const page = await browser.newPage();

// file:// so relative assets would resolve; waits for fonts to settle.
await page.goto(`file://${SOURCE.replace(/\\/g, '/')}`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

await page.pdf({
  path: OUT_PDF,
  format: 'A4',
  printBackground: true,
  // Margins live in the stylesheet's @page rule; overriding here as well
  // would double them up.
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
});

// Page-by-page PNGs for a quick visual check.
fs.rmSync(PREVIEW_DIR, { recursive: true, force: true });
fs.mkdirSync(PREVIEW_DIR, { recursive: true });
await page.emulateMedia({ media: 'print' });
// A4 at ~96dpi = 794 x 1123 css px.
await page.setViewportSize({ width: 794, height: 1123 });

// Each <section class="page"> is meant to be exactly one printed page. If a
// section grows past the usable height it silently spills onto a second
// page, so measure and report rather than letting the deck quietly swell.
const USABLE = Math.round(1123 - ((11 * 96) / 25.4) * 2); // minus @page margins
const heights = await page.evaluate(() =>
  [...document.querySelectorAll('section.page')].map((s) =>
    Math.round(s.getBoundingClientRect().height),
  ),
);
const overflow = [];
heights.forEach((h, i) => {
  const spare = USABLE - h;
  if (spare < 0) overflow.push(`  page ${i + 1}: over by ${-spare}px`);
  process.stdout.write(
    `  page ${i + 1}: ${String(h).padStart(5)}px  ${spare < 0 ? `OVERFLOW +${-spare}px` : `ok (${spare}px spare)`}\n`,
  );
});

const sections = await page.locator('section.page').all();
for (const [i, section] of sections.entries()) {
  await section.screenshot({
    path: path.join(PREVIEW_DIR, `page-${String(i + 1).padStart(2, '0')}.png`),
  });
}

await browser.close();

const bytes = fs.statSync(OUT_PDF).size;
const pdf = fs.readFileSync(OUT_PDF, 'latin1');
const pageCount = (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length;

process.stdout.write(
  `Wrote ${path.relative(REPO, OUT_PDF)} — ${pageCount} pages, ${(bytes / 1024).toFixed(0)} KB\n` +
    `Page previews: ${path.relative(REPO, PREVIEW_DIR)}\n`,
);

if (overflow.length > 0) {
  process.stdout.write(
    `\nWARNING: ${overflow.length} section(s) spill onto an extra page:\n${overflow.join('\n')}\n` +
      `The PDF has ${pageCount} pages but there are ${heights.length} sections. Trim the content.\n`,
  );
}
