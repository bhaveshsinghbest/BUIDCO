/**
 * One-shot backfill for presentation completeness (bhaveshTask.md Task 3).
 * Covers the gaps found by auditing the existing dummy data:
 *
 *  1. Agreement/PBG/EMD details for the 6 tender-stage dummy projects that
 *     had already reached "Agreement Signing" or "Work Order Issued" —
 *     realistically those details would exist by that sub-stage, but the
 *     tender seed scripts (reasonably) leave them blank for every other
 *     sub-stage where no agreement exists yet.
 *  2. One data-consistency fix: a project sitting at "NIT Published" had
 *     somehow also picked up an agreementNumber, which can't happen in
 *     reality (agreements are signed after NIT, not before) — cleared.
 *  3. Milestones + one progress snapshot for the 4 dummy projects that are
 *     actually in/through construction (In Progress, On Hold, Completed
 *     with a real build history) — skipped for the two still in
 *     Conceptualisation/Pre-Tender, since those logically don't have
 *     construction milestones yet.
 *  4. A handful of Minutes of Meeting + action points — this module had
 *     zero rows anywhere in the database.
 *
 * Everything here goes through the same service functions the API routes
 * use, so it gets real audit trail entries and passes the same validation
 * as user-entered data. Idempotent per section (checked via existence
 * queries) so re-running is safe.
 *
 * Usage:
 *   npm run db:seed-dummy-extras
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { minutesOfMeeting, project, projectMilestone } from './schema.js';
import type { AuditActor } from '../lib/audit.js';
import { updateProject } from '../services/projectsService.js';
import { replaceMilestones, upsertMonthlyProgress } from '../services/milestonesService.js';
import { createMom, createActionPoint } from '../services/momService.js';

const SEED_ACTOR: AuditActor = {
  userId: null,
  username: 'system:seed-extras',
  role: 'MD',
};

/* ============================================================
 * 1. Agreement / PBG / EMD backfill for late-stage tender projects
 * ============================================================ */

const LATE_TENDER_PROJECTS: Array<{
  id: string;
  agreementDate: string;
  agreementAmountCr: number;
  pbgNumber: string;
  pbgAmountCr: number;
  pbgIssuingBank: string;
  pbgExpiryDate: string;
  emdAmountCr: number;
  emdRefNumber: string;
  emdDate: string;
}> = [
  {
    id: 'baab9e8c-5453-494d-87fa-50ec6779f7df', // Buxar Sewerage Network Expansion — Package 7
    agreementDate: '2026-07-18', agreementAmountCr: 8.6,
    pbgNumber: 'PBG/UBI/2026/2214', pbgAmountCr: 0.86, pbgIssuingBank: 'Union Bank of India', pbgExpiryDate: '2027-07-18',
    emdAmountCr: 0.34, emdRefNumber: 'EMD/2026/0214', emdDate: '2026-05-02',
  },
  {
    id: 'c6515768-d278-453f-9242-688b60834a71', // Ara Storm Water Drainage Improvement — Package 8
    agreementDate: '2026-06-25', agreementAmountCr: 5.1,
    pbgNumber: 'PBG/SBI/2026/2201', pbgAmountCr: 0.51, pbgIssuingBank: 'State Bank of India', pbgExpiryDate: '2027-06-25',
    emdAmountCr: 0.2, emdRefNumber: 'EMD/2026/0201', emdDate: '2026-04-14',
  },
  {
    id: 'bacc9772-fd34-4c35-99f4-65968ed2b44a', // Ara Public Infrastructure Development Works — Package 15
    agreementDate: '2026-07-30', agreementAmountCr: 6.8,
    pbgNumber: 'PBG/SBI/2026/2233', pbgAmountCr: 0.68, pbgIssuingBank: 'State Bank of India', pbgExpiryDate: '2027-07-30',
    emdAmountCr: 0.27, emdRefNumber: 'EMD/2026/0233', emdDate: '2026-05-19',
  },
  {
    id: 'e5a2af65-0b5b-4b8e-8c03-75df7a764548', // Chapra Water Supply Augmentation Scheme — Package 16
    agreementDate: '2026-06-10', agreementAmountCr: 4.3,
    pbgNumber: 'PBG/PNB/2026/2189', pbgAmountCr: 0.43, pbgIssuingBank: 'Punjab National Bank', pbgExpiryDate: '2027-06-10',
    emdAmountCr: 0.17, emdRefNumber: 'EMD/2026/0189', emdDate: '2026-03-28',
  },
  {
    id: '30cd10a9-8b62-496a-86d6-f203ec89757d', // Jamui Sewerage Network Expansion — Delay Test G
    agreementDate: '2026-04-22', agreementAmountCr: 7.4,
    pbgNumber: 'PBG/UBI/2026/2156', pbgAmountCr: 0.74, pbgIssuingBank: 'Union Bank of India', pbgExpiryDate: '2027-04-22',
    emdAmountCr: 0.3, emdRefNumber: 'EMD/2026/0156', emdDate: '2026-02-11',
  },
  {
    id: 'f7b8e8d0-dac2-44dd-8855-928d513ab90b', // Supaul Storm Water Drainage Improvement — Delay Test H
    agreementDate: '2026-03-15', agreementAmountCr: 3.9,
    pbgNumber: 'PBG/BOB/2026/2098', pbgAmountCr: 0.39, pbgIssuingBank: 'Bank of Baroda', pbgExpiryDate: '2027-03-15',
    emdAmountCr: 0.16, emdRefNumber: 'EMD/2026/0098', emdDate: '2026-01-20',
  },
];

