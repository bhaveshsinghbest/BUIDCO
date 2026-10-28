/**
 * The in-memory fallback is what stands between a misconfigured deployment
 * and an unthrottled login endpoint, so it gets tested like the real thing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryLimiter } from './rateLimit.js';

describe('createInMemoryLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows exactly the budget, then refuses', async () => {
    const limit = createInMemoryLimiter(3, 60_000);
    expect((await limit('ip-1')).success).toBe(true);
    expect((await limit('ip-1')).success).toBe(true);
    expect((await limit('ip-1')).success).toBe(true);
    expect((await limit('ip-1')).success).toBe(false);
    expect((await limit('ip-1')).success).toBe(false);
  });

  it('reports remaining budget', async () => {
    const limit = createInMemoryLimiter(3, 60_000);
    expect((await limit('ip-1')).remaining).toBe(2);
    expect((await limit('ip-1')).remaining).toBe(1);
    expect((await limit('ip-1')).remaining).toBe(0);
    expect((await limit('ip-1')).remaining).toBe(0);
  });

  it('keeps one key from spending another key budget', async () => {
    const limit = createInMemoryLimiter(2, 60_000);
    await limit('ip-1');
    await limit('ip-1');
    expect((await limit('ip-1')).success).toBe(false);
    // A different caller is unaffected.
    expect((await limit('ip-2')).success).toBe(true);
  });

  it('lets the window slide — old attempts stop counting', async () => {
    const limit = createInMemoryLimiter(2, 60_000);
    await limit('ip-1');
    await limit('ip-1');
    expect((await limit('ip-1')).success).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect((await limit('ip-1')).success).toBe(true);
  });

  it('counts refused attempts against the window, so retries are not free', async () => {
    // Matches Upstash's sliding window: every call consumes budget whether
    // or not it was allowed. If refusals were free an attacker could keep
    // hammering the endpoint at no cost, which defeats the point.
    const limit = createInMemoryLimiter(2, 60_000);
    await limit('ip-1');
    await limit('ip-1');
    expect((await limit('ip-1')).success).toBe(false);

    vi.advanceTimersByTime(61_000); // all three attempts age out together
    expect((await limit('ip-1')).success).toBe(true);
  });

  it('slides partially — only the attempts that aged out free up budget', async () => {
    const limit = createInMemoryLimiter(2, 60_000);
    await limit('ip-1'); // t=0
    vi.advanceTimersByTime(40_000);
    await limit('ip-1'); // t=40s — budget now spent

    // t=61s: the t=0 attempt has aged out, the t=40s one has not, so
    // exactly one slot frees up rather than the whole window resetting.
    vi.advanceTimersByTime(21_000);
    expect((await limit('ip-1')).success).toBe(true);
    expect((await limit('ip-1')).success).toBe(false);
  });

  it('does not grow unboundedly — stale keys are swept', async () => {
    const limit = createInMemoryLimiter(1, 1_000);
    for (let i = 0; i < 50; i += 1) await limit(`ip-${i}`);
    // Push past the window so every key is stale, then trigger the sweep.
    vi.advanceTimersByTime(5_000);
    await limit('trigger-sweep');
    // The swept keys must have released their budget.
    expect((await limit('ip-0')).success).toBe(true);
  });

  it('refuses the 21st login attempt at the real configured budget', async () => {
    const limit = createInMemoryLimiter(20, 15 * 60_000);
    for (let i = 0; i < 20; i += 1) {
      expect((await limit('attacker')).success, `attempt ${i + 1} should be allowed`).toBe(true);
    }
    expect((await limit('attacker')).success, 'attempt 21 must be refused').toBe(false);
  });
});
