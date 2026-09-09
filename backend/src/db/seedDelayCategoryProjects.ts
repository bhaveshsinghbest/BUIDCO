/**
 * Dummy Tender-stage projects covering every "Delayed Projects" filter
 * bucket (bhaveshTask.md Task 4) — 5 per category, 25 in total:
 *
 *   More than 30 Days · 60 Days · 90 Days · 6 Months · 1 Year
 *
 * Each record sits comfortably INSIDE its own bucket rather than on the
 * boundary, so a few days of clock drift between seeding and a demo cannot
 * move a project into the neighbouring bucket. Note the buckets nest by
 * design: a project 400 days late legitimately answers all five filters, so
 * "5 per category" means 5 seeded to sit in that band, not 5 exclusive to it.
 *
 * Delay is derived from `plannedEndDate` — there is no stored delay-duration
 * column anywhere in the schema, so the dates below ARE the delay data. The
 * task's "days / months / years" units are expressed by spreading the target
 * dates across those spans; the filter normalises them back to days.
 *
 * Idempotent (skips by projectName) and uses the same createProject /
 * updateProject service functions as every other seeder, so these records
 * get a real audit trail and pass the same validation as user-created
 * projects. Touches no existing project.
 *
 * Usage:
 *   npm run db:seed-delay-categories
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import {
  cosEotItem,
  managementActionItem,
  project,
  projectFundsUc,
  projectScheme,
  scheme,
} from './schema.js';
import type { TenderSubStage } from './enums.js';
import type { AuditActor } from '../lib/audit.js';
import { createProject, updateProject } from '../services/projectsService.js';
import { createProjectSchema } from '../lib/projectFields.js';

const SEED_ACTOR: AuditActor = {
  userId: null,
  username: 'system:seed-delay-categories',
  role: 'MD',
};

/** Anchor date for the generated plannedEndDates. */
const ANCHOR = new Date('2026-09-08T00:00:00.000Z');

