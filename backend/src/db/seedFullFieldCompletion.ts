/**
 * bhaveshTask.md follow-up — "All the fields of every project should be
 * filled... every field [in] overview, schedule delay, contract and
 * financial, PBG & EMD, funding source & UC, O&M and so on."
 *
 * A final completion pass across every dummy project (the original 39
 * plus the 10 seedMoreDummyProjects.ts adds). Earlier passes
 * (seedDummyPresentationExtras[2].ts) deliberately gated Contract &
 * Financial / PBG & EMD / O&M fields to a project's actual tender
 * sub-stage — an agreement can't exist before a tender concludes, in
 * strict real-world terms. This pass supersedes that gating on
 * explicit request: every field in every Project Profile section gets
 * a real value regardless of lifecycle stage, using the same
 * proportional-to-AA math as before so the numbers stay internally
 * consistent with each other even when they run ahead of where the
 * project's own tender workflow has actually reached.
 *
 * Two techniques keep this from creating outright self-contradictions
 * in the UI (ProjectProfileModal.tsx's own derived badges):
 *   - Revised End Date is set EQUAL to Planned End Date (filled, not
 *     blank, but zero variance) for anything not actually Delayed/On
 *     Hold, so the Time Overrun badge still reads "On Schedule" rather
 *     than showing a fabricated slip.
 *   - O&M Start/End Date are projected into the future (anchored off
 *     Expected Completion) for anything not yet Completed, so the
 *     auto-computed O&M status still reads "Not Started" rather than
 *     claiming O&M is already under way — this mirrors
 *     OmDetailsSection.tsx's own documented intent ("Applicable only to
 *     Completed projects — pre-fill anyway; alerts fire once status is
 *     Completed").
 *
 * One field is deliberately NOT force-filled: Funds & UC's Central/State
 * Share percentages. fundsUcService.ts's clearShareFieldsIfNotApplicable
 * nulls these server-side for every funding source except "Central -
 * State Share" — it's an enforced business rule, not a gap, so this
 * script only fills them where that funding source actually applies.
 *
 * Idempotent — every write is gated on the target field/record actually
 * being null or absent, so re-running only fills genuine gaps.
 *
 * Usage: npm run db:seed-full-field-completion
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import {
  cosEotItem,
  district,
  division,
  project,
  projectFundsUc,
  projectMilestone,
  projectScheme,
  scheme,
} from './schema.js';
import type { AuditActor } from '../lib/audit.js';
import { updateProject } from '../services/projectsService.js';
import { updateFundsUc } from '../services/fundsUcService.js';
import { replaceMilestones, upsertMonthlyProgress } from '../services/milestonesService.js';
import { createCosEot } from '../services/cosEotService.js';

const SEED_ACTOR: AuditActor = { userId: null, username: 'system:seed-full-completion', role: 'MD' };
const DUMMY_NAME_PATTERN = /delay test|package \d|smart city|augmentation|drainage|crematorium|sewerage/i;

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length]!;
}
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
function round2(n: number): string {
  return n.toFixed(2);
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + Math.round(months));
  return d.toISOString().slice(0, 10);
}

const DISTRICT_NAME_FIXUPS: Record<string, string> = {
  Goplaganj: 'Gopalganj',
  Smastipur: 'Samastipur',
  Sitamarahi: 'Sitamarhi',
  Siwaan: 'Siwan',
  Purnea: 'Purnia',
};
function districtNameForDivision(divisionName: string): string {
  if (divisionName.startsWith('Patna')) return 'Patna';
  return DISTRICT_NAME_FIXUPS[divisionName] ?? divisionName;
}

const BANKS = ['State Bank of India', 'Punjab National Bank', 'Bank of Baroda', 'Union Bank of India', 'Central Bank of India', 'UCO Bank'];
const bankCodeOf = (bank: string): string =>
  ({ 'State Bank of India': 'SBI', 'Punjab National Bank': 'PNB', 'Bank of Baroda': 'BOB', 'Union Bank of India': 'UBI', 'Central Bank of India': 'CBI', 'UCO Bank': 'UCO' })[bank] ?? 'SBI';
const OM_AGENCIES = ['M/s Kosi Infra Developers Pvt. Ltd.', 'M/s Sone Valley Construction Co.', 'M/s Mithila Builders & Engineers', 'M/s Magadh Civil Works Ltd.', 'M/s Ganga Tirhut Infra Pvt. Ltd.'];
const DELAY_REASONS = [
  'Land acquisition proceedings pending with Revenue Department',
  'Contractor mobilization delayed due to material availability',
  'Monsoon-related work stoppage extended the schedule',
  'Pending inter-departmental clearance for utility shifting',
  'Litigation/court stay affecting site access',
];
const DEPT_STUCK_AT = [
  'Revenue Department (Land Acquisition)',
  'Forest & Environment Department (Clearance)',
  'Finance Department (Fund Release)',
  'District Administration',
  'Electricity Board (Utility Shifting)',
];

type ProjectRow = typeof project.$inferSelect;

async function fillCoreFields(p: ProjectRow, districtIdByName: Map<string, number>): Promise<void> {
  const seed = seedFromId(p.projectId);
  const patch: Record<string, unknown> = {};
  const isUnfavourable = p.status === 'Delayed' || p.status === 'On Hold';

  if (!p.districtId && p.divisionId) {
    const [divRow] = await db.select().from(division).where(eq(division.divisionId, p.divisionId)).limit(1);
    if (divRow) {
      const distId = districtIdByName.get(districtNameForDivision(divRow.divisionName));
      if (distId) patch.districtId = distId;
    }
  }
  if (!p.sanctionDate) patch.sanctionDate = addDays(p.plannedEndDate ?? '2026-12-31', -540 - (seed % 200));
  if (!p.contractor) patch.contractor = pick(OM_AGENCIES, seed);
  if (!p.contractType) patch.contractType = 'Work Contract';
  if (!p.plannedEndDate) patch.plannedEndDate = '2027-03-31';

  const plannedEnd = (patch.plannedEndDate as string | undefined) ?? p.plannedEndDate ?? '2027-03-31';
  if (!p.revisedEndDate) {
    patch.revisedEndDate = isUnfavourable ? addDays(plannedEnd, 20 + (seed % 70)) : plannedEnd;
  }
  if (!p.delayReason) {
    patch.delayReason = isUnfavourable ? pick(DELAY_REASONS, seed) : 'Not applicable — project on schedule.';
  }
  if (!p.deptStuckAt) {
    patch.deptStuckAt = isUnfavourable ? pick(DEPT_STUCK_AT, seed) : 'Not applicable — no departmental hold-up.';
  }
  // NIT Number/Date are deliberately NOT backfilled here: projectsService.ts's
  // generic update path silently strips them (NIT_addition_instructions.md
  // §4 — editable only via the dedicated endpoint, which itself only allows
  // it while the project is CURRENTLY at the NIT Published sub-stage). A
  // project that has already moved past that sub-stage has no API path to
  // set this retroactively — a genuine, enforced gap, not an oversight.
  if (!p.remark) {
    patch.remark = isUnfavourable
      ? `Escalated to ${(patch.deptStuckAt as string) ?? p.deptStuckAt} for resolution; being tracked under Management Action.`
      : 'No outstanding issues reported.';
  }

  if (Object.keys(patch).length > 0) {
    await updateProject(p.projectId, patch, SEED_ACTOR);
  }
}

async function fillFinancialsUnconditional(p: ProjectRow): Promise<void> {
  const seed = seedFromId(p.projectId);
  const patch: Record<string, unknown> = {};

  let aaAmountCr = p.aaAmountCr ? Number(p.aaAmountCr) : null;
  if (aaAmountCr === null) {
    aaAmountCr = 60 + (seed % 40);
    patch.aaAmountCr = round2(aaAmountCr);
  }
  if (!p.revisedAaAmountCr) {
    patch.revisedAaAmountCr = round2(aaAmountCr * (1.02 + (seed % 7) * 0.01));
  }

  if (!p.emdRefNumber) {
    patch.emdAmountCr = round2(Math.round(aaAmountCr * 0.02 * 100) / 100);
    patch.emdRefNumber = `EMD/2026/${1000 + (seed % 8999)}`;
    patch.emdDate = addDays(p.nitDate ?? '2026-04-01', 25);
  }

  let contractValue = p.contractValueCr ? Number(p.contractValueCr) : null;
  if (!p.agreementNumber) {
    contractValue = Math.round(aaAmountCr * (0.85 + (seed % 10) * 0.01) * 100) / 100;
    const bank = pick(BANKS, seed);
    patch.agreementNumber = `BUIDCO/AGR/2026/${p.projectId.slice(0, 4).toUpperCase()}`;
    patch.agreementDate = addDays(p.nitDate ?? '2026-04-01', 60);
    patch.agreementAmountCr = round2(contractValue);
    patch.contractValueCr = round2(contractValue);
    patch.pbgNumber = `PBG/${bankCodeOf(bank)}/2026/${2000 + (seed % 900)}`;
    patch.pbgAmountCr = round2(contractValue * 0.1);
    patch.pbgIssuingBank = bank;
    patch.pbgExpiryDate = addDays((patch.agreementDate as string), 365);
  }
  contractValue = contractValue ?? aaAmountCr * 0.9;

  if (!p.appointedDate) {
    patch.appointedDate = addDays((patch.agreementDate as string | undefined) ?? p.agreementDate ?? addDays(p.nitDate ?? '2026-04-01', 60), 20);
  }

  if (!p.omApplicable) {
    patch.omApplicable = true;
    patch.omPeriodMonths = String(pick([36, 48, 60], seed));
  }

  if (!p.mobAdvanceIssuedCr) {
    const physPct = Math.max(Number(p.physicalProgressPct ?? 0), 8);
    const mobIssued = Math.round(contractValue * 0.1 * 100) / 100;
    const mobRecovered = Math.round(mobIssued * Math.min(physPct / 100, 1) * 100) / 100;
    const totalPayments = Math.round(contractValue * Math.min(physPct / 100, 1) * 0.95 * 100) / 100;
    patch.mobAdvanceIssuedCr = round2(mobIssued);
    patch.mobAdvanceRecoveredCr = round2(mobRecovered);
    patch.advanceOutstandingCr = round2(Math.max(mobIssued - mobRecovered, 0));
    patch.retentionMoneyHeldCr = round2(Math.round(totalPayments * 0.05 * 100) / 100);
    patch.totalPaymentsCr = round2(totalPayments);
    patch.lastPaymentDate = p.status === 'Completed' ? '2026-02-15' : addDays('2026-09-05', -(seed % 25));
    patch.lastRaBillNo = `RA/${10 + (seed % 40)}/2026`;
  }

  // O&M dates — future-projected for anything not yet Completed so the
  // auto-computed status still correctly reads "Not Started" rather than
  // claiming O&M is already under way (see OmDetailsSection.tsx).
  if (!p.omStartDate) {
    const isCompleted = p.status === 'Completed';
    const anchor = p.expectedCompletionDate ?? p.plannedEndDate ?? '2027-03-31';
    const periodMonths = Number((patch.omPeriodMonths as string | undefined) ?? p.omPeriodMonths ?? 36);
    patch.omStartDate = isCompleted ? addDays(anchor, 14) : anchor;
    patch.omEndDate = addMonths(patch.omStartDate as string, periodMonths);
    patch.omAgency = pick(OM_AGENCIES, seed + 1);
    patch.omRemarks = isCompleted
      ? 'Routine O&M cycle in progress; no major defects reported to date.'
      : 'O&M mobilization planned to commence upon project completion and handover.';
  }

  if (Object.keys(patch).length > 0) {
    await updateProject(p.projectId, patch, SEED_ACTOR);
    process.stdout.write(`filled financials/O&M (${Object.keys(patch).length} fields): ${p.projectName}\n`);
  }
}

async function completeFundsUc(p: ProjectRow): Promise<void> {
  const [entry] = await db.select().from(projectFundsUc).where(eq(projectFundsUc.projectId, p.projectId)).limit(1);
  if (!entry) return; // seedDummyPresentationExtras2.ts guarantees one exists; nothing to do if not.
  const seed = seedFromId(p.projectId);
  const patch: Record<string, unknown> = {};
  if (!entry.ucSubmittedDate) {
    patch.ucSubmittedDate = addDays('2026-06-01', seed % 90);
  }
  // Central/State Share only ever persists for "Central - State Share" —
  // fundsUcService.ts nulls it server-side for every other funding source,
  // so only attempt it here where it can actually take effect.
  if (entry.fundingSource === 'Central - State Share' && (entry.centralSharePct == null || entry.stateSharePct == null)) {
    patch.centralSharePct = 60;
    patch.stateSharePct = 40;
  }
  if (Object.keys(patch).length > 0) {
    await updateFundsUc(entry.fundsUcId, patch, SEED_ACTOR);
    process.stdout.write(`completed funds & UC: ${p.projectName}\n`);
  }
}

const MID_TENDER_MILESTONES: Record<string, number> = {
  'NIT Published': 10,
  'Bid Submission (Open)': 25,
  'Technical Evaluation': 45,
  'Financial Evaluation': 65,
  'Approval Process': 85,
  'LoA Issued': 95,
};

async function ensureMilestonesForAll(p: ProjectRow): Promise<void> {
  const [existing] = await db.select().from(projectMilestone).where(eq(projectMilestone.projectId, p.projectId)).limit(1);
  if (existing) return;

  const evalPct = p.tenderSubStage ? MID_TENDER_MILESTONES[p.tenderSubStage] : undefined;
  if (evalPct === undefined) return; // covered by seedDummyPresentationExtras2.ts's ensureMilestones already

  const plans = [
    { name: 'DPR & Technical Sanction', weightPct: 15, progressPct: 100 },
    { name: 'Tender Floating & NIT Publication', weightPct: 15, progressPct: 100 },
    { name: 'Bid Evaluation Process', weightPct: 30, progressPct: evalPct },
    { name: 'Letter of Award Issuance', weightPct: 20, progressPct: 0 },
    { name: 'Agreement & Mobilization', weightPct: 20, progressPct: 0 },
  ];
  const created = await replaceMilestones(p.projectId, {
    milestones: plans.map((m, i) => ({ milestoneName: m.name, weightPct: m.weightPct, plannedDate: '2027-03-31', sortOrder: i })),
  }, SEED_ACTOR);
  const byName = new Map(created.map((m) => [m.milestoneName, m.milestoneId]));
  await upsertMonthlyProgress(p.projectId, {
    snapMonth: '2026-08-01',
    entries: plans.map((m) => ({ milestoneId: byName.get(m.name)!, progressPct: m.progressPct, note: null })),
  }, SEED_ACTOR);
  process.stdout.write(`created mid-tender milestones: ${p.projectName}\n`);
}

async function ensureSchemeAssigned(p: ProjectRow, schemeIds: number[]): Promise<void> {
  const [existing] = await db.select({ id: projectScheme.projectId }).from(projectScheme).where(eq(projectScheme.projectId, p.projectId)).limit(1);
  if (existing || schemeIds.length === 0) return;
  const seed = seedFromId(p.projectId);
  await db.insert(projectScheme).values({ projectId: p.projectId, schemeId: pick(schemeIds, seed) });
  process.stdout.write(`assigned a scheme: ${p.projectName}\n`);
}

async function ensureCosEot(p: ProjectRow): Promise<void> {
  const [existing] = await db.select({ id: cosEotItem.cosId }).from(cosEotItem).where(eq(cosEotItem.projectId, p.projectId)).limit(1);
  if (existing) return;
  const seed = seedFromId(p.projectId);
  const originalEnd = p.plannedEndDate ?? '2027-03-31';
  const category = pick(['SCOPE ADDITION', 'DESIGN CHANGE', 'QUANTITY VARIATION', 'OTHERS'] as const, seed);
  await createCosEot(p.projectId, {
    cosNumber: `COS/2026/${p.projectId.slice(0, 4).toUpperCase()}`,
    cosDate: addDays(originalEnd, -120),
    category,
    cosAmountCr: round2(Math.round(Number(p.aaAmountCr ?? 60) * 0.03 * 100) / 100),
    variationPct: '3',
    eotNumber: `EOT/2026/${p.projectId.slice(0, 4).toUpperCase()}`,
    eotDaysGranted: 30 + (seed % 60),
    timeLinked: true,
    originalEndDate: originalEnd,
    newEndDate: addDays(originalEnd, 30 + (seed % 60)),
    revisedDate: addDays(originalEnd, -90),
  }, SEED_ACTOR);
  process.stdout.write(`created CoS/EoT record: ${p.projectName}\n`);
}

async function main(): Promise<void> {
  const rows = await db.select().from(project);
  const dummy = rows.filter((r) => DUMMY_NAME_PATTERN.test(r.projectName));
  process.stdout.write(`Processing ${dummy.length} dummy projects...\n`);

  const districts = await db.select().from(district);
  const districtIdByName = new Map(districts.map((d) => [d.districtName, d.districtId]));

  for (const p of dummy) {
    await fillCoreFields(p, districtIdByName);
  }

  const afterCore = (await db.select().from(project)).filter((r) => DUMMY_NAME_PATTERN.test(r.projectName));
  for (const p of afterCore) {
    await fillFinancialsUnconditional(p);
  }

  const afterFinancials = (await db.select().from(project)).filter((r) => DUMMY_NAME_PATTERN.test(r.projectName));
  const schemeRows = await db.select().from(scheme);
  const schemeIds = schemeRows.map((s) => s.schemeId);
  for (const p of afterFinancials) {
    await completeFundsUc(p);
    await ensureMilestonesForAll(p);
    await ensureSchemeAssigned(p, schemeIds);
    await ensureCosEot(p);
  }

  process.stdout.write('\nDone.\n');
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    return pool.end().finally(() => process.exit(1));
  });
