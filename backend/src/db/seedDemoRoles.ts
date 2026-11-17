/**
 * Dummy accounts for presentation/testing across every role. Deliberately
 * named demo_* so they can never be confused with a real account; the only
 * existing users it touches are its own demo_* accounts, whose password it
 * resets to DEMO_ACCOUNT_PASSWORD. Also removes one leftover ad-hoc test
 * account (audit_pd) from earlier verification work.
 *
 * Usage: DEMO_ACCOUNT_PASSWORD=<12+ chars> npm run db:seed-demo-roles
 *
 * Development and test databases only (seedGuard.ts). In production the
 * API refuses demo_* sign-ins anyway (authService.isDemoLoginBlocked).
 */
import { eq, sql } from 'drizzle-orm';
import { db, pool } from './client.js';
import { assertDemoSeedingAllowed, demoAccountPassword } from './seedGuard.js';
import { appUser, auditLog, passwordResetRequest } from './schema.js';
import { createUser, updateUser } from '../services/usersService.js';
import type { AuditActor } from '../lib/audit.js';

const SEED_ACTOR: AuditActor = { userId: null, username: 'system:seed-roles', role: 'MD' };

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
  if (existing) {
    // Re-running the seeder replaces the old, published demo password with
    // DEMO_ACCOUNT_PASSWORD (S-02). Only the demo account's own password
    // changes, through the audited user service.
    await updateUser(existing.userId, { password: demoAccountPassword() }, SEED_ACTOR);
    process.stdout.write(`exists, password reset from DEMO_ACCOUNT_PASSWORD: ${username}\n`);
    return;
  }
  await createUser({ username, password: demoAccountPassword(), role, fullName, ...extra }, SEED_ACTOR);
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
  await assertDemoSeedingAllowed('seedDemoRoles');
  demoAccountPassword(); // fail before creating anything if it is not set
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

  // The password is never printed: it is whatever DEMO_ACCOUNT_PASSWORD holds.
  process.stdout.write('\nAll demo accounts use the password set in DEMO_ACCOUNT_PASSWORD.\n');
}

main().then(() => pool.end()).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  return pool.end().finally(() => process.exit(1));
});
