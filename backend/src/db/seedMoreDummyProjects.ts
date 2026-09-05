/**
 * bhaveshTask.md follow-up — "seed 10 more projects." Adds 10 new dummy
 * projects (Package 23-32) in districts/divisions not yet used by any
 * existing dummy project, spread across a deliberate mix of stages and
 * statuses so the portfolio gains real variety rather than more of the
 * same tender-stage records:
 *
 *   - 2 Completed (O&M stage)
 *   - 2 In Progress, non-tender execution (Construction stage)
 *   - 6 Tender-stage, spread one each across NIT Published, Bid
 *     Submission, Technical Evaluation, LoA Issued, Approval Process,
 *     Financial Evaluation — with a mix of Not Started/Delayed/On Hold/
 *     In Progress execution statuses.
 *
 * These 10 start with only their creation-time fields set, same as
 * every other dummy project historically has — run
 * seedFullFieldCompletion.ts immediately after this one to fill in
 * every remaining field (agreement, contract, PBG/EMD, O&M, funds/UC,
 * milestones, CoS/EoT) for these plus every pre-existing project.
 *
 * Idempotent (skips by projectName). Same createProject/updateProject
 * service functions as every other seed script.
 *
 * Usage: npm run db:seed-more-dummy-projects
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { district, division, project, sector } from './schema.js';
import { FINAL_TENDER_SUB_STAGE, type TenderSubStage } from './enums.js';
import type { AuditActor } from '../lib/audit.js';
import { createProject, updateProject } from '../services/projectsService.js';
import { createProjectSchema } from '../lib/projectFields.js';

const SEED_ACTOR: AuditActor = { userId: null, username: 'system:seed-more-dummy-projects', role: 'MD' };

const CONTRACTORS = [
  'M/s Kosi Infra Developers Pvt. Ltd.', 'M/s Sone Valley Construction Co.',
  'M/s Mithila Builders & Engineers', 'M/s Magadh Civil Works Ltd.',
  'M/s Ganga Tirhut Infra Pvt. Ltd.', 'M/s Bihar Urban Contractors Assn.',
  'M/s Champaran Engineering Services', 'M/s Anga Construction Co.',
  'M/s Vaishali Green Builders', 'M/s Magadh Water Infra Ltd.',
];
const PDS = [
  'Er. Poonam Singh', 'Er. Alok Ranjan', 'Er. Shweta Kumari', 'Er. Nitesh Verma',
  'Er. Ravi Shankar', 'Er. Meera Jha', 'Er. Sanjay Paswan', 'Er. Deepak Kumar',
];

interface Spec {
  projectName: string;
  city: string;
  sectorName: string;
  divisionName: string;
  status: string;
  plannedEndDate: string;
  physicalProgressPct: number;
  financialProgressPct: number;
  scheduledProgressPct: number;
  aaAmountCr: number;
  /** undefined = leave in Tender at its natural first sub-stage */
  tenderSubStage?: TenderSubStage;
  /** 'Construction' or 'O&M' — walks the same advance path seedDummyProjects.ts uses */
  advanceToStage?: 'Construction' | 'O&M';
}

const SPECS: Spec[] = [
  {
    projectName: 'Aurangabad Water Supply Augmentation Scheme — Package 23',
    city: 'Aurangabad', sectorName: 'Water Supply', divisionName: 'Aurangabad',
    status: 'Completed', plannedEndDate: '2025-11-30',
    physicalProgressPct: 100, financialProgressPct: 100, scheduledProgressPct: 100,
    aaAmountCr: 18.4, advanceToStage: 'O&M',
  },
  {
    projectName: 'Madhepura Sewerage Network Expansion — Package 29',
    city: 'Madhepura', sectorName: 'Sewerage', divisionName: 'Madhepura',
    status: 'Completed', plannedEndDate: '2025-12-15',
    physicalProgressPct: 100, financialProgressPct: 100, scheduledProgressPct: 100,
    aaAmountCr: 22.7, advanceToStage: 'O&M',
  },
  {
    projectName: 'Kaimur Sewerage Network Expansion — Package 24',
    city: 'Bhabhua', sectorName: 'Sewerage', divisionName: 'Kaimur',
    status: 'In Progress', plannedEndDate: '2027-03-31',
    physicalProgressPct: 55, financialProgressPct: 48, scheduledProgressPct: 60,
    aaAmountCr: 26.1, advanceToStage: 'Construction',
  },
  {
    projectName: 'Saharsa Electric Crematorium Construction — Package 31',
    city: 'Saharsa', sectorName: 'Crematorium', divisionName: 'Saharsa',
    status: 'In Progress', plannedEndDate: '2027-01-31',
    physicalProgressPct: 42, financialProgressPct: 38, scheduledProgressPct: 45,
    aaAmountCr: 9.8, advanceToStage: 'Construction',
  },
  {
    projectName: 'Araria Storm Water Drainage Improvement — Package 25',
    city: 'Araria', sectorName: 'SWD', divisionName: 'Araria',
    status: 'Not Started', plannedEndDate: '2027-09-30',
    physicalProgressPct: 0, financialProgressPct: 0, scheduledProgressPct: 5,
    aaAmountCr: 15.2, tenderSubStage: 'NIT Published',
  },
  {
    projectName: 'Begusarai Electric Crematorium Construction — Package 26',
    city: 'Begusarai', sectorName: 'Crematorium', divisionName: 'Begusarai',
    status: 'Delayed', plannedEndDate: '2027-06-30',
    physicalProgressPct: 0, financialProgressPct: 0, scheduledProgressPct: 12,
    aaAmountCr: 8.6, tenderSubStage: 'Bid Submission (Open)',
  },
  {
    projectName: 'Khagaria Public Infrastructure Development Works — Package 27',
    city: 'Khagaria', sectorName: 'Others', divisionName: 'Khagaria',
    status: 'On Hold', plannedEndDate: '2027-08-31',
    physicalProgressPct: 0, financialProgressPct: 0, scheduledProgressPct: 18,
    aaAmountCr: 11.9, tenderSubStage: 'Technical Evaluation',
  },
  {
    projectName: 'Kishanganj Water Supply Augmentation Scheme — Package 28',
    city: 'Kishanganj', sectorName: 'Water Supply', divisionName: 'Kishanganj',
    status: 'In Progress', plannedEndDate: '2027-10-31',
    physicalProgressPct: 3, financialProgressPct: 2, scheduledProgressPct: 30,
    aaAmountCr: 19.3, tenderSubStage: 'LoA Issued',
  },
  {
    projectName: 'Madhubani Storm Water Drainage Improvement — Package 30',
    city: 'Madhubani', sectorName: 'SWD', divisionName: 'Madhubani',
    status: 'Not Started', plannedEndDate: '2027-11-30',
    physicalProgressPct: 0, financialProgressPct: 0, scheduledProgressPct: 22,
    aaAmountCr: 14.5, tenderSubStage: 'Approval Process',
  },
  {
    projectName: 'Sheohar Public Infrastructure Development Works — Package 32',
    city: 'Sheohar', sectorName: 'Others', divisionName: 'Sheohar',
    status: 'Delayed', plannedEndDate: '2027-04-30',
    physicalProgressPct: 0, financialProgressPct: 0, scheduledProgressPct: 40,
    aaAmountCr: 7.4, tenderSubStage: 'Financial Evaluation',
  },
];

