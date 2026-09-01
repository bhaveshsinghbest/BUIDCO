/**
 * One-shot dummy-data seeder for Funds & UC (bhaveshTask.md) — links a
 * realistic GFR 12-A style funding ledger entry to 12 existing projects,
 * spanning all 4 funding sources and a mix of Submitted/Pending/Overdue
 * UC statuses so the page's KPI cards, funding-source summary, and ledger
 * table (with its column filters) all have real data to demonstrate.
 *
 * Idempotent: skips any project that already has a Funds & UC entry. Goes
 * through the same createFundsUc() service the API route uses, so seeded
 * rows get a real audit-trail entry like everything else seeded this way.
 *
 * Usage:
 *   npm run db:seed-dummy-funds-uc
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { project, projectFundsUc } from './schema.js';
import type { AuditActor } from '../lib/audit.js';
import { createFundsUc, type FundsUcCreateInput } from '../services/fundsUcService.js';

const SEED_ACTOR: AuditActor = {
  userId: null,
  username: 'system:seed-funds-uc',
  role: 'MD',
};

const ENTRIES: Array<{ projectName: string } & Omit<FundsUcCreateInput, 'projectId'>> = [
  {
    projectName: 'Bhagalpur Storm Water Drainage Rehabilitation',
    fundingSource: 'Central - EAP',
    openingBalanceCr: 2.1,
    grantReceivedCr: 18.4,
    expenditureIncurredCr: 15.75,
    sanctionNo: 'EAP/BH/2025/0412',
    ucSubmittedDate: '2026-04-18',
  },
  {
    projectName: 'Purnea Integrated Sewerage & Drainage Master Plan',
    fundingSource: 'Central - EAP',
    openingBalanceCr: 0,
    grantReceivedCr: 21.49,
    expenditureIncurredCr: 19.86,
    sanctionNo: 'EAP/BH/2025/0518',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Muzaffarpur Electric Crematorium Modernisation',
    fundingSource: 'Central - Non-EAP',
    openingBalanceCr: 1.5,
    grantReceivedCr: 8.2,
    expenditureIncurredCr: 6.4,
    sanctionNo: 'NMCG/BH/2025/0889',
    ucSubmittedDate: '2026-03-05',
  },
  {
    projectName: 'Munger Storm Water Drainage & Flood Mitigation',
    fundingSource: 'Central - Non-EAP',
    openingBalanceCr: 1.5,
    grantReceivedCr: 20.29,
    expenditureIncurredCr: 18.6,
    sanctionNo: 'NMCG/BH/2025/0891',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Patna Smart City Public Convenience Blocks',
    fundingSource: 'Central - State Share',
    openingBalanceCr: 0.8,
    grantReceivedCr: 12.6,
    expenditureIncurredCr: 12.6,
    sanctionNo: 'CSS/BH/2025/0221',
    ucSubmittedDate: '2026-06-02',
  },
  {
    projectName: 'Gaya Water Supply Augmentation Scheme',
    fundingSource: 'Central - State Share',
    openingBalanceCr: 3.2,
    grantReceivedCr: 26.1,
    expenditureIncurredCr: 21.3,
    sanctionNo: 'CSS/BH/2025/0244',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Patna Sewerage Network Augmentation — Phase II',
    fundingSource: 'Central - State Share',
    openingBalanceCr: 5.4,
    grantReceivedCr: 34.75,
    expenditureIncurredCr: 30.1,
    sanctionNo: 'CSS/BH/2025/0267',
    ucSubmittedDate: '2026-01-22',
  },
  {
    projectName: 'Buxar Sewerage Network Expansion — Package 7',
    fundingSource: 'Central - State Share',
    openingBalanceCr: 0,
    grantReceivedCr: 9.9,
    expenditureIncurredCr: 4.2,
    sanctionNo: 'CSS/BH/2025/0299',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Bihar Sharif Electric Crematorium Construction',
    fundingSource: 'State Funded',
    openingBalanceCr: 0,
    grantReceivedCr: 4.5,
    expenditureIncurredCr: 4.5,
    sanctionNo: 'UDHD/SN2/2025/0198',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Ara Storm Water Drainage Improvement — Package 8',
    fundingSource: 'State Funded',
    openingBalanceCr: 1.1,
    grantReceivedCr: 16.2,
    expenditureIncurredCr: 15.9,
    sanctionNo: 'UDHD/SN2/2025/0233',
    ucSubmittedDate: '2026-05-11',
  },
  {
    projectName: 'Chapra Electric Crematorium Construction — Package 9',
    fundingSource: 'State Funded',
    openingBalanceCr: 0,
    grantReceivedCr: 3.75,
    expenditureIncurredCr: 1.2,
    sanctionNo: 'UDHD/SN2/2025/0251',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Hajipur Sewerage Treatment Plant Expansion',
    fundingSource: 'State Funded',
    openingBalanceCr: 2.6,
    grantReceivedCr: 24.9,
    expenditureIncurredCr: 20.05,
    sanctionNo: 'UDHD/SN2/2025/0276',
    ucSubmittedDate: '2026-02-14',
  },
  {
    projectName: 'Gaya Water Supply Augmentation Scheme',
    fundingSource: 'Central - State Share',
    openingBalanceCr: 3.2,
    grantReceivedCr: 26.1,
    expenditureIncurredCr: 21.3,
    sanctionNo: 'CSS/BH/2025/0244',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Darbhanga Water Supply Distribution Network Upgrade',
    fundingSource: 'Central - EAP',
    openingBalanceCr: 1.8,
    grantReceivedCr: 15.6,
    expenditureIncurredCr: 12.4,
    sanctionNo: 'EAP/BH/2025/0561',
    ucSubmittedDate: '2026-05-30',
  },
  {
    projectName: 'Ara Water Supply Augmentation Scheme — Package 1',
    fundingSource: 'Central - Non-EAP',
    openingBalanceCr: 0.6,
    grantReceivedCr: 11.3,
    expenditureIncurredCr: 9.75,
    sanctionNo: 'NMCG/BH/2025/0904',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Chapra Sewerage Network Expansion — Package 2',
    fundingSource: 'Central - State Share',
    openingBalanceCr: 2.4,
    grantReceivedCr: 19.8,
    expenditureIncurredCr: 19.8,
    sanctionNo: 'CSS/BH/2025/0312',
    ucSubmittedDate: '2026-04-09',
  },
  {
    projectName: 'Sasaram Storm Water Drainage Improvement — Package 3',
    fundingSource: 'State Funded',
    openingBalanceCr: 0,
    grantReceivedCr: 6.9,
    expenditureIncurredCr: 3.1,
    sanctionNo: 'UDHD/SN2/2025/0288',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Katihar Electric Crematorium Construction — Package 4',
    fundingSource: 'State Funded',
    openingBalanceCr: 0,
    grantReceivedCr: 3.2,
    expenditureIncurredCr: 3.2,
    sanctionNo: 'UDHD/SN2/2025/0301',
    ucSubmittedDate: '2026-03-28',
  },
  {
    projectName: 'Siwan Public Infrastructure Development Works — Package 5',
    fundingSource: 'Central - EAP',
    openingBalanceCr: 4.1,
    grantReceivedCr: 28.75,
    expenditureIncurredCr: 22.6,
    sanctionNo: 'EAP/BH/2025/0602',
    ucSubmittedDate: null,
  },
  {
    projectName: 'Motihari Water Supply Augmentation Scheme — Package 6',
    fundingSource: 'Central - Non-EAP',
    openingBalanceCr: 0.9,
    grantReceivedCr: 13.4,
    expenditureIncurredCr: 10.2,
    sanctionNo: 'NMCG/BH/2025/0917',
    ucSubmittedDate: '2026-01-15',
  },
  {
    projectName: 'Sasaram Public Infrastructure Development Works — Package 10',
    fundingSource: 'State Funded',
    openingBalanceCr: 1.3,
    grantReceivedCr: 9.4,
    expenditureIncurredCr: 7.65,
    sanctionNo: 'UDHD/SN2/2025/0319',
    ucSubmittedDate: null,
  },
];

async function main(): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const entry of ENTRIES) {
    const [proj] = await db
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectName, entry.projectName))
      .limit(1);
    if (!proj) {
      process.stdout.write(`skip  ${entry.projectName} (project not found)\n`);
      skipped++;
      continue;
    }

    const [existing] = await db
      .select({ fundsUcId: projectFundsUc.fundsUcId })
      .from(projectFundsUc)
      .where(eq(projectFundsUc.projectId, proj.projectId))
      .limit(1);
    if (existing) {
      process.stdout.write(`skip  ${entry.projectName} (already has a Funds & UC entry)\n`);
      skipped++;
      continue;
    }

    const { projectName, ...input } = entry;
    await createFundsUc({ ...input, projectId: proj.projectId }, SEED_ACTOR);
    process.stdout.write(`apply ${projectName}\n`);
    created++;
  }

  process.stdout.write(`Funds & UC dummy-data seed complete — ${created} created, ${skipped} skipped.\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