const INCONSISTENT_PROJECT_ID = '10e9ce5b-c3e7-4129-ba04-9a061e4fbe1f'; // Gaya — NIT Published but had an agreementNumber

/* ============================================================
 * 3. Milestones for projects actually in/through construction
 * ============================================================ */

interface MilestonePlan {
  id: string;
  overallPhysicalPct: number;
  snapMonth: string;
  milestones: Array<{ name: string; weightPct: number; plannedDate: string; progressPct: number }>;
}

const MILESTONE_PLANS: MilestonePlan[] = [
  {
    id: '9ad5f24b-3f30-49a1-8051-a7e8d38b10d0', // Bhagalpur Storm Water Drainage Rehabilitation — On Hold, 58%
    overallPhysicalPct: 58, snapMonth: '2026-08-01',
    milestones: [
      { name: 'Survey, Design & Approval', weightPct: 15, plannedDate: '2023-06-30', progressPct: 100 },
      { name: 'Mobilization & Site Clearance', weightPct: 10, plannedDate: '2023-09-30', progressPct: 100 },
      { name: 'Drain Excavation & Lining — Phase 1', weightPct: 30, plannedDate: '2024-12-31', progressPct: 95 },
      { name: 'Drain Excavation & Lining — Phase 2', weightPct: 25, plannedDate: '2025-12-31', progressPct: 15 },
      { name: 'Testing & Handover', weightPct: 20, plannedDate: '2026-06-30', progressPct: 0 },
    ],
  },
  {
    id: 'bfb57422-ec8c-4064-8738-c4c060f9edb7', // Muzaffarpur Electric Crematorium Modernisation — Completed, 100%
    overallPhysicalPct: 100, snapMonth: '2023-06-01',
    milestones: [
      { name: 'Design & Statutory Approvals', weightPct: 10, plannedDate: '2022-01-31', progressPct: 100 },
      { name: 'Civil Construction', weightPct: 40, plannedDate: '2022-10-31', progressPct: 100 },
      { name: 'Equipment Installation', weightPct: 30, plannedDate: '2023-02-28', progressPct: 100 },
      { name: 'Testing & Commissioning', weightPct: 15, plannedDate: '2023-05-15', progressPct: 100 },
      { name: 'Final Handover', weightPct: 5, plannedDate: '2023-06-30', progressPct: 100 },
    ],
  },
  {
    id: '5513a7e9-dbe2-4445-91ad-b6ace8b62ffa', // Patna Sewerage Network Augmentation — Phase II — In Progress, 62%
    overallPhysicalPct: 62, snapMonth: '2026-08-01',
    milestones: [
      { name: 'Design & Utility Mapping', weightPct: 10, plannedDate: '2023-09-30', progressPct: 100 },
      { name: 'Trunk Sewer Laying — Zone A', weightPct: 25, plannedDate: '2024-09-30', progressPct: 100 },
      { name: 'Trunk Sewer Laying — Zone B', weightPct: 25, plannedDate: '2025-09-30', progressPct: 78 },
      { name: 'Pumping Station Construction', weightPct: 25, plannedDate: '2026-09-30', progressPct: 20 },
      { name: 'Testing, Commissioning & Handover', weightPct: 15, plannedDate: '2027-01-15', progressPct: 0 },
    ],
  },
  {
    id: '427b5d0d-c358-4a9e-84fa-6bd420374d27', // Hajipur Sewerage Treatment Plant Expansion — Completed, 100%
    overallPhysicalPct: 100, snapMonth: '2026-03-01',
    milestones: [
      { name: 'Design & Environmental Clearance', weightPct: 10, plannedDate: '2021-02-28', progressPct: 100 },
      { name: 'Civil Works — STP Structure', weightPct: 35, plannedDate: '2022-08-31', progressPct: 100 },
      { name: 'Electro-Mechanical Installation', weightPct: 30, plannedDate: '2024-06-30', progressPct: 100 },
      { name: 'Trial Run & Performance Testing', weightPct: 15, plannedDate: '2025-11-30', progressPct: 100 },
      { name: 'Final Handover to O&M', weightPct: 10, plannedDate: '2026-03-31', progressPct: 100 },
    ],
  },
];

