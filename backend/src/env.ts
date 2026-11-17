import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';

const cwd = process.cwd();
const candidates = ['.env.local', '.env'];
for (const file of candidates) {
  const abs = resolve(cwd, file);
  if (existsSync(abs)) {
    loadDotenv({ path: abs, override: false });
  }
}

/** Treats an empty assignment (`FOO=`) the same as an unset variable. */
const optionalString = z.string().min(1).optional().or(z.literal('').transform(() => undefined));

/** An optional choice where an empty assignment also means "unset". */
function optionalEnum<const T extends [string, ...string[]]>(values: T) {
  return z.enum(values).optional().or(z.literal('').transform(() => undefined));
}

const envSchema = z.object({
  /**
   * Required, with no default (security finding S-05). A default of
   * "development" meant a host that forgot to set it silently ran with
   * stack traces in responses, non-Secure cookies and no rate limiting.
   * Local scripts pass it explicitly (backend/config/development.env),
   * vitest sets "test", and the host or PM2 sets "production".
   */
  NODE_ENV: z.enum(['development', 'test', 'production'], {
    errorMap: () => ({
      message:
        'NODE_ENV is required and must be one of development | test | production. Set it in the host environment (production) or run the npm scripts, which load backend/config/development.env.',
    }),
  }),
  PORT: z.coerce.number().int().positive().default(4000),

  /**
   * Injected automatically by Render — the service's own public URL. Absent
   * everywhere else, which is exactly how the keep-alive ping decides whether
   * it is running on a host that suspends idle instances. Never set by hand.
   */
  RENDER_EXTERNAL_URL: z.string().url().optional(),

  /**
   * Escape hatch for the keep-alive ping (see lib/keepAlive.ts). Set to
   * "off" once the API moves to an always-on plan, where self-pinging is
   * pointless and only burns instance hours.
   */
  KEEP_ALIVE: z.enum(['on', 'off']).default('on'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /**
   * TLS to PostgreSQL (finding S-10). Unset = derived from the URL's
   * `sslmode` (any of require/verify-ca/verify-full/prefer => "verify").
   *   off       plain TCP; only for a database on localhost or a private link
   *   verify    TLS with certificate AND host-name verification
   *   no-verify TLS without verification; refused when NODE_ENV=production
   * DB_SSL_CA_FILE: PEM file with the CA that signed the database server's
   * certificate, when it is not a publicly trusted CA.
   */
  DB_SSL: optionalEnum(['off', 'verify', 'no-verify']),
  DB_SSL_CA_FILE: optionalString,

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /**
   * Session lifetime (finding S-15). The refresh token is the session:
   *   REFRESH_TOKEN_TTL_SECONDS  idle timeout: a session not refreshed for
   *                              this long ends (default 2 hours)
   *   SESSION_MAX_AGE_SECONDS    absolute limit from sign-in, however
   *                              active the user is (default 12 hours)
   * The browser also signs out after 60 minutes without interaction
   * (frontend useInactivityLogout). Confirm both values with the department.
   */
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2 * 60 * 60),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(12 * 60 * 60),

  /**
   * Express "trust proxy" (finding S-22): which upstream hops may set
   * X-Forwarded-For. A hop count ("1"), "false", or a comma-separated list of
   * addresses/subnets/keywords ("loopback", "10.0.0.0/8"). Naming the proxy
   * is safer than a hop count: then a client that reaches Node directly
   * cannot spoof its IP. Unset keeps the previous behaviour (1 hop) and
   * warns in production.
   */
  TRUST_PROXY: optionalString,

  /**
   * Where rate-limit counters live (finding S-14).
   *   upstash   Upstash Redis REST (needs UPSTASH_REDIS_REST_URL/TOKEN)
   *   postgres  the application database (shared by every instance, stays
   *             on the government server; needs migration 0021)
   *   memory    this process only (not shared across instances)
   *   off       no rate limiting (refused when NODE_ENV=production)
   * Unset: upstash when configured, else memory in production, else off.
   */
  RATE_LIMIT_STORE: optionalEnum(['upstash', 'postgres', 'memory', 'off']),
  /** Login attempts allowed per window, per source IP and per username. */
  LOGIN_RATE_LIMIT_PER_IP: z.coerce.number().int().positive().default(100),
  LOGIN_RATE_LIMIT_PER_USER: z.coerce.number().int().positive().default(20),
  /** Window (and therefore the longest block) for both login limits. */
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(15 * 60),

  /**
   * The demo_* accounts created by db:seed-demo-roles share a published
   * password (finding S-02). In production their sign-in is refused unless
   * this is explicitly "true" — never set it on government hosting.
   */
  ALLOW_DEMO_ACCOUNTS: z.enum(['true', 'false']).default('false'),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1, 'CORS_ALLOWED_ORIGINS is required (comma-separated list)')
    .transform((raw) =>
      raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    )
    .pipe(z.array(z.string().url()).min(1, 'At least one allowed origin is required')),

  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),

  UPLOADTHING_TOKEN: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),

  /**
   * Where uploaded geo-photos are kept (finding S-21).
   *   local        files on this server under PHOTO_STORAGE_DIR, served only
   *                through the API by short-lived signed links checked against
   *                the user's permissions — recommended for government hosting
   *   uploadthing  UploadThing's CDN: a third-party (overseas) service whose
   *                file URLs are public to anyone who has them
   *   off          no file upload (photos can still be linked by URL)
   * Unset: uploadthing when UPLOADTHING_TOKEN is set, otherwise off.
   */
  PHOTO_STORAGE: optionalEnum(['local', 'uploadthing', 'off']),
  /** Absolute path of the photo directory; include it in server backups. */
  PHOTO_STORAGE_DIR: optionalString,
  /** Largest accepted photo, in bytes (default 3 MB). */
  PHOTO_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024)
    .default(3 * 1024 * 1024),

  /**
   * Optional translation fallback for Hindi search.
   *
   * OFF by default and deliberately so: the dictionary plus transliteration
   * already cover the vocabulary this dashboard uses, and a per-keystroke
   * call to an external translation service would add latency and cost to
   * the hot path. It is only consulted when a search has already come back
   * empty, so enabling it can widen results but can never slow down or
   * break a search that was going to succeed.
   *
   * No key is ever hardcoded; an enabled flag with no key is treated as
   * disabled and warned about at startup.
   */
  SEARCH_TRANSLATION: z.enum(['on', 'off']).default('off'),
  SEARCH_TRANSLATION_PROVIDER: z.enum(['bhashini', 'google']).default('bhashini'),
  SEARCH_TRANSLATION_API_KEY: z
    .string()
    .min(1)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** Bhashini pipeline endpoint; unused by the google provider. */
  SEARCH_TRANSLATION_ENDPOINT: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),

  COOKIE_DOMAIN: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),

  // SMTP — forgot-password email OTP delivery. Optional/graceful like Upstash
  // above: unset in dev falls back to logging the OTP instead of emailing it.
  SMTP_HOST: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  SMTP_PASS: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  SMTP_FROM: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
});

