/**
 * One-shot bulk seeder for the ~300 SEED_PROJECTS array embedded in the
 * reference JSX (`BUIDCO_Dashboard_v97 (1).jsx`).
 *
 * Rules:
 *   - Idempotent: skips any row whose `projectName` already exists.
 *   - Uses the same insert path as `POST /api/projects` (transaction +
 *     audit row) so seeded rows are indistinguishable from user-created
 *     ones, with an audit actor of `system:seed`.
 *   - Aliases divergent names between the JSX and the schema:
 *       "Saat Nischay-2"   → "SAAT NISHCHAY"
 *       "State Funded"     → "STATE FUNDED"
 *       "Other Infra"      → (no matching scheme; skipped, logged)
 *       status "Ongoing"   → "In Progress"
 *   - Clamps `physicalProgress`/`financialProgress` to [0, 100] — the
 *     JSX reference has some rows > 100 (e.g. 129.41, 299.41), which
 *     is a data-quality artefact we don't want to propagate.
 *   - Parses `expectedCompletion` DD.MM.YYYY into `expected_completion_date`
 *     when possible; the original string always lands in
 *     `expected_completion_raw`.
 *
 * Usage:
 *   npm run db:seed-projects                    # seed everything (~300)
 *   npm run db:seed-projects -- --limit 2       # seed only the first 2
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, Script } from 'node:vm';
import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { assertDemoSeedingAllowed } from './seedGuard.js';
import { project, projectScheme, scheme, sector } from './schema.js';
import { recordAudit, type AuditActor } from '../lib/audit.js';
import { diffProject } from '../lib/auditLabels.js';

interface SeedProject {
  id?: string;
  projectName?: string;
  sectorName?: string;
  sector?: string[];
  status?: string;
  contractor?: string;
  physicalProgress?: number;
  financialProgress?: number;
  aaAmount?: string;
  agreementAmount?: string;
  expectedCompletion?: string;

  // MPR-imported extras present on some seeds (mpr_*). All optional.
  fundReceived?: number;
  expenditureCentral?: string;
  expenditureState?: string;
  manpowerEngaged?: number | string;
  mainComponentScope?: string;
  progressPrevMonth?: number | string;
  progressThisMonth?: number | string;
  mprMonth?: string;
  mprRemark?: string;
}

const SCHEME_NAME_ALIASES: Record<string, string | null> = {
  'saat nischay-2': 'SAAT NISHCHAY',
  'state funded': 'STATE FUNDED',
  'other infra': null,
};

const STATUS_ALIASES: Record<string, string> = {
  ongoing: 'In Progress',
};

const SEED_ACTOR: AuditActor = {
  userId: null,
  username: 'system:seed',
  role: 'MD',
};

function findJsxPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '..', '..', '..', '..', 'BUIDCO_Dashboard_v97 (1).jsx'),
    resolve(process.cwd(), '..', '..', 'BUIDCO_Dashboard_v97 (1).jsx'),
    resolve(process.cwd(), 'BUIDCO_Dashboard_v97 (1).jsx'),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {
      // try next
    }
  }
  throw new Error(`Reference JSX not found. Tried:\n  ${candidates.join('\n  ')}`);
}

function extractSeedArrayLiteral(source: string): string {
  const startIdx = source.indexOf('const SEED_PROJECTS = [');
  if (startIdx === -1) throw new Error('const SEED_PROJECTS = [ not found in reference JSX');
  const openBracket = source.indexOf('[', startIdx);

  // String-aware bracket scanner. Some projectName / expectedCompletion
  // values contain literal `[` and `]` inside double-quoted strings —
  // ignore brackets while in a string. Handles `\"` escape.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let i = openBracket;
  for (; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  if (depth !== 0) throw new Error(`Unbalanced brackets in SEED_PROJECTS (final depth ${depth})`);
  return source.slice(openBracket, i);
}

function parseArrayLiteral(src: string): SeedProject[] {
  const script = new Script(`(${src})`);
  const ctx = createContext({});
  const value: unknown = script.runInContext(ctx, { timeout: 5000 });
  if (!Array.isArray(value)) throw new Error('SEED_PROJECTS did not evaluate to an array');
  return value as SeedProject[];
}

function parseNumberOrNull(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseDdMmYyyyOrNull(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  // Reject impossible dates like 31.11.2026 — Date silently rolls those over.
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const MAX_PROJECT_NAME = 300;

function deriveProjectName(s: SeedProject): { name: string; briefFromOverflow: string | null } {
  const raw = (s.projectName ?? '').trim();
  if (raw.length <= MAX_PROJECT_NAME) return { name: raw, briefFromOverflow: null };
  // Long "name" is really a tender description — synthesize a short name
  // from the seed id and preserve the full text in project_brief.
  if (s.id) {
    const stripped = s.id.replace(/^(seed|mpr|new)_\d+_?/i, '').trim();
    if (stripped) {
      const pretty = stripped
        .replace(/_/g, ' ')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      const suffix = s.sectorName ? ` (${s.sectorName})` : '';
      return { name: `${pretty}${suffix}`.slice(0, MAX_PROJECT_NAME), briefFromOverflow: raw };
    }
  }
  return { name: `${raw.slice(0, MAX_PROJECT_NAME - 1)}…`, briefFromOverflow: raw };
}

interface Report {
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  clampedPhysical: number;
  clampedFinancial: number;
  unknownSector: Set<string>;
  unknownScheme: Set<string>;
  aliasedStatus: number;
}

async function loadLookups(): Promise<{
  sectorByName: Map<string, number>;
  schemeByName: Map<string, number>;
}> {
  const [sectors, schemes] = await Promise.all([
    db.select({ id: sector.sectorId, name: sector.sectorName }).from(sector),
    db.select({ id: scheme.schemeId, name: scheme.schemeName }).from(scheme),
  ]);
  return {
    sectorByName: new Map(sectors.map((s) => [s.name.trim().toLowerCase(), s.id])),
    schemeByName: new Map(schemes.map((s) => [s.name.trim().toLowerCase(), s.id])),
  };
}

function resolveSchemeIds(
  raw: string[] | undefined,
  schemeByName: Map<string, number>,
  report: Report,
): number[] {
  const ids: number[] = [];
  for (const name of raw ?? []) {
    const key = name.trim().toLowerCase();
    if (SCHEME_NAME_ALIASES[key] === null) continue;
    const targetKey = (SCHEME_NAME_ALIASES[key] ?? name).trim().toLowerCase();
    const id = schemeByName.get(targetKey);
    if (id === undefined) {
      report.unknownScheme.add(name);
    } else if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function resolveSectorId(
  raw: string | undefined,
  sectorByName: Map<string, number>,
  report: Report,
): number | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  const id = sectorByName.get(key);
  if (id === undefined) {
    report.unknownSector.add(raw);
    return null;
  }
  return id;
}

function resolveStatus(raw: string | undefined, report: Report): string {
  if (!raw) return 'Not Started';
  const aliased = STATUS_ALIASES[raw.trim().toLowerCase()];
  if (aliased) {
    report.aliasedStatus++;
    return aliased;
  }
  return raw;
}

async function seedOne(
  s: SeedProject,
  lookups: {
    sectorByName: Map<string, number>;
    schemeByName: Map<string, number>;
  },
  report: Report,
): Promise<'inserted' | 'skipped' | 'failed'> {
  if (!s.projectName || s.projectName.trim() === '') return 'skipped';

  const { name: projectName, briefFromOverflow } = deriveProjectName(s);

  const [existing] = await db
    .select({ id: project.projectId })
    .from(project)
    .where(eq(project.projectName, projectName))
    .limit(1);
  if (existing) return 'skipped';

  const sectorId = resolveSectorId(s.sectorName, lookups.sectorByName, report);
  const schemeIds = resolveSchemeIds(s.sector, lookups.schemeByName, report);
  const status = resolveStatus(s.status, report);

  let physical = parseNumberOrNull(s.physicalProgress);
  if (physical !== null && physical > 100) {
    report.clampedPhysical++;
    physical = 100;
  }
  if (physical !== null && physical < 0) physical = 0;

  let financial = parseNumberOrNull(s.financialProgress);
  if (financial !== null && financial > 100) {
    report.clampedFinancial++;
    financial = 100;
  }
  if (financial !== null && financial < 0) financial = 0;

  const aa = parseNumberOrNull(s.aaAmount);
  const agr = parseNumberOrNull(s.agreementAmount);
  const expDate = parseDdMmYyyyOrNull(s.expectedCompletion);
  const expRaw = s.expectedCompletion ?? null;
  const projectId = randomUUID();

  const fundReceived = parseNumberOrNull(s.fundReceived);
  const mprMonth = s.mprMonth ?? null;
  const mainScope = s.mainComponentScope ?? null;
  const mprRemark = s.mprRemark ?? null;
  const expCentral = s.expenditureCentral ?? null;
  const expState = s.expenditureState ?? null;
  const manpower = s.manpowerEngaged !== undefined ? String(s.manpowerEngaged) : null;
  const progPrev = s.progressPrevMonth !== undefined ? String(s.progressPrevMonth) : null;
  const progThis = s.progressThisMonth !== undefined ? String(s.progressThisMonth) : null;

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(project)
        .values({
          projectId,
          projectName,
          projectBrief: briefFromOverflow,
          sectorId,
          status,
          contractor: s.contractor ?? null,
          physicalProgressPct: physical !== null ? String(physical) : null,
          financialProgressPct: financial !== null ? String(financial) : null,
          aaAmountCr: aa !== null ? String(aa) : null,
          agreementAmountCr: agr !== null ? String(agr) : null,
          expectedCompletionDate: expDate,
          expectedCompletionRaw: expRaw,

          // MPR extras where present (mpr_* seeds only)
          fundReceivedCr: fundReceived !== null ? String(fundReceived) : null,
          mprMonth,
          mainComponentScope: mainScope,
          mprRemark,
          expenditureCentralRaw: expCentral,
          expenditureStateRaw: expState,
          manpowerEngagedRaw: manpower,
          progressPrevMonthRaw: progPrev,
          progressThisMonthRaw: progThis,
        })
        .returning();
      if (!row) throw new Error('project insert did not return a row');

      if (schemeIds.length > 0) {
        await tx
          .insert(projectScheme)
          .values(schemeIds.map((schemeId) => ({ projectId: row.projectId, schemeId })));
      }

      await recordAudit(tx, {
        actor: SEED_ACTOR,
        action: 'Created',
        projectId: row.projectId,
        projectNameSnapshot: row.projectName,
        changes: diffProject(
          {},
          { ...(row as unknown as Record<string, unknown>), schemes: schemeIds },
        ),
      });
    });
    return 'inserted';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`FAIL "${s.projectName}": ${msg}\n`);
    return 'failed';
  }
}

function parseLimitFlag(argv: string[]): number | null {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') {
      const raw = argv[i + 1];
      if (!raw) throw new Error('--limit requires a positive integer value');
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`--limit must be a positive integer, got "${raw}"`);
      }
      return n;
    }
    const arg = argv[i];
    if (arg && arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`--limit must be a positive integer, got "${arg}"`);
      }
      return n;
    }
  }
  return null;
}

async function run(): Promise<void> {
  await assertDemoSeedingAllowed('seedProjects');
  const limit = parseLimitFlag(process.argv.slice(2));
  const jsxPath = findJsxPath();
  process.stdout.write(`Reading ${jsxPath}\n`);
  const source = readFileSync(jsxPath, 'utf8');
  const arraySrc = extractSeedArrayLiteral(source);
  const allSeeds = parseArrayLiteral(arraySrc);
  process.stdout.write(`Parsed ${allSeeds.length} SEED_PROJECTS entries\n`);

  const seeds = limit === null ? allSeeds : allSeeds.slice(0, limit);
  if (limit !== null) {
    process.stdout.write(`--limit ${limit}: will process the first ${seeds.length} entries only\n`);
  }

  const lookups = await loadLookups();

  const report: Report = {
    total: seeds.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    clampedPhysical: 0,
    clampedFinancial: 0,
    unknownSector: new Set(),
    unknownScheme: new Set(),
    aliasedStatus: 0,
  };

  let done = 0;
  for (const s of seeds) {
    const outcome = await seedOne(s, lookups, report);
    if (outcome === 'inserted') report.inserted++;
    else if (outcome === 'skipped') report.skipped++;
    else report.failed++;
    done++;
    if (done % 25 === 0) {
      process.stdout.write(`  progress: ${done}/${seeds.length}\n`);
    }
  }

  process.stdout.write(`\nSeed complete:\n`);
  process.stdout.write(`  total in file:         ${report.total}\n`);
  process.stdout.write(`  inserted:              ${report.inserted}\n`);
  process.stdout.write(`  skipped (name exists): ${report.skipped}\n`);
  process.stdout.write(`  failed:                ${report.failed}\n`);
  process.stdout.write(`  clamped physical %>100: ${report.clampedPhysical}\n`);
  process.stdout.write(`  clamped financial %>100:${report.clampedFinancial}\n`);
  process.stdout.write(`  status aliased 'Ongoing'→'In Progress': ${report.aliasedStatus}\n`);
  if (report.unknownSector.size > 0) {
    process.stdout.write(`  unknown sectors (unmapped): ${[...report.unknownSector].join(', ')}\n`);
  }
  if (report.unknownScheme.size > 0) {
    process.stdout.write(`  unknown schemes (skipped): ${[...report.unknownScheme].join(', ')}\n`);
  }
}

run()
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