/* ============================================================
 * 4. Minutes of Meeting
 * ============================================================ */

interface MomPlan {
  meetingDate: string;
  meetingTitle: string;
  venue: string;
  chairperson: string;
  attendees: string;
  projectId: string | null;
  agenda: string;
  decisions: string;
  momStatus: 'Action Pending' | 'In Progress' | 'Resolved' | 'Deferred';
  actionPoints: Array<{ description: string; owner: string; dueDate: string; status: 'Open' | 'Closed'; resolutionDate?: string }>;
}

const MOM_PLANS: MomPlan[] = [
  {
    meetingDate: '2026-08-05', meetingTitle: 'Monthly Progress Review — Water & Sewerage Schemes',
    venue: 'BUIDCO Head Office, Patna', chairperson: 'Managing Director, BUIDCO',
    attendees: 'MD; Executive Director (Projects); Project Directors — Patna, Vaishali divisions; Executive Engineers',
    projectId: '5513a7e9-dbe2-4445-91ad-b6ace8b62ffa', // Patna Sewerage Network Augmentation — Phase II
    agenda: 'Review of physical/financial progress on Patna Sewerage Network Augmentation — Phase II; pumping station land acquisition status.',
    decisions: 'PD directed to expedite pole-shifting NOC from Electricity Dept. within 3 weeks. Third-party quality audit report to be tabled in next review.',
    momStatus: 'In Progress',
    actionPoints: [
      { description: 'Obtain pole-shifting NOC from Electricity Department for pumping station site', owner: 'Executive Engineer, Patna Division', dueDate: '2026-08-26', status: 'Open' },
      { description: 'Submit third-party quality audit report for pumping station 1', owner: 'Quality Assurance Cell', dueDate: '2026-09-10', status: 'Open' },
    ],
  },
  {
    meetingDate: '2026-07-22', meetingTitle: 'Tender Committee Meeting — Q3 Batch Approvals',
    venue: 'BUIDCO Conference Hall', chairperson: 'Managing Director, BUIDCO',
    attendees: 'MD; Finance Controller; Tender Committee Members; Executive Engineers (Tender Cell)',
    projectId: null,
    agenda: 'Approval of technical/financial evaluation reports for Q3 tender batch; review of projects nearing Agreement Signing.',
    decisions: 'Approved LoA issuance for 3 packages pending final vetting. Agreement signing timelines to be tracked weekly on the Tender Dashboard.',
    momStatus: 'Resolved',
    actionPoints: [
      { description: 'Circulate approved LoA list to concerned Project Directors', owner: 'Tender Cell', dueDate: '2026-07-29', status: 'Closed', resolutionDate: '2026-07-27' },
    ],
  },
  {
    meetingDate: '2026-06-14', meetingTitle: 'Site Review — Bhagalpur Storm Water Drainage Rehabilitation',
    venue: 'Project Site Office, Bhagalpur', chairperson: 'Executive Director (Projects)',
    attendees: 'Executive Director (Projects); Project Director, Bhagalpur Division; Contractor representative; Design Consultant',
    projectId: '9ad5f24b-3f30-49a1-8051-a7e8d38b10d0', // Bhagalpur Storm Water Drainage Rehabilitation
    agenda: 'Review of stalled Phase 2 excavation works and pending revised drawings from design consultant.',
    decisions: 'Consultant to submit revised drawings within 2 weeks; work to resume immediately after utility-clash survey is cleared.',
    momStatus: 'Action Pending',
    actionPoints: [
      { description: 'Submit revised drawings incorporating utility-clash survey findings', owner: 'Design Consultant', dueDate: '2026-06-28', status: 'Open' },
    ],
  },
  {
    meetingDate: '2026-05-30', meetingTitle: 'Pre-Monsoon Preparedness Coordination Meeting',
    venue: 'BUIDCO Head Office, Patna', chairperson: 'Managing Director, BUIDCO',
    attendees: 'MD; all Divisional Project Directors; District Disaster Management Authority representatives',
    projectId: null,
    agenda: 'Divisional readiness review ahead of monsoon season — desilting progress, drain-outfall clearance, emergency equipment stock.',
    decisions: 'All divisions to complete desilting of major drains by 15 June 2026 and submit compliance photographs.',
    momStatus: 'Resolved',
    actionPoints: [
      { description: 'Submit divisional desilting compliance report with photographs', owner: 'All Divisional PDs', dueDate: '2026-06-15', status: 'Closed', resolutionDate: '2026-06-13' },
    ],
  },
  {
    meetingDate: '2026-04-09', meetingTitle: 'O&M Handover Review — Completed Schemes',
    venue: 'BUIDCO Head Office, Patna', chairperson: 'Executive Director (Projects)',
    attendees: 'Executive Director (Projects); O&M Cell; Project Directors — Muzaffarpur, Vaishali divisions',
    projectId: '427b5d0d-c358-4a9e-84fa-6bd420374d27', // Hajipur Sewerage Treatment Plant Expansion
    agenda: 'Review of O&M performance for Hajipur STP Expansion and Muzaffarpur Crematorium schemes post-handover.',
    decisions: 'Both schemes cleared for routine O&M cycle; next performance review scheduled after 6 months.',
    momStatus: 'Deferred',
    actionPoints: [
      { description: 'Schedule 6-month O&M performance review for both completed schemes', owner: 'O&M Cell', dueDate: '2026-10-09', status: 'Open' },
    ],
  },
];

