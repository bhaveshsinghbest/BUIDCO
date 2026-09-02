/**
 * One-shot dummy-data seeder for Tender Dashboard Delay testing
 * (bhaveshTask.md). The existing 22 dummy Tender-stage projects
 * (seedDummyTenderProjects.ts) all carry a 2028 plannedEndDate — none of
 * them are actually overdue, so the Delay column/filter had nothing to
 * exercise. This adds 8 more Tender-stage projects with plannedEndDate set
 * comfortably in the past, two per delay bucket (>15 / >30 / >60 / >90 days),
 * spread across different tender sub-stages.
 *
 * Idempotent (skips by projectName) — same createProject/updateProject
 * service functions as every other seed script, so these get a real audit
 * trail and pass the same validation as user-created projects. Does not
 * touch any existing project.
 *
 * Usage:
 *   npm run db:seed-dummy-tender-delayed
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { project } from './schema.js';
import type { TenderSubStage } from './enums.js';
import type { AuditActor } from '../lib/audit.js';
import { createProject, updateProject } from '../services/projectsService.js';
import { createProjectSchema } from '../lib/projectFields.js';

const SEED_ACTOR: AuditActor = {
  userId: null,
  username: 'system:seed-tender-delayed',
  role: 'MD',
};

interface DelayedProjectSpec {
  projectName: string;
  city: string;
  sectorName: string;
  divisionName: string;
  contractor: string;
  pd: string;
  plannedEndDate: string;
  subStage: TenderSubStage;
  bucketLabel: string;
}

// Anchored to early Sept 2026 (session date) with enough margin that a few
// days of drift won't push a record out of its intended delay bucket.
const SPECS: DelayedProjectSpec[] = [
  {
    projectName: 'Nawada Water Supply Augmentation Scheme — Delay Test A',
    city: 'Nawada', sectorName: 'Water Supply', divisionName: 'Nawada',
    contractor: 'M/s Kosi Infra Developers Pvt. Ltd.', pd: 'Er. Alok Ranjan',
    plannedEndDate: '2026-08-07', subStage: 'NIT Published', bucketLabel: '>15 days',
  },
  {
    projectName: 'Jehanabad Sewerage Network Expansion — Delay Test B',
    city: 'Jehanabad', sectorName: 'Sewerage', divisionName: 'Jehanabad',
    contractor: 'M/s Sone Valley Construction Co.', pd: 'Er. Shweta Kumari',
    plannedEndDate: '2026-08-05', subStage: 'Bid Submission (Open)', bucketLabel: '>15 days',
  },
  {
    projectName: 'Lakhisarai Storm Water Drainage Improvement — Delay Test C',
    city: 'Lakhisarai', sectorName: 'SWD', divisionName: 'Lakhisarai',
    contractor: 'M/s Mithila Builders & Engineers', pd: 'Er. Nitesh Verma',
    plannedEndDate: '2026-07-23', subStage: 'Technical Evaluation', bucketLabel: '>30 days',
  },
  {
    projectName: 'Sheikhpura Electric Crematorium Construction — Delay Test D',
    city: 'Sheikhpura', sectorName: 'Crematorium', divisionName: 'Sheikhpura',
    contractor: 'M/s Magadh Civil Works Ltd.', pd: 'Er. Poonam Singh',
    plannedEndDate: '2026-07-20', subStage: 'Financial Evaluation', bucketLabel: '>30 days',
  },
  {
    projectName: 'Arwal Public Infrastructure Development Works — Delay Test E',
    city: 'Arwal', sectorName: 'Others', divisionName: 'Arwal',
    contractor: 'M/s Ganga Tirhut Infra Pvt. Ltd.', pd: 'Er. Ravi Shankar',
    plannedEndDate: '2026-06-23', subStage: 'Approval Process', bucketLabel: '>60 days',
  },
  {
    projectName: 'Banka Water Supply Augmentation Scheme — Delay Test F',
    city: 'Banka', sectorName: 'Water Supply', divisionName: 'Banka',
    contractor: 'M/s Bihar Urban Contractors Assn.', pd: 'Er. Meera Jha',
    plannedEndDate: '2026-06-20', subStage: 'LoA Issued', bucketLabel: '>60 days',
  },
  {
    projectName: 'Jamui Sewerage Network Expansion — Delay Test G',
    city: 'Jamui', sectorName: 'Sewerage', divisionName: 'Jamui',
    contractor: 'M/s Champaran Engineering Services', pd: 'Er. Sanjay Paswan',
    plannedEndDate: '2026-05-24', subStage: 'Agreement Signing', bucketLabel: '>90 days',
  },
  {
    projectName: 'Supaul Storm Water Drainage Improvement — Delay Test H',
    city: 'Supaul', sectorName: 'SWD', divisionName: 'Supaul',
    contractor: 'M/s Kosi Infra Developers Pvt. Ltd.', pd: 'Er. Alok Ranjan',
    plannedEndDate: '2026-05-20', subStage: 'Work Order Issued', bucketLabel: '>90 days',
  },
];

async function main(): Promise<void> {
  const sectorRows = await db.query.sector.findMany();
  const divisionRows = await db.query.division.findMany();
  const sectorByName = new Map(sectorRows.map((s) => [s.sectorName, s.sectorId]));
  const divisionByName = new Map(divisionRows.map((d) => [d.divisionName, d.divisionId]));

  let created = 0;
  let skipped = 0;

  for (const spec of SPECS) {
    const [existing] = await db
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectName, spec.projectName))
      .limit(1);
    if (existing) {
      process.stdout.write(`skip  ${spec.projectName} (already exists)\n`);
      skipped++;
      continue;
    }

    const input = createProjectSchema.parse({
      projectName: spec.projectName,
      sectorId: sectorByName.get(spec.sectorName) ?? null,
      divisionId: divisionByName.get(spec.divisionName) ?? null,
      city: spec.city,
      contractor: spec.contractor,
      pd: spec.pd,
      mainWork: `Delay-testing dummy record (${spec.bucketLabel} overdue) for the Tender Dashboard.`,
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      projectBrief: `Dummy Tender-stage project seeded specifically to exercise the Delay filter's "${spec.bucketLabel}" bucket.`,
      projectStageV2: 'Tender',
      status: 'Delayed',
      plannedEndDate: spec.plannedEndDate,
      expectedCompletionDate: spec.plannedEndDate,
      delayReason: `Dummy delay for testing — planned completion overdue by ${spec.bucketLabel}.`,
      priority: 'High',
      aaAmountCr: 12.5,
      physicalProgressPct: 30,
      financialProgressPct: 25,
      scheduledProgressPct: 55,
      nitNumber: `NIT/BUIDCO/2026/DLY-${spec.city.slice(0, 3).toUpperCase()}`,
      nitDate: '2026-04-01',
      omApplicable: false,
    });

    const createdProject = await createProject(input, SEED_ACTOR);
    if (spec.subStage !== 'NIT Published') {
      await updateProject(createdProject.projectId, { tenderSubStage: spec.subStage }, SEED_ACTOR);
    }
    process.stdout.write(`apply ${spec.projectName} [${spec.subStage}, ${spec.bucketLabel}]\n`);
    created++;
  }

  process.stdout.write(`Tender delay dummy-data seed complete — ${created} created, ${skipped} skipped.\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
