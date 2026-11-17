import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './safeUrl';

describe('safeHttpUrl', () => {
  it.each(['https://example.org/a.jpg', 'http://maps.google.com/?q=1,2', '  HTTPS://EXAMPLE.ORG  '])('keeps %j', (u) => {
    expect(safeHttpUrl(u)).toBe(u.trim());
  });

  it.each(['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '//evil.example', 'ftp://x', '', null, undefined])(
    'drops %j',
    (u) => {
      expect(safeHttpUrl(u)).toBeNull();
    },
  );

  it('keeps a signed link to a photo stored on this server (S-21)', () => {
    const link = '/api/photo-files/7?u=42&exp=1794830400&sig=Abc-_123xyz';
    expect(safeHttpUrl(link)).toBe(link);
  });

  it.each([
    '/api/projects/abc',
    '/api/photo-files/7',
    '/api/photo-files/7?u=42&exp=1&sig=a"onerror=alert(1)',
    '/../api/photo-files/7?u=1&exp=1&sig=a',
  ])('drops other relative paths: %j', (u) => {
    expect(safeHttpUrl(u)).toBeNull();
  });
});
