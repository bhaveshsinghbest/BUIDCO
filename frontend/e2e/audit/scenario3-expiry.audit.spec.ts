/**
 * Scenario 3 (bhaveshTask.md) — O&M and PBG Expiry Testing.
 *
 * Walks ONE test project through three expiry states and records how the
 * application presents each:
 *
 *   A · Before expiry        PBG and O&M end dates 60 days out
 *   B · 1 day before expiry  both dates at today + 1
 *   C · After expiry         both dates at today - 1
 *
 * The clock is never touched. Moving the test project's own dates around a
 * fixed "today" produces exactly the states the scenario asks for and, un-
 * like changing the system time, cannot disturb anything else in the
 * application or the database.
 *
 * The state changes go through the application's own authenticated REST
 * API — the same PATCH endpoint the Input Sheet's Save button calls — and
 * only ever against the project this spec created. Every verification is
 * done against the rendered UI.
 *
 * Run: npx playwright test e2e/audit/scenario3
 */
import { expect, test } from '@playwright/test';
import {
  AUDIT_TAG,
  Recorder,
  alertCard,
  apiCreateProject,
  apiPatchProject,
  cellInRow,
  gotoProjectsFiltered,
  projectRow,
  signIn,
} from './audit-kit';

const PROJECT_NAME = `${AUDIT_TAG}-S3-01 Test O&M and PBG Expiry`;

/** YYYY-MM-DD for today ± n days, in local time (the app compares dates in
 *  the browser's timezone, so UTC arithmetic would be off by a day). */