/* ============================================================
 * Runner
 * ============================================================ */

async function backfillLateTenderAgreements(): Promise<void> {
  for (const p of LATE_TENDER_PROJECTS) {
    const [row] = await db.select({ agreementNumber: project.agreementNumber, projectName: project.projectName }).from(project).where(eq(project.projectId, p.id)).limit(1);
    if (!row) { process.stdout.write(`skip (not found): ${p.id}\n`); continue; }
    if (row.agreementNumber) { process.stdout.write(`skip (already has agreement): ${row.projectName}\n`); continue; }
    await updateProject(p.id, {
      agreementNumber: `BUIDCO/AGR/2026/${p.id.slice(0, 4).toUpperCase()}`,
      agreementDate: p.agreementDate,
      agreementAmountCr: String(p.agreementAmountCr),
      pbgNumber: p.pbgNumber,
      pbgAmountCr: String(p.pbgAmountCr),
      pbgIssuingBank: p.pbgIssuingBank,
      pbgExpiryDate: p.pbgExpiryDate,
      emdAmountCr: String(p.emdAmountCr),
      emdRefNumber: p.emdRefNumber,
      emdDate: p.emdDate,
    }, SEED_ACTOR);
    process.stdout.write(`apply agreement/PBG/EMD: ${row.projectName}\n`);
  }
}

