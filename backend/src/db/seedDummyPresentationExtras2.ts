/**
 * Second, broader pass at presentation completeness (bhaveshTask.md follow-up
 * — "add dummy data in revised AA, Agreement amount, Contract & Financial,
 * PBG & EMD, Funding Source & UC, O&M, Management Action, Milestone in each
 * project"). The first pass (seedDummyPresentationExtras.ts) was narrower —
 * this widens coverage across all 39 dummy projects using a maturity model
 * derived from each project's own current tender sub-stage / execution
 * status, so the numbers stay internally consistent rather than just
 * uniformly filled in regardless of where a project actually stands:
 *
 *   Tier 0  Conceptualisation / Pre-Tender / NIT Published
 *           → nothing beyond AA Amount + Revised AA (pre-tender sanctions
 *             exist before a tender is even floated).
 *   Tier 1  Bid Submission, Technical/Financial Evaluation, Approval Process
 *           → + EMD (submitted with the bid, long before an agreement).
 *   Tier 2  LoA Issued
 *           → + Agreement Number/Date/Amount, Contract Value, PBG,
 *             O&M applicability + contracted period (fixed at award, even
 *             though O&M itself hasn't started).
 *   Tier 3  Agreement Signing / Work Order Issued, or a non-tender project
 *           actually in Construction/On Hold/Delayed with real progress
 *           → + deeper Contract & Financial (mobilisation advance,
 *             retention, running payments, last RA bill) and early-stage
 *             Milestones.
 *   Tier 4  Completed
 *           → full O&M (dates + agency) and milestones at 100%.
 *
 * Every project also gets a Funding Source & UC entry if it doesn't already
 * have one, and at least one Management Action if it currently has zero.
 * All writes go through the same service functions the API uses (audit
 * trail, validation) and are idempotent — re-running only fills genuine gaps.
 *
 * Usage: npm run db:seed-dummy-extras-2
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { managementActionItem, minutesOfMeeting, project, projectFundsUc, projectMilestone } from './schema.js';
import type { AuditActor } from '../lib/audit.js';
import { updateProject } from '../services/projectsService.js';
import { replaceMilestones, upsertMonthlyProgress } from '../services/milestonesService.js';
import { createFundsUc } from '../services/fundsUcService.js';
import { createMgmtAction } from '../services/managementActionService.js';

const SEED_ACTOR: AuditActor = { userId: null, username: 'system:seed-extras-2', role: 'MD' };
const DUMMY_NAME_PATTERN = /delay test|package \d|smart city|augmentation|drainage|crematorium|sewerage/i;

const LOA_OR_LATER = new Set(['LoA Issued', 'Agreement Signing', 'Work Order Issued']);
const BID_OR_LATER = new Set(['Bid Submission (Open)', 'Technical Evaluation', 'Financial Evaluation', 'Approval Process', 'LoA Issued', 'Agreement Signing', 'Work Order Issued']);
const CONSTRUCTION_STARTED_SUBSTAGES = new Set(['Agreement Signing', 'Work Order Issued']);
const NON_TENDER_EXECUTION_STATUSES = new Set(['In Progress', 'On Hold', 'Delayed']);

const BANKS = ['State Bank of India', 'Punjab National Bank', 'Bank of Baroda', 'Union Bank of India', 'Central Bank of India', 'UCO Bank'];
const bankCodeOf = (bank: string): string => ({ 'State Bank of India': 'SBI', 'Punjab National Bank': 'PNB', 'Bank of Baroda': 'BOB', 'Union Bank of India': 'UBI', 'Central Bank of India': 'CBI', 'UCO Bank': 'UCO' })[bank] ?? 'SBI';

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

type ProjectRow = typeof project.$inferSelect;

async function fillFinancials(p: ProjectRow): Promise<void> {
  const seed = seedFromId(p.projectId);
  const patch: Record<string, unknown> = {};

  // Revised AA — a modest 2-8% revision over the sanctioned AA, wherever an
  // AA amount already exists. Purnea (Conceptualisation) has none yet — give
  // it a fresh administrative sanction, which is realistic even this early.
  let aaAmountCr = p.aaAmountCr ? Number(p.aaAmountCr) : null;
  if (aaAmountCr === null) {
    aaAmountCr = 60 + (seed % 40);
    patch.aaAmountCr = round2(aaAmountCr);
  }
  if (!p.revisedAaAmountCr) {
    const bump = 1 + (0.02 + (seed % 7) * 0.01);
    patch.revisedAaAmountCr = round2(aaAmountCr * bump);
  }

  const subStage = p.tenderSubStage;
  const isNonTenderExecuting = p.projectStageV2 !== 'Tender' && NON_TENDER_EXECUTION_STATUSES.has(p.status) && Number(p.physicalProgressPct ?? 0) > 0;
  const isCompleted = p.status === 'Completed';

  // EMD — submitted with the bid, so it exists from Bid Submission onward.
  if (!p.emdRefNumber && subStage && BID_OR_LATER.has(subStage)) {
    const emdAmount = Math.round(aaAmountCr * 0.02 * 100) / 100;
    patch.emdAmountCr = round2(emdAmount);
    patch.emdRefNumber = `EMD/2026/${(1000 + (seed % 8999))}`;
    patch.emdDate = '2026-04-01';
  }

  // Agreement / Contract Value / PBG — fixed once the Letter of Award issues.
  const atLoaOrLater = (subStage && LOA_OR_LATER.has(subStage)) || isNonTenderExecuting || isCompleted;
  if (atLoaOrLater && !p.agreementNumber) {
    const contractValue = Math.round(aaAmountCr * (0.85 + (seed % 10) * 0.01) * 100) / 100;
    const bank = pick(BANKS, seed);
    patch.agreementNumber = `BUIDCO/AGR/2026/${p.projectId.slice(0, 4).toUpperCase()}`;
    patch.agreementDate = '2026-05-15';
    patch.agreementAmountCr = round2(contractValue);
    patch.contractValueCr = round2(contractValue);
    patch.pbgNumber = `PBG/${bankCodeOf(bank)}/2026/${(2000 + (seed % 900))}`;
    patch.pbgAmountCr = round2(contractValue * 0.1);
    patch.pbgIssuingBank = bank;
    patch.pbgExpiryDate = '2027-05-15';
  }

  // O&M applicability + contracted period — decided at award, even though
  // O&M itself (dates, agency) only starts once construction is complete.
  if (atLoaOrLater && !p.omApplicable) {
    patch.omApplicable = true;
    patch.omPeriodMonths = String(pick([36, 48, 60], seed));
  }

  // Deeper Contract & Financial — only once real work is underway.
  const constructionStarted = (subStage && CONSTRUCTION_STARTED_SUBSTAGES.has(subStage)) || isNonTenderExecuting || isCompleted;
  if (constructionStarted && !p.mobAdvanceIssuedCr) {
    const cv = Number(patch.contractValueCr ?? p.contractValueCr ?? aaAmountCr);
    const physPct = Number(p.physicalProgressPct ?? (isCompleted ? 100 : 10));
    const mobIssued = Math.round(cv * 0.1 * 100) / 100;
    const mobRecovered = Math.round(mobIssued * Math.min(physPct / 100, 1) * 100) / 100;
    const totalPayments = Math.round(cv * Math.min(physPct / 100, 1) * 0.95 * 100) / 100;
    patch.mobAdvanceIssuedCr = round2(mobIssued);
    patch.mobAdvanceRecoveredCr = round2(mobRecovered);
    patch.advanceOutstandingCr = round2(Math.max(mobIssued - mobRecovered, 0));
    patch.retentionMoneyHeldCr = round2(Math.round(totalPayments * 0.05 * 100) / 100);
    patch.totalPaymentsCr = round2(totalPayments);
    patch.lastPaymentDate = isCompleted ? '2026-02-15' : '2026-07-20';
    patch.lastRaBillNo = `RA/${(10 + (seed % 40))}/2026`;
  }

  // Completed projects — O&M has genuinely started; fill dates + agency.
  if (isCompleted && !p.omStartDate) {
    patch.omStartDate = '2026-01-01';
    patch.omEndDate = '2029-01-01';
    patch.omAgency = pick(['M/s Kosi Infra Developers Pvt. Ltd.', 'M/s Sone Valley Construction Co.', 'M/s Mithila Builders & Engineers'], seed);
    patch.omRemarks = 'Routine O&M cycle in progress; no major defects reported to date.';
  }

  if (Object.keys(patch).length > 0) {
    await updateProject(p.projectId, patch, SEED_ACTOR);
    process.stdout.write(`updated financials (${Object.keys(patch).length} fields): ${p.projectName}\n`);
  }
}

async function ensureFundsUc(p: ProjectRow): Promise<void> {
  const [existing] = await db.select({ id: projectFundsUc.fundsUcId }).from(projectFundsUc).where(eq(projectFundsUc.projectId, p.projectId)).limit(1);
  if (existing) return;
  const seed = seedFromId(p.projectId);
  const sources = ['Central - EAP', 'Central - Non-EAP', 'Central - State Share', 'State Funded'] as const;
  const fundingSource = pick(sources, seed);
  const opening = 5 + (seed % 20);
  const grant = 3 + (seed % 15);
  const spend = Math.round(Math.min(opening + grant, opening + grant) * 0.4 * 100) / 100;
  await createFundsUc({
    projectId: p.projectId,
    fundingSource,
    openingBalanceCr: opening,
    grantReceivedCr: grant,
    expenditureIncurredCr: spend,
    ...(fundingSource === 'Central - State Share' ? { centralSharePct: 60, stateSharePct: 40 } : {}),
    sanctionNo: `BUIDCO/FIN/2026/${(3000 + (seed % 999))}`,
    ucSubmittedDate: null,
    remarks: null,
  }, SEED_ACTOR);
  process.stdout.write(`created funds & UC entry: ${p.projectName}\n`);
}

async function ensureMilestones(p: ProjectRow): Promise<void> {
  const [existing] = await db.select().from(projectMilestone).where(eq(projectMilestone.projectId, p.projectId)).limit(1);
  if (existing) return;

  const isCompleted = p.status === 'Completed';
  const physPct = Number(p.physicalProgressPct ?? 0);
  const isNonTenderExecuting = p.projectStageV2 !== 'Tender' && NON_TENDER_EXECUTION_STATUSES.has(p.status);
  const isEarlyPlanning = p.projectStageV2 === 'Conceptualisation' || p.projectStageV2 === 'Pre-Tender';
  const justAwarded = p.tenderSubStage && CONSTRUCTION_STARTED_SUBSTAGES.has(p.tenderSubStage);

  if (!isCompleted && !isNonTenderExecuting && !isEarlyPlanning && !justAwarded) return; // still mid-tender, no milestones yet

  let plans: Array<{ name: string; weightPct: number; progressPct: number }>;
  if (isEarlyPlanning) {
    plans = [
      { name: 'Detailed Project Report (DPR) Preparation', weightPct: 25, progressPct: physPct > 0 ? 100 : 40 },
      { name: 'Environmental & Statutory Clearances', weightPct: 20, progressPct: 20 },
      { name: 'Land Acquisition', weightPct: 20, progressPct: 10 },
      { name: 'Technical Sanction', weightPct: 20, progressPct: 0 },
      { name: 'Tender Floating', weightPct: 15, progressPct: 0 },
    ];
  } else if (isCompleted) {
    plans = [
      { name: 'Design & Statutory Approvals', weightPct: 15, progressPct: 100 },
      { name: 'Civil Construction', weightPct: 40, progressPct: 100 },
      { name: 'Electro-Mechanical / Finishing Works', weightPct: 25, progressPct: 100 },
      { name: 'Testing & Commissioning', weightPct: 15, progressPct: 100 },
      { name: 'Final Handover', weightPct: 5, progressPct: 100 },
    ];
  } else {
    // In construction (non-tender execution) or just-awarded tender project.
    const base = justAwarded ? 5 : Math.max(physPct, 10);
    plans = [
      { name: 'Mobilization & Site Handover', weightPct: 10, progressPct: Math.min(base * 4, 100) },
      { name: 'Site Clearance & Preliminary Works', weightPct: 15, progressPct: Math.min(base * 2, 100) },
      { name: 'Primary Civil Works', weightPct: 35, progressPct: Math.min(base, 100) },
      { name: 'Secondary Works & Utilities', weightPct: 25, progressPct: Math.max(base - 20, 0) },
      { name: 'Testing & Handover', weightPct: 15, progressPct: 0 },
    ];
  }

  const created = await replaceMilestones(p.projectId, {
    milestones: plans.map((m, i) => ({ milestoneName: m.name, weightPct: m.weightPct, plannedDate: '2027-03-31', sortOrder: i })),
  }, SEED_ACTOR);
  const byName = new Map(created.map((m) => [m.milestoneName, m.milestoneId]));
  await upsertMonthlyProgress(p.projectId, {
    snapMonth: '2026-08-01',
    entries: plans.map((m) => ({ milestoneId: byName.get(m.name)!, progressPct: m.progressPct, note: null })),
  }, SEED_ACTOR);
  process.stdout.write(`created milestones (${plans.length}): ${p.projectName}\n`);
}

const MGMT_ACTIONS_BY_TIER: Record<string, string> = {
  'NIT Published': 'Coordinate pre-bid meeting queries with prospective bidders',
  'Bid Submission (Open)': 'Track bid submission count and follow up with divisional office on portal issues',
  'Technical Evaluation': 'Expedite technical evaluation committee sign-off',
  'Financial Evaluation': 'Reconcile financial bid comparison statement with Finance Cell',
  'Approval Process': 'Follow up on competent authority approval file',
  'LoA Issued': 'Coordinate with awarded contractor for agreement documentation',
  'Agreement Signing': 'Verify PBG and EMD conversion before work order issuance',
  'Work Order Issued': 'Confirm site handover and contractor mobilization schedule',
};

async function ensureManagementAction(p: ProjectRow): Promise<void> {
  const [existing] = await db.select({ id: managementActionItem.itemId }).from(managementActionItem).where(eq(managementActionItem.projectId, p.projectId)).limit(1);
  if (existing) return;
  const topic = (p.tenderSubStage && MGMT_ACTIONS_BY_TIER[p.tenderSubStage])
    ?? (p.status === 'Completed' ? 'Schedule post-completion O&M performance review' : 'Review project progress and resolve pending inter-departmental issues');
  await createMgmtAction(p.projectId, { topic, status: 'Open', deadlineDate: '2026-09-30' }, SEED_ACTOR);
  process.stdout.write(`created management action: ${p.projectName}\n`);
}

async function main(): Promise<void> {
  const rows = await db.select().from(project);
  const dummy = rows.filter((r) => DUMMY_NAME_PATTERN.test(r.projectName));
  process.stdout.write(`Processing ${dummy.length} dummy projects...\n`);

  for (const p of dummy) {
    await fillFinancials(p);
  }
  // Re-fetch after financial updates so milestone/O&M tier decisions see fresh data.
  const refreshed = await db.select().from(project);
  const refreshedDummy = refreshed.filter((r) => DUMMY_NAME_PATTERN.test(r.projectName));
  for (const p of refreshedDummy) {
    await ensureFundsUc(p);
    await ensureMilestones(p);
    await ensureManagementAction(p);
  }

  const momCount = (await db.select().from(minutesOfMeeting)).length;
  process.stdout.write(`\nDone. Minutes of Meeting on file: ${momCount} (unchanged by this script).\n`);
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    return pool.end().finally(() => process.exit(1));
  });