function day(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ExpiryState {
  key: string;
  title: string;
  pbgExpiryDate: string;
  omEndDate: string;
  /** What the PBG Alert cell should read. */
  expectPbg: RegExp;
  /** What the O&M Status cell should read. */
  expectOm: RegExp;
  /** Should the project be listed on the Overview "PBG Expiring ≤ 30 Days" card? */
  expectOnPbgCard: boolean;
}

const STATES: ExpiryState[] = [
  {
    key: 'a-before-expiry',
    title: 'A · Before expiry (60 days remaining)',
    pbgExpiryDate: day(60),
    omEndDate: day(60),
    expectPbg: /^—$/,
    expectOm: /^Ongoing$/,
    expectOnPbgCard: false,
  },
  {
    key: 'b-one-day-before',
    title: 'B · One day before expiry',
    pbgExpiryDate: day(1),
    omEndDate: day(1),
    expectPbg: /^Expiring in 1d$/,
    expectOm: /^1d left$/,
    expectOnPbgCard: true,
  },
  {
    key: 'c-after-expiry',
    title: 'C · After expiry (expired yesterday)',
    pbgExpiryDate: day(-1),
    omEndDate: day(-1),
    expectPbg: /^—$/,
    expectOm: /^Expired 1d ago$/,
    expectOnPbgCard: false,
  },
];

test.describe('Audit Scenario 3 — O&M and PBG expiry behaviour', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  test('TC-03 verify O&M and PBG indicators before, one day before, and after expiry', async ({
    page,
  }) => {
    const rec = new Recorder({
      testCaseId: 'TC-03',
      scenario: 'O&M and PBG Expiry Testing',
      objective:
        "Verify the application's handling of O&M and PBG expiry conditions — the status indicators, dashboard alerts and highlighting before expiry, one day before expiry, and after expiry.",
    });

    rec.precondition('Local BUIDCO stack running; signed in as demo_md (role MD).');
    rec.precondition(
      'A purpose-created test project carries the O&M and PBG dates. No genuine project expiry information is read or altered.',
    );
    rec.precondition(
      'The system clock is NOT changed. The test project\'s own PBG/O&M dates are moved relative to a fixed "today" to reproduce each state.',
    );
    rec.testData(
      `${PROJECT_NAME} — Execution Status: Completed, O&M Applicable: Yes, O&M Start: ${day(-300)}, PBG Number: TEST-PBG-0001 (dummy).`,
    );
    for (const s of STATES) {
      rec.testData(`${s.title} — PBG Expiry: ${s.pbgExpiryDate}, O&M End: ${s.omEndDate}`);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    // O&M indicators only render for a Completed project with O&M applicable
    // and a start date (see OmAlertCell), so the fixture is built that way.
    const { projectId } = await apiCreateProject(
      {
        projectName: PROJECT_NAME,
        city: 'Testpur',
        contractType: 'O&M Contract',
        contractor: 'Test O&M Agency (dummy)',
        status: 'Completed',
        physicalProgressPct: 100,
        pbgNumber: 'TEST-PBG-0001',
        pbgExpiryDate: STATES[0]!.pbgExpiryDate,
        omApplicable: true,
        omStartDate: day(-300),
        omEndDate: STATES[0]!.omEndDate,
      },
      'TC-03',
      'API (test fixture)',
    );
    rec.step(
      'Created a dedicated test project with O&M applicable and a PBG, in the "before expiry" state.',
    );

    const results: string[][] = [];

    for (const [i, state] of STATES.entries()) {
      if (i > 0) {
        await apiPatchProject(projectId, {
          pbgExpiryDate: state.pbgExpiryDate,
          omEndDate: state.omEndDate,
        });
        rec.step(
          `Moved the test project into state "${state.title}" (PBG Expiry ${state.pbgExpiryDate}, O&M End ${state.omEndDate}).`,
        );
      }

      /* ---- Projects list indicators ---- */

      await gotoProjectsFiltered(page, PROJECT_NAME);
      const row = projectRow(page, PROJECT_NAME);
      await expect(row).toBeVisible();

      const pbgCell = await cellInRow(page, row, 'PBG Alert');
      const omCell = await cellInRow(page, row, 'O&M Status');
      const pbgText = (await pbgCell.innerText()).trim();
      const omText = (await omCell.innerText()).trim();

      await rec.shot(page, {
        name: `${state.key}-row`,
        phase: i === 0 ? 'Before' : i === 1 ? 'Action' : 'After',
        caption: `${state.title} — Projects row: PBG Alert reads "${pbgText}", O&M Status reads "${omText}".`,
        note: state.title,
        marks: [
          { loc: pbgCell, label: `PBG: ${pbgText}` },
          { loc: omCell, label: `O&M: ${omText}` },
        ],
      });

      /* ---- Dashboard alert cards ---- */

      await page.goto('/');
      const pbgCard = alertCard(page, /PBG Expiring/i);
      await expect(pbgCard).toBeVisible({ timeout: 20_000 });
      // The list renders from its own query; give it a beat to populate
      // before deciding whether the project is on it.
      await page.waitForTimeout(1_200);
      const onCard = (await pbgCard.innerText()).includes(PROJECT_NAME);

      await rec.shot(page, {
        name: `${state.key}-dashboard`,
        phase: i === 0 ? 'Before' : i === 1 ? 'Action' : 'After',
        caption: `${state.title} — Overview "PBG Expiring ≤ 30 Days" alert card: test project ${onCard ? 'IS listed' : 'is NOT listed'}.`,
        note: `${state.title} · dashboard alerts`,
        marks: [{ loc: pbgCard, label: onCard ? 'test project listed' : 'test project not listed' }],
      });

      /* ---- assertions ---- */

      expect(pbgText, `PBG Alert cell in state "${state.title}"`).toMatch(state.expectPbg);
      expect(omText, `O&M Status cell in state "${state.title}"`).toMatch(state.expectOm);
      expect(onCard, `PBG alert card membership in state "${state.title}"`).toBe(
        state.expectOnPbgCard,
      );

      results.push([
        state.title,
        state.pbgExpiryDate,
        pbgText,
        state.omEndDate,
        omText,
        onCard ? 'Listed' : 'Not listed',
      ]);
      rec.actual(
        `${state.title} — PBG Alert: "${pbgText}"; O&M Status: "${omText}"; dashboard PBG alert card: ${onCard ? 'listed' : 'not listed'}.`,
      );
    }

    rec.table({
      title: 'O&M and PBG indicators across the three expiry states',
      headers: [
        'State',
        'PBG expiry date',
        'PBG Alert column',
        'O&M end date',
        'O&M Status column',
        'Dashboard PBG alert card',
      ],
      rows: results,
      changed: [1, 2],
    });

    rec.change(
      'PBG Alert column: no badge at 60 days out → red "Expiring in 1d" one day before expiry → no badge again after expiry.',
    );
    rec.change(
      'O&M Status column: green "Ongoing" → orange "1d left" → red "Expired 1d ago" across the three states.',
    );
    rec.change(
      'Overview "PBG Expiring ≤ 30 Days" card: the test project appears only while the PBG is within the 30-day window.',
    );

    rec.expected(
      'Before expiry — no PBG alert is raised and the O&M contract shows as Ongoing.',
    );
    rec.expected(
      'One day before expiry — the PBG Alert column shows a red "Expiring in 1d" badge, the project is listed on the dashboard PBG alert card, and the O&M status shows "1d left".',
    );
    rec.expected(
      'After expiry — the O&M status shows as Expired, and the project leaves the "expiring within 30 days" alert card.',
    );

    rec.remark(
      'Expiry states were produced by moving the test project\'s own PBG/O&M dates relative to today, not by changing the system clock, so no other project or scheduled behaviour was affected.',
    );
    rec.remark(
      'Observation — once the PBG expiry date has passed, the PBG Alert column renders an em dash, the same as a project that has no PBG recorded at all (PbgAlertCell returns "—" for days < 0). The O&M column, by contrast, shows an explicit red "Expired Nd ago". An expired PBG is therefore visible in the O&M-style treatment but not in the PBG column. This is the component behaving as written rather than a data fault, but it is worth review: a lapsed PBG is arguably more urgent than one expiring next week, and it is currently indistinguishable from "no PBG on record" in that column.',
    );
    rec.setStatus('Pass with observations');
    rec.cleanupNote(
      'The O&M/PBG test project is removed by the cleanup step (TC-05) at the end of the run.',
    );
    rec.save();
  });
});
