/**
 * One-shot dummy-data seeder for the Tender Dashboard (bhaveshTask.md
 * Task 3): generates 22 varied Tender-stage projects — comfortably above
 * the "at least 20" bar — spread across all 8 tender sub-stages so every
 * Project Stages tab has real rows to filter/sort/select.
 *
 * Field values are drawn from small pools (6-7 variants each) so every
 * relevant column shows realistic variety, not the same values repeated.
 *
 * Goes through the same service functions the API routes use (createProject,
 * updateProject), same pattern as seedDummyProjects.ts — idempotent (skips
 * any project whose projectName already exists), gets real audit trail
 * entries, passes the same validation as user-created projects.
 *
 * Usage:
 *   npm run db:seed-dummy-tender
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { project } from './schema.js';
import { tenderSubStages, type TenderSubStage } from './enums.js';
import type { AuditActor } from '../lib/audit.js';
import { createProject, updateProject } from '../services/projectsService.js';
import { createProjectSchema } from '../lib/projectFields.js';

const SEED_ACTOR: AuditActor = {
  userId: null,
  username: 'system:seed-tender',
  role: 'MD',
};

type RawProjectInput = Omit<
  import('zod').input<typeof createProjectSchema>,
  'sectorId' | 'divisionId'
> & {
  sectorName: string;
  divisionName: string;
  schemeNames: string[];
};

// ---- Variant pools (6-7 entries each, cycled across the 22 records) ----

const CITIES = ['Ara', 'Chapra', 'Sasaram', 'Katihar', 'Siwan', 'Motihari', 'Buxar'];
const SECTORS = ['Water Supply', 'Sewerage', 'SWD', 'Crematorium', 'Others'];
const DIVISIONS = ['Bhojpur', 'Saran', 'Rohtas', 'Katihar', 'Siwaan', 'East Champaran', 'Buxar'];
const CONTRACTORS = [
  'M/s Kosi Infra Developers Pvt. Ltd.',
  'M/s Sone Valley Construction Co.',
  'M/s Mithila Builders & Engineers',
  'M/s Magadh Civil Works Ltd.',
  'M/s Ganga Tirhut Infra Pvt. Ltd.',
  'M/s Bihar Urban Contractors Assn.',
  'M/s Champaran Engineering Services',
];
const PDS = [
  'Er. Alok Ranjan', 'Er. Shweta Kumari', 'Er. Nitesh Verma', 'Er. Poonam Singh',
  'Er. Ravi Shankar', 'Er. Meera Jha', 'Er. Sanjay Paswan',
];
const PRIORITIES = ['High', 'Medium', 'Low', 'N/A'] as const;
const STATUSES = ['Not Started', 'In Progress', 'Delayed', 'On Hold'] as const;
const CONTRACT_TYPES = ['Work Contract', 'Work Contract', 'Work Contract', 'Service Contract', 'Others'] as const;
const SCHEMES_POOL = [
  'AMRUT 1.0', 'AMRUT 2.0', 'MMSSVY', 'Namami Gange',
  'Patna Smart City', 'Pragati Yatra', 'SAAT NISHCHAY', 'STATE FUNDED',
];

const SECTOR_WORK_TITLE: Record<string, string> = {
  'Water Supply': 'Water Supply Augmentation Scheme',
  Sewerage: 'Sewerage Network Expansion',
  SWD: 'Storm Water Drainage Improvement',
  Crematorium: 'Electric Crematorium Construction',
  Others: 'Public Infrastructure Development Works',
};

const DELAY_REASONS = [
  'Land acquisition dispute delaying tender finalization.',
  'Technical bid evaluation extended due to clarifications sought from bidders.',
  'Court stay on tender process pending resolution.',
  'Re-tendering required after single-bidder response to first NIT.',
];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length]!;
}

const RECORD_COUNT = 22;

function buildDummyProjects(): RawProjectInput[] {
  const out: RawProjectInput[] = [];
  for (let i = 0; i < RECORD_COUNT; i++) {
    const city = pick(CITIES, i);
    const sector = pick(SECTORS, i);
    const division = pick(DIVISIONS, i + 2);
    const contractor = pick(CONTRACTORS, i);
    const pd = pick(PDS, i + 1);
    const priority = pick(PRIORITIES, i);
    const status = pick(STATUSES, i + 3);
    const contractType = pick(CONTRACT_TYPES, i);
    const schemeCount = i % 3; // 0, 1, or 2 schemes per project
    const schemeNames = Array.from({ length: schemeCount }, (_, k) => pick(SCHEMES_POOL, i + k));
    const workTitle = SECTOR_WORK_TITLE[sector] ?? 'Infrastructure Works';
    const aa = 8 + (i % 9) * 3.5;
    const nitYear = 2026;
    const nitSeq = String(101 + i).padStart(3, '0');

    out.push({
      projectName: `${city} ${workTitle} — Package ${i + 1}`,
      sectorName: sector,
      city,
      divisionName: division,
      contractor,
      pd,
      mainWork: `${workTitle} covering core-town wards of ${city}, procured under the Tender Dashboard workflow.`,
      contractType,
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: `2026-0${(i % 6) + 1}-10`,
      projectBrief: `Tender-stage infrastructure package for ${city} under the ${sector} sector, dummy record for Tender Dashboard testing.`,
      schemeNames,

      projectStageV2: 'Tender',
      status,
      plannedEndDate: `2028-0${(i % 9) + 1}-28`,
      expectedCompletionDate: `2028-0${(i % 9) + 1}-28`,
      delayReason: status === 'Delayed' ? pick(DELAY_REASONS, i) : null,
      deptStuckAt: status === 'On Hold' ? 'District Administration — clearance pending' : null,

      priority,
      sanctionedCostCr: Math.round((aa * 1.05) * 100) / 100,
      aaAmountCr: aa,
      physicalProgressPct: 0,
      financialProgressPct: 0,
      scheduledProgressPct: 0,

      nitNumber: `NIT/BUIDCO/${nitYear}/${nitSeq}`,
      nitDate: `2026-0${(i % 6) + 1}-15`,

      remark: i % 5 === 0 ? `Bid evaluation for Package ${i + 1} pending committee sign-off.` : null,
      omApplicable: false,

      mprMonth: '2026-08',
      mainComponentScope: workTitle,
      mprRemark: `Tender stage — ${status.toLowerCase()}.`,
    });
  }
  return out;
}

/** Spread evenly across all 8 tender sub-stages instead of leaving every
 *  new project at the default first sub-stage (NIT Published). */
