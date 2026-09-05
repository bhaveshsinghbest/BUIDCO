/**
 * bhaveshTask.md follow-up — "seed the data of more projects so that
 * agreement number, agreement amount and agreement date fields should be
 * filled." Those three fields only make sense once a tender has actually
 * reached LoA Issued (see seedDummyPresentationExtras2.ts's maturity
 * model) — a project still under technical/financial evaluation hasn't
 * signed anything yet, so filling agreement data for it would be
 * internally inconsistent rather than "more complete."
 *
 * This script advances the 8 dummy projects sitting in the two
 * *latest* pre-agreement tender sub-stages — Financial Evaluation and
 * Approval Process, i.e. immediately before LoA Issued in the workflow
 * (db/enums.ts's tenderSubStages order) — to LoA Issued. Execution
 * status (Delayed/On Hold) is left untouched: a project can very
 * plausibly sit on either side of LoA issuance while delayed. Everything
 * earlier in the pipeline (NIT Published, Bid Submission, Technical
 * Evaluation) is left alone so the Tender Dashboard still shows a
 * realistic spread across sub-stages rather than draining them out.
 *
 * Run seedDummyPresentationExtras2.ts again immediately after this one —
 * its existing, already-verified fillFinancials() logic picks up any
 * project now at LoA Issued and fills Agreement Number/Date/Amount,
 * Contract Value, and PBG for it. This script does not duplicate that
 * logic; it only moves the stage marker.
 *
 * Idempotent: a project already at or past LoA Issued is skipped.
 *
 * Usage: npm run db:seed-advance-to-agreement && npm run db:seed-dummy-extras-2
 */

import { inArray } from 'drizzle-orm';
import { db, pool } from './client.js';
import { project } from './schema.js';
import { tenderSubStages, type TenderSubStage } from './enums.js';
import type { AuditActor } from '../lib/audit.js';
import { updateProject } from '../services/projectsService.js';

const SEED_ACTOR: AuditActor = { userId: null, username: 'system:seed-advance-to-agreement', role: 'MD' };

const TARGET_PROJECT_NAMES = [
  // Financial Evaluation — one step from Approval Process, two from LoA Issued.
  'Sheikhpura Electric Crematorium Construction — Delay Test D',
  'Siwan Sewerage Network Expansion — Package 12',
  'Katihar Electric Crematorium Construction — Package 4',
  'Motihari Public Infrastructure Development Works — Package 20',
  // Approval Process — the step immediately before LoA Issued.
  'Motihari Storm Water Drainage Improvement — Package 13',
  'Siwan Public Infrastructure Development Works — Package 5',
  'Buxar Water Supply Augmentation Scheme — Package 21',
  'Arwal Public Infrastructure Development Works — Delay Test E',
] as const;

const LOA_ISSUED: TenderSubStage = 'LoA Issued';
const loaIndex = tenderSubStages.indexOf(LOA_ISSUED);

async function main(): Promise<void> {
  const rows = await db.select().from(project).where(inArray(project.projectName, [...TARGET_PROJECT_NAMES]));
  const found = new Map(rows.map((r) => [r.projectName, r]));

  for (const name of TARGET_PROJECT_NAMES) {
    const row = found.get(name);
    if (!row) {
      process.stderr.write(`WARNING: project not found, skipping: ${name}\n`);
      continue;
    }
    if (row.projectStageV2 !== 'Tender') {
      process.stdout.write(`skip (not in Tender stage — already advanced past it): ${name}\n`);
      continue;
    }
    const currentIdx = row.tenderSubStage ? tenderSubStages.indexOf(row.tenderSubStage as TenderSubStage) : -1;
    if (currentIdx >= loaIndex) {
      process.stdout.write(`skip (already at or past LoA Issued): ${name}\n`);
      continue;
    }
    await updateProject(row.projectId, { tenderSubStage: LOA_ISSUED }, SEED_ACTOR);
    process.stdout.write(`advanced ${row.tenderSubStage ?? '(none)'} -> LoA Issued: ${name}\n`);
  }

  process.stdout.write('\nDone. Now run: npm run db:seed-dummy-extras-2\n');
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    return pool.end().finally(() => process.exit(1));
  });
