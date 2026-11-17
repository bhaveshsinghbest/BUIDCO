/**
 * Dev/demo seeder for the Funds Flow & UC Tracker (bhaveshTask.md).
 *
 * Funds & UC entries created before drizzle/0019 only carry the BUIDCo-level
 * figures (opening, received, paid, UC date). This fills the new upstream
 * stages and UC detail with plausible, deterministic dummy values so the
 * tracker's cards, flow diagram, agency table and UC tracker have something
 * to show:
 *   - Sanctioning Agency from the funding source (some left blank → "Not specified")
 *   - Amount Sanctioned ≈ the project's AA (some blank → AA fallback is used)
 *   - Released to UDHD ≥ received by BUIDCo (some blank → assumed = received)
 *   - for projects with a UC date: UC sent to, amount covered, a few "Acknowledged"
 *
 * Idempotent: only touches entries where every new field is still empty.
 * Goes through updateFundsUc(), so each change gets an Audit Trail entry
 * like everything else seeded this way. NOT for production data.
 *
 * Usage:  npm run db:seed-dummy-funds-flow-stages
 */
import { asc, eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { assertDemoSeedingAllowed } from './seedGuard.js';
import type { FundSanctionAgency, UcSentTo } from './enums.js';
import { project, projectFundsUc } from './schema.js';
import type { AuditActor } from '../lib/audit.js';
import { toNumberOrNull, toNumberOrZero } from '../lib/numbers.js';
import { updateFundsUc, type FundsUcUpdateInput } from '../services/fundsUcService.js';

const SEED_ACTOR: AuditActor = { userId: null, username: 'system:seed-funds-flow-stages', role: 'MD' };

const AGENCY_BY_SOURCE: Record<string, FundSanctionAgency> = {
  'Central - EAP': 'Other Central Ministry',
  'Central - Non-EAP': 'MoHUA – Govt. of India',
  'Central - State Share': 'MoHUA – Govt. of India',
  'State Funded': 'UDHD – Govt. of Bihar',
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function run(): Promise<void> {
  await assertDemoSeedingAllowed('seedDummyFundsFlowStages');
  const rows = await db
    .select({ f: projectFundsUc, aa: project.aaAmountCr, revisedAa: project.revisedAaAmountCr, name: project.projectName })
    .from(projectFundsUc)
    .innerJoin(project, eq(project.projectId, projectFundsUc.projectId))
    .orderBy(asc(projectFundsUc.fundsUcId));

  let updated = 0;
  let skipped = 0;
  for (const [i, { f, aa, revisedAa, name }] of rows.entries()) {
    const untouched =
      f.fundSanctionAgency === null &&
      f.fundSanctionedAmountCr === null &&
      f.fundReleasedToUdhdCr === null &&
      f.ucAmountCertifiedCr === null &&
      f.ucSentTo === null &&
      f.ucStatusOverride === null &&
      f.sanctionDate === null;
    if (!untouched) {
      skipped += 1;
      continue;
    }

    const received = toNumberOrZero(f.grantReceivedCr);
    const paid = toNumberOrZero(f.expenditureIncurredCr);
    const sanctionedCost = toNumberOrNull(revisedAa) || toNumberOrNull(aa) || 0;
    const isNamamiGange = /STP|sewer|I&D|ghat|crematori/i.test(name);

    const patch: FundsUcUpdateInput = {};
    // Every 4th entry keeps no agency, so the tracker shows "Not specified".
    if (i % 4 !== 3) {
      patch.fundSanctionAgency =
        f.fundingSource === 'Central - Non-EAP' && isNamamiGange ? 'NMCG – Govt. of India' : AGENCY_BY_SOURCE[f.fundingSource] ?? null;
    }
    // Every 3rd keeps Amount Sanctioned blank → the AA fallback is used and flagged.
    if (i % 3 !== 2 && sanctionedCost > 0) {
      patch.fundSanctionedAmountCr = round2(Math.max(sanctionedCost, received));
      patch.sanctionDate = `2025-${String((i % 9) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`;
    }
    // Released to UDHD: blank for every 5th (assumed = received); otherwise at
    // least what BUIDCo received, sometimes more (money still lying with UDHD).
    if (i % 5 !== 4) {
      const parked = i % 2 === 0 ? round2(received * 0.12) : 0;
      patch.fundReleasedToUdhdCr = round2(received + parked);
    }
    if (f.ucSubmittedDate) {
      patch.ucSentTo = (i % 6 === 1 ? 'NMCG' : 'UDHD, Govt. of Bihar') satisfies UcSentTo;
      // Mostly partial coverage; every 7th fully covered and acknowledged.
      const share = i % 7 === 0 ? 1 : 0.55 + (i % 4) * 0.1;
      patch.ucAmountCertifiedCr = round2(Math.min(paid, paid * share));
      if (i % 7 === 0) patch.ucStatusOverride = 'Acknowledged';
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }
    await updateFundsUc(f.fundsUcId, patch, SEED_ACTOR);
    updated += 1;
  }
  process.stdout.write(`Funds Flow stages: ${updated} entr${updated === 1 ? 'y' : 'ies'} filled, ${skipped} left as they were.\n`);
}

run()
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