function subStageFor(index: number): TenderSubStage {
  return tenderSubStages[index % tenderSubStages.length]!;
}

async function main(): Promise<void> {
  const sectorRows = await db.query.sector.findMany();
  const divisionRows = await db.query.division.findMany();
  const schemeRows = await db.query.scheme.findMany();

  const sectorByName = new Map(sectorRows.map((s) => [s.sectorName, s.sectorId]));
  const divisionByName = new Map(divisionRows.map((d) => [d.divisionName, d.divisionId]));
  const schemeByName = new Map(schemeRows.map((s) => [s.schemeName, s.schemeId]));

  const dummyProjects = buildDummyProjects();
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < dummyProjects.length; i++) {
    const dp = dummyProjects[i]!;
    const { sectorName, divisionName, schemeNames, ...rest } = dp;

    const [existing] = await db
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectName, rest.projectName))
      .limit(1);
    if (existing) {
      process.stdout.write(`skip  ${rest.projectName} (already exists)\n`);
      skipped++;
      continue;
    }

    const sectorId = sectorByName.get(sectorName) ?? null;
    const divisionId = divisionByName.get(divisionName) ?? null;
    const schemeIds = schemeNames
      .map((n) => schemeByName.get(n))
      .filter((id): id is number => id !== undefined);

    const parsedInput = createProjectSchema.parse({ ...rest, sectorId, divisionId, schemes: schemeIds });
    const createdProject = await createProject(parsedInput, SEED_ACTOR);

    const targetSubStage = subStageFor(i);
    if (targetSubStage !== 'NIT Published') {
      await updateProject(createdProject.projectId, { tenderSubStage: targetSubStage }, SEED_ACTOR);
    }

    process.stdout.write(`apply ${rest.projectName} [${targetSubStage}]\n`);
    created++;
  }

  process.stdout.write(`Tender dummy-data seed complete — ${created} created, ${skipped} skipped.\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