async function fixInconsistentAgreement(): Promise<void> {
  const [row] = await db.select({ agreementNumber: project.agreementNumber, projectName: project.projectName }).from(project).where(eq(project.projectId, INCONSISTENT_PROJECT_ID)).limit(1);
  if (!row) { process.stdout.write('skip consistency fix (project not found)\n'); return; }
  if (!row.agreementNumber) { process.stdout.write('skip consistency fix (already clean)\n'); return; }
  await updateProject(INCONSISTENT_PROJECT_ID, {
    agreementNumber: null, agreementDate: null, agreementAmountCr: null,
  }, SEED_ACTOR);
  process.stdout.write(`fixed inconsistency: ${row.projectName} (cleared agreement fields — still at NIT Published)\n`);
}

async function seedMilestones(): Promise<void> {
  for (const plan of MILESTONE_PLANS) {
    const existing = await db.select().from(projectMilestone).where(eq(projectMilestone.projectId, plan.id));
    if (existing.length > 0) { process.stdout.write(`skip milestones (already present): ${plan.id}\n`); continue; }

    const created = await replaceMilestones(plan.id, {
      milestones: plan.milestones.map((m, i) => ({
        milestoneName: m.name,
        weightPct: m.weightPct,
        plannedDate: m.plannedDate,
        sortOrder: i,
      })),
    }, SEED_ACTOR);

    const byName = new Map(created.map((m) => [m.milestoneName, m.milestoneId]));
    await upsertMonthlyProgress(plan.id, {
      snapMonth: plan.snapMonth,
      entries: plan.milestones.map((m) => ({
        milestoneId: byName.get(m.name)!,
        progressPct: m.progressPct,
        note: null,
      })),
    }, SEED_ACTOR);
    process.stdout.write(`apply milestones (${plan.milestones.length}): ${plan.id}\n`);
  }
}

async function seedMom(): Promise<void> {
  const existingCount = (await db.select().from(minutesOfMeeting)).length;
  if (existingCount > 0) { process.stdout.write(`skip MoM (${existingCount} already present)\n`); return; }

  for (const m of MOM_PLANS) {
    const row = await createMom({
      meetingDate: m.meetingDate,
      meetingTitle: m.meetingTitle,
      venue: m.venue,
      chairperson: m.chairperson,
      attendees: m.attendees,
      projectId: m.projectId,
      agenda: m.agenda,
      decisions: m.decisions,
      momStatus: m.momStatus,
    }, SEED_ACTOR);
    for (const ap of m.actionPoints) {
      await createActionPoint(row.momId, {
        description: ap.description,
        owner: ap.owner,
        dueDate: ap.dueDate,
        status: ap.status,
        resolutionDate: ap.resolutionDate ?? null,
      }, SEED_ACTOR);
    }
    process.stdout.write(`apply MoM: ${m.meetingTitle}\n`);
  }
}

async function main(): Promise<void> {
  await backfillLateTenderAgreements();
  await fixInconsistentAgreement();
  await seedMilestones();
  await seedMom();
  process.stdout.write('Presentation-completeness backfill done.\n');
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    return pool.end().finally(() => process.exit(1));
  });