/**
 * Rules that span several variables. Insecure combinations are refused in
 * production instead of being warned about, because a warning at startup is
 * exactly what scrolled past unnoticed before (see lib/rateLimit.ts).
 *
 * Missing SMTP is still allowed: password-reset codes then cannot be sent
 * (the endpoints answer 503) but nothing insecure happens. OTP values are
 * never written to the log (finding S-04).
 */
const checkedEnvSchema = envSchema.superRefine((e, ctx) => {
  if (e.REFRESH_TOKEN_TTL_SECONDS <= e.ACCESS_TOKEN_TTL_SECONDS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REFRESH_TOKEN_TTL_SECONDS'],
      message: 'REFRESH_TOKEN_TTL_SECONDS must be longer than ACCESS_TOKEN_TTL_SECONDS',
    });
  }
  if (e.PHOTO_STORAGE === 'local' && !(e.PHOTO_STORAGE_DIR && isAbsolute(e.PHOTO_STORAGE_DIR))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PHOTO_STORAGE_DIR'],
      message: 'PHOTO_STORAGE=local needs PHOTO_STORAGE_DIR set to an absolute directory path',
    });
  }
  if (e.PHOTO_STORAGE === 'uploadthing' && !e.UPLOADTHING_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PHOTO_STORAGE'],
      message: 'PHOTO_STORAGE=uploadthing needs UPLOADTHING_TOKEN',
    });
  }
  if (e.RATE_LIMIT_STORE === 'upstash' && !(e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RATE_LIMIT_STORE'],
      message: 'RATE_LIMIT_STORE=upstash needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',
    });
  }
  if (e.NODE_ENV === 'production') {
    if (e.DB_SSL === 'no-verify') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_SSL'],
        message: 'DB_SSL=no-verify is not allowed in production; use verify (with DB_SSL_CA_FILE if needed) or off for a local database',
      });
    }
    if (e.RATE_LIMIT_STORE === 'off') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RATE_LIMIT_STORE'],
        message: 'RATE_LIMIT_STORE=off is not allowed in production',
      });
    }
    // Search text can name projects, places and contractors. In production
    // it may only go to Bhashini (Government of India), and only once the
    // department has approved switching the fallback on (finding S-26).
    if (e.SEARCH_TRANSLATION === 'on' && e.SEARCH_TRANSLATION_PROVIDER !== 'bhashini') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SEARCH_TRANSLATION_PROVIDER'],
        message: 'Only the bhashini translation provider may be enabled in production',
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates a set of variables; throws one error listing every problem.
 * Exported so the rules can be tested without touching process.env.
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = checkedEnvSchema.safeParse(source);
  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    const lines = Object.entries(formatted).map(([k, msgs]) => `  - ${k}: ${(msgs ?? []).join('; ')}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export const env: Env = parseEnv(process.env);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

