/**
 * One-shot dummy-data seeder for Pre-Monsoon Preparation (bhaveshTask.md
 * Task 5) — 12 realistic preparation topics spanning all 4 priority levels
 * and a mix of overdue/upcoming/undated deadlines, so the page's table
 * (and its new column filters) have real data to demonstrate.
 *
 * Idempotent: skips any topic that already exists. Goes through the same
 * createPreMonsoon() service the API route uses, so seeded rows get a real
 * audit trail entry like everything else seeded this way.
 *
 * Usage:
 *   npm run db:seed-dummy-premonsoon
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { preMonsoonItem } from './schema.js';
import type { AuditActor } from '../lib/audit.js';
import { createPreMonsoon, type PreMonsoonCreateInput } from '../services/preMonsoonService.js';

const SEED_ACTOR: AuditActor = {
  userId: null,
  username: 'system:seed-premonsoon',
  role: 'MD',
};

const ITEMS: PreMonsoonCreateInput[] = [
  { topic: 'Desilting of major storm water drains — Patna core city', priority: 'High', deadlineDate: '2026-05-15' },
  { topic: 'Clearing of choked culverts and outfall structures — Gaya', priority: 'High', deadlineDate: '2026-05-20' },
  { topic: 'Inspection of pumping station standby generators', priority: 'High', deadlineDate: '2026-05-10' },
  { topic: 'Repair of damaged manhole covers across sewerage network', priority: 'Medium', deadlineDate: '2026-05-25' },
  { topic: 'Stock-taking of emergency flood-response equipment', priority: 'Medium', deadlineDate: '2026-05-30' },
  { topic: 'Coordination meeting with District Disaster Management Authority', priority: 'Medium', deadlineDate: '2026-06-01' },
  { topic: 'Verification of low-lying ward flood-alert contact lists', priority: 'Medium', deadlineDate: null },
  { topic: 'Repainting and reflectorisation of drain-edge safety markers', priority: 'Low', deadlineDate: '2026-06-05' },
  { topic: 'Annual review of pre-monsoon preparedness SOP document', priority: 'Low', deadlineDate: null },
  { topic: 'Desilting of secondary drains — Bhagalpur and Munger', priority: 'High', deadlineDate: '2026-04-20' },
  { topic: 'Testing of portable dewatering pumps at all divisions', priority: 'Medium', deadlineDate: '2026-04-25' },
  { topic: 'Public awareness signage for waterlogging-prone junctions', priority: 'N/A', deadlineDate: null },
];

async function main(): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const item of ITEMS) {
    const [existing] = await db
      .select({ itemId: preMonsoonItem.itemId })
      .from(preMonsoonItem)
      .where(eq(preMonsoonItem.topic, item.topic))
      .limit(1);
    if (existing) {
      process.stdout.write(`skip  ${item.topic} (already exists)\n`);
      skipped++;
      continue;
    }
    await createPreMonsoon(item, SEED_ACTOR);
    process.stdout.write(`apply ${item.topic}\n`);
    created++;
  }

  process.stdout.write(`Pre-Monsoon dummy-data seed complete — ${created} created, ${skipped} skipped.\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