async function main(): Promise<void> {
  const sectorRows = await db.select().from(sector);
  const divisionRows = await db.select().from(division);
  const districtRows = await db.select().from(district);
  const sectorByName = new Map(sectorRows.map((s) => [s.sectorName, s.sectorId]));
  const divisionByName = new Map(divisionRows.map((d) => [d.divisionName, d.divisionId]));
  const districtByName = new Map(districtRows.map((d) => [d.districtName, d.districtId]));

  let created = 0;
  let skipped = 0;

  for (const [i, spec] of SPECS.entries()) {
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

    const contractor = CONTRACTORS[i % CONTRACTORS.length]!;
    const pd = PDS[i % PDS.length]!;
    const sectorId = sectorByName.get(spec.sectorName) ?? null;
    const divisionId = divisionByName.get(spec.divisionName) ?? null;
    const districtId = districtByName.get(spec.divisionName) ?? null;
    if (!sectorId) process.stderr.write(`  ! sector "${spec.sectorName}" not found\n`);
    if (!divisionId) process.stderr.write(`  ! division "${spec.divisionName}" not found\n`);
    if (!districtId) process.stderr.write(`  ! district "${spec.divisionName}" not found\n`);

    const input = createProjectSchema.parse({
      projectName: spec.projectName,
      sectorId,
      divisionId,
      districtId,
      city: spec.city,
      contractor,
      pd,
      mainWork: `${spec.sectorName} infrastructure works — ${spec.city}.`,
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      projectBrief: `${spec.sectorName} project in ${spec.city} seeded to broaden portfolio coverage across districts and lifecycle stages.`,
      projectStageV2: 'Tender',
      status: spec.status,
      plannedEndDate: spec.plannedEndDate,
      expectedCompletionDate: spec.plannedEndDate,
      priority: i % 3 === 0 ? 'High' : i % 3 === 1 ? 'Medium' : 'Low',
      aaAmountCr: spec.aaAmountCr,
      physicalProgressPct: spec.physicalProgressPct,
      financialProgressPct: spec.financialProgressPct,
      scheduledProgressPct: spec.scheduledProgressPct,
      nitNumber: `NIT/BUIDCO/2026/PKG-${String(23 + i).padStart(2, '0')}`,
      nitDate: '2026-03-15',
      omApplicable: false,
    });

    const createdProject = await createProject(input, SEED_ACTOR);

    if (spec.advanceToStage) {
      await updateProject(createdProject.projectId, { tenderSubStage: FINAL_TENDER_SUB_STAGE }, SEED_ACTOR);
      await updateProject(createdProject.projectId, { projectStageV2: 'Construction' }, SEED_ACTOR);
      if (spec.advanceToStage === 'O&M') {
        await updateProject(createdProject.projectId, { projectStageV2: 'O&M' }, SEED_ACTOR);
      }
    } else if (spec.tenderSubStage && spec.tenderSubStage !== 'NIT Published') {
      await updateProject(createdProject.projectId, { tenderSubStage: spec.tenderSubStage }, SEED_ACTOR);
    }

    process.stdout.write(`created ${spec.projectName} [${spec.advanceToStage ?? spec.tenderSubStage ?? 'NIT Published'}, ${spec.status}]\n`);
    created++;
  }

  process.stdout.write(`\nDone — ${created} created, ${skipped} skipped. Now run: npm run db:seed-full-field-completion\n`);
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    return pool.end().finally(() => process.exit(1));
  });
