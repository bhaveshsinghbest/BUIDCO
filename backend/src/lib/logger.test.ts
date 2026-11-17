/**
 * S-11: the log must never carry credentials, OTPs or server paths, whatever
 * a caller passes in.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { describeError, logger, redact, sanitizeStack, setLogSink, type LogRecord } from './logger.js';

afterEach(() => setLogSink(null));

function capture(): LogRecord[] {
  const records: LogRecord[] = [];
  setLogSink((r) => records.push(r));
  return records;
}

describe('redact', () => {
  it('replaces every sensitive-looking field, at any depth', () => {
    const out = redact({
      username: 'shri',
      password: 'hunter2hunter2',
      confirmPassword: 'x',
      otp: '123456',
      resetToken: 'abc.def',
      accessToken: 'eyJ...',
      authorization: 'Bearer x',
      cookie: 'buidco_refresh=...',
      DATABASE_URL: 'postgres://app@db.example/buidco',
      nested: { apiKey: 'k', refreshTokenSecret: 's', keep: 'visible' },
    }) as Record<string, unknown>;

    expect(out.username).toBe('shri');
    for (const k of ['password', 'confirmPassword', 'otp', 'resetToken', 'accessToken', 'authorization', 'cookie', 'DATABASE_URL']) {
      expect(out[k], k).toBe('[REDACTED]');
    }
    expect(out.nested).toEqual({ apiKey: '[REDACTED]', refreshTokenSecret: '[REDACTED]', keep: 'visible' });
  });

  it('bounds long strings', () => {
    const out = redact({ note: 'x'.repeat(5000) }) as { note: string };
    expect(out.note.length).toBeLessThan(600);
  });
});

describe('logger', () => {
  it('writes one structured record with timestamp, level and event', () => {
    const records = capture();
    logger.warn('auth.login.failure', { username: 'shri', password: 'should-not-appear', ip: '10.0.0.1' });
    expect(records).toHaveLength(1);
    const [r] = records;
    expect(r?.level).toBe('warn');
    expect(r?.event).toBe('auth.login.failure');
    expect(typeof r?.ts).toBe('string');
    expect(JSON.stringify(r)).not.toContain('should-not-appear');
  });

  it('a field cannot overwrite the event name or level', () => {
    const records = capture();
    logger.info('real.event', { event: 'spoofed', level: 'error' });
    expect(records[0]?.event).toBe('real.event');
    expect(records[0]?.level).toBe('info');
  });
});

describe('sanitizeStack', () => {
  it('removes absolute server paths but keeps file and line', () => {
    const stack = [
      'Error: boom',
      '    at createProject (/srv/buidco/backend/dist/services/projectsService.js:120:11)',
      '    at C:\\Users\\someone\\apps\\buidco\\node_modules\\express\\lib\\router\\layer.js:95:5',
      '    at node:internal/process/task_queues:95:5',
    ].join('\n');
    const out = sanitizeStack(stack);
    expect(out).not.toContain('/srv/buidco');
    expect(out).not.toContain('C:\\Users');
    expect(out).toContain('projectsService.js:120:11');
    expect(out).toContain('layer.js:95:5');
    expect(out).toContain('node:internal/process/task_queues');
  });

  it('describeError carries a sanitised stack', () => {
    const fields = describeError(new Error('db unreachable'));
    expect(fields.errorMessage).toBe('db unreachable');
    expect(String(fields.stack)).not.toMatch(/[A-Za-z]:\\\\Users|\/home\//);
  });
});
