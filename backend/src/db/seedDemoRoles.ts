/**
 * Dummy accounts for presentation/testing across every role (bhaveshTask.md
 * Task 2). Deliberately named demo_* so they can never be confused with a
 * real account, and never touches any existing user. Also removes one
 * leftover ad-hoc test account (audit_pd) from earlier verification work.
 *
 * Usage: npm run db:seed-demo-roles
 */
import { eq, sql } from 'drizzle-orm';
import { db, pool } from './client.js';
import { appUser, auditLog, passwordResetRequest } from './schema.js';
import { createUser } from '../services/usersService.js';
import type { AuditActor } from '../lib/audit.js';

const SEED_ACTOR: AuditActor = { userId: null, username: 'system:seed-roles', role: 'MD' };
const DEMO_PASSWORD = 'Demo@1234';

async function cleanupStrayAuditPd(): Promise<void> {
  const [row] = await db.select().from(appUser).where(eq(appUser.username, 'audit_pd'));
  if (!row) return;
  await db.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, row.userId));
  await db.update(passwordResetRequest).set({ approverId: null }).where(eq(passwordResetRequest.approverId, row.userId));
  await db.delete(appUser).where(eq(appUser.userId, row.userId));
  process.stdout.write('cleaned up stray leftover account: audit_pd\n');
}

async function createIfMissing(username: string, role: 'MD' | 'Admin' | 'PD' | 'Viewer', fullName: string, extra: Record<string, unknown> = {}): Promise<void> {
  const [existing] = await db.select().from(appUser).where(eq(appUser.username, username));
  if (existing) { process.stdout.write(`skip (already exists): ${username}\n`); return; }
  await createUser({ username, password: DEMO_PASSWORD, role, fullName, ...extra }, SEED_ACTOR);
  process.stdout.write(`created ${role}: ${username}\n`);
}

async function bestDivisionForDemo(): Promise<{ id: number; name: string } | null> {
  const rows = await db.execute<{ division_id: number; division_name: string; cnt: number }>(sql`
    SELECT d.division_id, d.division_name, COUNT(p.project_id)::int AS cnt
    FROM division d
    JOIN project p ON p.division_id = d.division_id
    GROUP BY d.division_id, d.division_name
    ORDER BY cnt DESC
    LIMIT 1;
  `);
  const row = rows.rows[0];
  return row ? { id: row.division_id, name: row.division_name } : null;
}

async function main(): Promise<void> {
  await cleanupStrayAuditPd();

  await createIfMissing('demo_md', 'MD', 'Demo Managing Director');
  await createIfMissing('demo_admin', 'Admin', 'Demo Administrator');
  await createIfMissing('demo_viewer', 'Viewer', 'Demo Viewer', { canViewProjects: true });

  const division = await bestDivisionForDemo();
  if (!division) {
    process.stdout.write('skip demo_pd — no division with projects found\n');
  } else {
    await createIfMissing('demo_pd', 'PD', 'Demo Project Director', {
      divisions: [division.id],
      canCreateProjects: true,
      canUpdateProjects: true,
      canViewProjects: true,
    });
    process.stdout.write(`demo_pd assigned to division: ${division.name}\n`);
  }

  process.stdout.write(`\nAll demo accounts use the password: ${DEMO_PASSWORD}\n`);
}

main().then(() => pool.end()).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  return pool.end().finally(() => process.exit(1));
});
