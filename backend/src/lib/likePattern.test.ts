import { describe, expect, it } from 'vitest';
import { containsPattern, escapeLike } from './likePattern.js';

describe('escapeLike', () => {
  it.each([
    ['patna', 'patna'],
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['\\', '\\\\'],
    ['%_\\', '\\%\\_\\\\'],
    ['पटना', 'पटना'],
  ])('%j → %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe('containsPattern', () => {
  it('wraps the escaped term in wildcards', () => {
    expect(containsPattern('Gaya')).toBe('%Gaya%');
    expect(containsPattern('%')).toBe('%\\%%');
  });

  it('never ends with a lone escape character', () => {
    for (const t of ['\\', 'x\\', '\\\\\\']) {
      const p = containsPattern(t);
      const trailing = p.slice(0, -1).match(/\\*$/)?.[0].length ?? 0;
      expect(trailing % 2).toBe(0);
    }
  });
});
