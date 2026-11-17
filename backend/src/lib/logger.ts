/**
 * Structured application and security log (finding S-11).
 *
 * One JSON object per line on stdout (stderr for errors). The host's log
 * shipper (PM2 log files, journald, rsyslog, Fluent Bit, Filebeat) forwards
 * these lines to the department's central log store, which keeps them for
 * the retention period CERT-In requires (180 days). The application itself
 * never decides retention: see the deployment checklist.
 *
 * What must never appear in a log line, whatever the caller passes:
 *   - passwords, OTPs, reset tokens, JWTs, refresh cookies, API keys and
 *     connection strings: any field whose NAME looks sensitive is replaced
 *     with "[REDACTED]" before serialisation;
 *   - request bodies and query strings: callers log paths and ids only;
 *   - absolute server paths: stack traces are rewritten relative to the
 *     application root (sanitizeStack).
 */
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isTest } from '../env.js';

export type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

export interface LogRecord extends LogFields {
  ts: string;
  level: LogLevel;
  event: string;
}

const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|otp|authori[sz]ation|cookie|api[-_]?key|credential|database_?url|signature|^sig$/i;

const MAX_STRING = 500;
const MAX_DEPTH = 4;

/** Replaces sensitive values and bounds the size of whatever is logged. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** backend/ — the directory that holds src/ and dist/. */
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ROOT_PATTERNS: RegExp[] = [
  pathToFileURL(APP_ROOT + sep).href,
  APP_ROOT + sep,
  (APP_ROOT + sep).replace(/\\/g, '/'),
].map((p) => new RegExp(escapeRegExp(p), 'gi'));

/**
 * Rewrites absolute paths in a stack trace relative to the application
 * root, so log files do not disclose the server's directory layout
 * (e.g. "at createProject (dist/services/projectsService.js:120:11)").
 */
export function sanitizeStack(stack: string): string {
  let out = stack;
  for (const re of ROOT_PATTERNS) out = out.replace(re, '');
  // Anything still absolute (node internals are already "node:..."):
  // keep only the last two path segments.
  out = out.replace(
    /(^|[\s(])(?:[A-Za-z]:)?[\\/](?:[^\s:()\\/]+[\\/])+([^\s:()\\/]+[\\/][^\s:()\\/]+)/gm,
    '$1…/$2',
  );
  return out;
}

/** Name, message and sanitised stack of an error, ready for a log field. */
export function describeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message.length > MAX_STRING ? `${err.message.slice(0, MAX_STRING)}…` : err.message,
      ...(err.stack ? { stack: sanitizeStack(err.stack) } : {}),
    };
  }
  return { errorMessage: String(err) };
}

type Sink = (record: LogRecord) => void;

const defaultSink: Sink = (record) => {
  const line = `${JSON.stringify(record)}\n`;
  if (record.level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
};

// Unit tests run silently unless a test installs its own sink.
let sink: Sink | null = isTest ? null : defaultSink;

/** Test hook: capture records instead of writing them. Pass null to silence. */
export function setLogSink(next: Sink | null): void {
  sink = next;
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (!sink) return;
  const record: LogRecord = { ts: new Date().toISOString(), level, event };
  // Callers cannot overwrite ts/level/event with a field of the same name.
  for (const [k, v] of Object.entries(redact(fields) as LogFields)) {
    if (!(k in record)) record[k] = v;
  }
  sink(record);
}

export const logger = {
  info: (event: string, fields?: LogFields): void => log('info', event, fields),
  warn: (event: string, fields?: LogFields): void => log('warn', event, fields),
  error: (event: string, fields?: LogFields): void => log('error', event, fields),
};