function daysAgo(n: number): string {
  return new Date(ANCHOR.getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

interface Category {
  /** Matches the DelayFilterDropdown option it is seeded for. */
  bucket: string;
  /** Days overdue for the five records in this category. */
  offsets: [number, number, number, number, number];
  /** How the delay reads to a human — the task's days/months/years units. */
  unitLabel: string;
}

const CATEGORIES: Category[] = [
  { bucket: 'More than 30 Days', offsets: [35, 38, 42, 47, 52], unitLabel: 'weeks' },
  { bucket: 'More than 60 Days', offsets: [65, 70, 74, 79, 84], unitLabel: 'days' },
  { bucket: 'More than 90 Days', offsets: [95, 105, 115, 125, 140], unitLabel: 'months' },
  { bucket: 'More than 6 Months', offsets: [200, 220, 245, 275, 300], unitLabel: 'months' },
  { bucket: 'More than 1 Year', offsets: [400, 460, 520, 640, 800], unitLabel: 'years' },
];

/**
 * Cities / districts / divisions / sectors cycled so records look varied and
 * real. Division and district names are verified against the seeded lookup
 * tables at run time — an unmatched name would silently leave the FK null.
 */
const PLACES = [
  { city: 'Bettiah', district: 'West Champaran', division: 'West Champaran', sector: 'Water Supply' },
  { city: 'Motihari', district: 'East Champaran', division: 'East Champaran', sector: 'Sewerage' },
  { city: 'Gaya', district: 'Gaya', division: 'Gaya', sector: 'SWD' },
  { city: 'Buxar', district: 'Buxar', division: 'Buxar', sector: 'Water Supply' },
  { city: 'Jamui', district: 'Jamui', division: 'Jamui', sector: 'Crematorium' },
];

const PBG_BANKS = [
  'State Bank of India, Patna Main',
  'Punjab National Bank, Bettiah',
  'Bank of Baroda, Gaya',
  'Union Bank of India, Buxar',
  'Canara Bank, Jamui',
];

const STUCK_AT = [
  'Revenue Department — land handover',
  'Electricity Board — utility shifting',
  'Forest & Environment — clearance',
  'District Administration — encroachment removal',
  'Finance Department — fund release',
];

const SUB_STAGES: TenderSubStage[] = [
  'NIT Published',
  'Bid Submission (Open)',
  'Technical Evaluation',
  'Financial Evaluation',
  'LoA Issued',
];

const CONTRACTORS = [
  'M/s Sone Valley Constructions Pvt. Ltd.',
  'M/s Gandak Infra Projects Ltd.',
  'M/s Kosi Civil Works Pvt. Ltd.',
  'M/s Magadh Urban Developers',
  'M/s Champaran Engineering Co.',
];

const PDS = ['Er. Alok Ranjan', 'Er. Sunita Devi', 'Er. Anjali Kumari', 'Er. Priya Ranjan', 'Er. Shriyam Kumar'];

/** Human-readable delay, in the unit the category is about. */
function describeDelay(days: number, unit: string): string {
  if (unit === 'years') {
    const y = (days / 365).toFixed(1);
    return `${y} year${y === '1.0' ? '' : 's'} (${days} days)`;
  }
  if (unit === 'months') {
    const m = Math.round(days / 30.44);
    return `${m} months (${days} days)`;
  }
  if (unit === 'weeks') return `${Math.round(days / 7)} weeks (${days} days)`;
  return `${days} days`;
}

async function main(): Promise<void> {
  const sectorRows = await db.query.sector.findMany();
  const divisionRows = await db.query.division.findMany();
  const schemeRows = await db.select().from(scheme);
  const districtRows = await db.query.district.findMany();
  const sectorByName = new Map(sectorRows.map((s) => [s.sectorName, s.sectorId]));
  const districtByName = new Map(districtRows.map((d) => [d.districtName, d.districtId]));
  const divisionByName = new Map(divisionRows.map((d) => [d.divisionName, d.divisionId]));

  if (schemeRows.length === 0) {
    process.stderr.write('No schemes found — run the base seeds first.\n');
    process.exitCode = 1;
    return;
  }

  let created = 0;
  let skipped = 0;
  let seq = 0;

  for (const cat of CATEGORIES) {
    for (let i = 0; i < cat.offsets.length; i++) {
      const days = cat.offsets[i]!;
      const place = PLACES[i % PLACES.length]!;
      const tag = String.fromCharCode(65 + i); // A..E
      const shortBucket = cat.bucket.replace('More than ', '').replace(/\s+/g, '');
      const projectName = `${place.city} ${place.sector} Upgrade — Delay ${shortBucket} ${tag}`;

      const [existing] = await db
        .select({ projectId: project.projectId })
        .from(project)
        .where(eq(project.projectName, projectName))
        .limit(1);
      if (existing) {
        process.stdout.write(`skip  ${projectName}\n`);
        skipped++;
        continue;
      }

      const plannedEnd = daysAgo(days);
      const readable = describeDelay(days, cat.unitLabel);

      const aa = 10 + (seq % 9) * 3.5;
      const physical = Math.max(5, 60 - Math.round(days / 20));
      const financialPct = Math.max(3, 55 - Math.round(days / 22));

      const input = createProjectSchema.parse({
        projectName,
        sectorId: sectorByName.get(place.sector) ?? null,
        divisionId: divisionByName.get(place.division) ?? null,
        city: place.city,
        contractor: CONTRACTORS[seq % CONTRACTORS.length]!,
        pd: PDS[seq % PDS.length]!,
        mainWork: `Dummy record seeded for the "${cat.bucket}" delay bucket — overdue by ${readable}.`,
        contractType: 'Work Contract',
        sponsoringDept: 'Urban Development & Housing Department',
        implementingAgency: 'BUIDCO',
        projectBrief: `Presentation/demo project for the Tender Dashboard delay filter. Planned completion ${plannedEnd}, currently overdue by ${readable}.`,
        projectStageV2: 'Tender',
        status: 'Delayed',
        plannedEndDate: plannedEnd,
        expectedCompletionDate: plannedEnd,
        delayReason: `Contractor mobilisation and land handover delays — overdue by ${readable}.`,
        priority: days > 365 ? 'High' : days > 90 ? 'Medium' : 'Low',
        aaAmountCr: aa,
        agreementAmountCr: 9 + (seq % 9) * 3.2,
        physicalProgressPct: physical,
        financialProgressPct: financialPct,
        scheduledProgressPct: 90,
        nitNumber: `NIT/BUIDCO/2026/DLY-${shortBucket}-${tag}`,
        nitDate: daysAgo(days + 120),
        agreementNumber: `BUIDCO/AGR/2026/DLY-${shortBucket}-${tag}`,

        // ── Location / identification ──
        districtId: districtByName.get(place.district) ?? null,
        sanctionDate: daysAgo(days + 400),
        deptStuckAt: STUCK_AT[seq % STUCK_AT.length]!,
        sanctionedCostCr: Number((aa * 1.05).toFixed(2)),
        revisedAaAmountCr: Number((aa * 1.12).toFixed(2)),
        revisedEndDate: daysAgo(Math.max(1, days - 60)),

        // ── Contract & financial ──
        agreementDate: daysAgo(days + 300),
        appointedDate: daysAgo(days + 280),
        contractValueCr: Number((aa * 0.94).toFixed(2)),
        mobAdvanceIssuedCr: Number((aa * 0.10).toFixed(2)),
        mobAdvanceRecoveredCr: Number((aa * 0.04).toFixed(2)),
        advanceOutstandingCr: Number((aa * 0.06).toFixed(2)),
        retentionMoneyHeldCr: Number((aa * 0.05).toFixed(2)),
        totalPaymentsCr: Number(((aa * financialPct) / 100).toFixed(2)),
        lastPaymentDate: daysAgo(60),
        lastRaBillNo: `RA-${(seq % 9) + 2}`,

        // ── PBG & EMD ──
        pbgNumber: `PBG/${shortBucket}/${tag}/2026`,
        pbgAmountCr: Number((aa * 0.05).toFixed(2)),
        pbgIssuingBank: PBG_BANKS[seq % PBG_BANKS.length]!,
        // Spread across expired / expiring-soon / healthy so the PBG Alert
        // column and its new filter have every state represented.
        pbgExpiryDate: daysAgo(seq % 3 === 0 ? 20 : seq % 3 === 1 ? -15 : -400),
        emdAmountCr: Number((aa * 0.02).toFixed(2)),
        emdRefNumber: `EMD/${shortBucket}/${tag}`,
        emdDate: daysAgo(days + 320),

        // ── O&M (not applicable for tender-stage work, but populated so the
        //    card is never blank) ──
        omApplicable: false,
        omAgency: 'To be appointed post-commissioning',
        omRemarks: 'O&M scope begins after successful commissioning and trial run.',

        remark: `Escalated to ${STUCK_AT[seq % STUCK_AT.length]!.split(' — ')[0]} for resolution; overdue by ${readable}.`,

        /*
         * Remaining current columns, so no field on a demo record is blank.
         *
         * Five columns are deliberately NOT written: project_stage,
         * work_type and current_phase are @deprecated in enums.ts ("new
         * writes should not populate it"), and management_action_legacy /
         * cos_eot_* are @deprecated in favour of the management_action_item
         * and cos_eot_item tables. Those get real child rows below instead,
         * which is what the UI actually reads.
         */
        physicalWorkProgressNote: `Earthwork and pipe-laying complete on ${physical}% of the alignment; remaining stretch held up at the rail crossing.`,
        financialProgressCr: Number(((aa * financialPct) / 100).toFixed(2)),
        geoTaggingUrl: `https://maps.buidco.in/geo/${shortBucket.toLowerCase()}-${tag.toLowerCase()}`,
        mainComponentScope: `${place.sector} network: intake works, ${8 + (seq % 5)} km trunk main, ${2 + (seq % 3)} pumping stations and allied civil works.`,
        mprMonth: daysAgo(20).slice(0, 7),
        fundReceivedCr: Number((aa * 0.62).toFixed(2)),
        expenditureCentralRaw: `${(aa * 0.28).toFixed(2)} Cr`,
        expenditureStateRaw: `${(aa * 0.19).toFixed(2)} Cr`,
        manpowerEngagedRaw: `${40 + (seq % 7) * 15} (skilled ${12 + (seq % 5) * 4}, unskilled ${28 + (seq % 6) * 9})`,
        progressPrevMonthRaw: `${Math.max(0, physical - 4)}%`,
        progressThisMonthRaw: `${physical}%`,
        mprRemark: `MPR filed for ${daysAgo(20).slice(0, 7)}. Slippage attributed to ${readable} of delay against the approved schedule.`,
        expectedCompletionRaw: `${plannedEnd} (revised target under review)`,
        omStatusOverride: null,
      });

      const createdProject = await createProject(input, SEED_ACTOR);

      // Every project must carry a Scheme — cycle through the real ones so
      // the Schemes page and scheme-scoped filters see them too.
      const sch = schemeRows[seq % schemeRows.length]!;
      await db.insert(projectScheme).values({
        projectId: createdProject.projectId,
        schemeId: sch.schemeId,
      });

      // Child records — the modern homes for what the deprecated
      // cos_eot_* / management_action_legacy columns used to hold, plus a
      // Funds & UC row so that tab isn't empty for these projects either.
      await db.insert(cosEotItem).values({
        projectId: createdProject.projectId,
        cosNumber: `COS-${shortBucket}-${tag}`,
        cosDate: daysAgo(days + 30),
        category: 'QUANTITY VARIATION',
        cosAmountCr: String((aa * 0.08).toFixed(2)),
        variationPct: String('8.00'),
        eotNumber: `EOT-${shortBucket}-${tag}`,
        eotDaysGranted: Math.min(180, Math.round(days / 2)),
        timeLinked: true,
        originalEndDate: daysAgo(days + 30),
        newEndDate: plannedEnd,
        revisedDate: plannedEnd,
      });

      await db.insert(managementActionItem).values({
        projectId: createdProject.projectId,
        topic: `Expedite clearance and contractor mobilisation — project overdue by ${readable}.`,
        status: 'Open',
        deadlineDate: daysAgo(-30),
      });

      await db.insert(projectFundsUc).values({
        projectId: createdProject.projectId,
        fundingSource: 'State Funded',
        openingBalanceCr: String((aa * 0.15).toFixed(2)),
        grantReceivedCr: String((aa * 0.62).toFixed(2)),
        expenditureIncurredCr: String(((aa * financialPct) / 100).toFixed(2)),
        centralSharePct: String('60.00'),
        stateSharePct: String('40.00'),
        ucSubmittedDate: daysAgo(45),
        sanctionNo: `SANC/BUIDCO/2026/${shortBucket}-${tag}`,
        remarks: `UC for the released tranche submitted; balance pending against ${readable} of slippage.`,
      });

      // Always issue the update, even when the sub-stage is already the
      // default: it is what stamps `last_updated`, and the Tender table has a
      // "Last Updated" column that would otherwise read blank for those rows.
      const subStage = SUB_STAGES[seq % SUB_STAGES.length]!;
      await updateProject(createdProject.projectId, { tenderSubStage: subStage }, SEED_ACTOR);

      process.stdout.write(
        `apply ${projectName} [${cat.bucket}, ${readable}, ${subStage}, ${sch.schemeName}]\n`,
      );
      created++;
      seq++;
    }
  }

  process.stdout.write(
    `\nDelay-category seed complete — ${created} created, ${skipped} skipped (5 per bucket × 5 buckets).\n`,
  );
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
