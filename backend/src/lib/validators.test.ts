import { describe, expect, it } from 'vitest';
import { createProjectSchema } from './projectFields.js';
import { httpUrl, isoDate, MAX_CR_AMOUNT, optionalIsoDate } from './validators.js';

describe('isoDate', () => {
  it.each(['2026-01-31', '2024-02-29', '2026-12-01', '1999-06-15'])('accepts the real date %s', (d) => {
    expect(isoDate().safeParse(d).success).toBe(true);
  });

  it.each(['2026-02-31', '2025-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '31-01-2026', '', 'yesterday'])(
    'rejects %j',
    (d) => {
      expect(isoDate().safeParse(d).success).toBe(false);
    },
  );

  it('optional form allows null and undefined', () => {
    expect(optionalIsoDate().safeParse(null).success).toBe(true);
    expect(optionalIsoDate().safeParse(undefined).success).toBe(true);
    expect(optionalIsoDate().safeParse('2026-02-30').success).toBe(false);
  });
});

describe('httpUrl', () => {
  it.each(['https://example.org/a.jpg', 'http://maps.google.com/?q=25.6,85.1', 'HTTPS://EXAMPLE.ORG'])('accepts %s', (u) => {
    expect(httpUrl(2000).safeParse(u).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'ftp://example.org/file',
    'not a url',
  ])('rejects %s', (u) => {
    expect(httpUrl(2000).safeParse(u).success).toBe(false);
  });

  it('enforces the length cap', () => {
    expect(httpUrl(30).safeParse(`https://example.org/${'a'.repeat(40)}`).success).toBe(false);
  });
});

describe('createProjectSchema numeric bounds', () => {
  const base = { projectName: 'Validator test' };

  it('rejects negative amounts', () => {
    for (const field of ['aaAmountCr', 'revisedAaAmountCr', 'agreementAmountCr', 'financialProgressCr', 'pbgAmountCr']) {
      expect(createProjectSchema.safeParse({ ...base, [field]: -1 }).success, field).toBe(false);
    }
  });

  it('accepts zero and the column maximum, rejects above it', () => {
    expect(createProjectSchema.safeParse({ ...base, aaAmountCr: 0 }).success).toBe(true);
    expect(createProjectSchema.safeParse({ ...base, aaAmountCr: MAX_CR_AMOUNT }).success).toBe(true);
    expect(createProjectSchema.safeParse({ ...base, aaAmountCr: 1e15 }).success).toBe(false);
  });

  it('caps O&M months at its numeric(5,1) column', () => {
    expect(createProjectSchema.safeParse({ ...base, omPeriodMonths: 60 }).success).toBe(true);
    expect(createProjectSchema.safeParse({ ...base, omPeriodMonths: 10_000 }).success).toBe(false);
  });

  it('rejects a javascript: geo-tagging URL and an impossible date', () => {
    expect(createProjectSchema.safeParse({ ...base, geoTaggingUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...base, agreementDate: '2026-02-31' }).success).toBe(false);
  });

  it('still turns accepted numbers into strings for the numeric columns', () => {
    const parsed = createProjectSchema.parse({ ...base, aaAmountCr: 12.5 });
    expect(parsed.aaAmountCr).toBe('12.5');
  });
});
