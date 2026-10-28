/**
 * The keep-alive ping must be inert everywhere except the host that
 * actually suspends idle instances — otherwise local development and CI
 * would fire pointless requests at a URL that does not exist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RENDER_URL = 'https://buidco.onrender.com';

/** env.ts validates process.env once at import, so each case needs a fresh
 *  module registry with the variables already in place. */
async function loadWith(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import('./keepAlive.js');
}

describe('startKeepAlive', () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...original };
  });

  it('does nothing when not running on Render', async () => {
    const { startKeepAlive } = await loadWith({ RENDER_EXTERNAL_URL: undefined, KEEP_ALIVE: 'on' });
    expect(startKeepAlive()).toBeNull();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does nothing when explicitly turned off, even on Render', async () => {
    const { startKeepAlive } = await loadWith({
      RENDER_EXTERNAL_URL: RENDER_URL,
      KEEP_ALIVE: 'off',
    });
    expect(startKeepAlive()).toBeNull();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pings its own health endpoint on an interval when on Render', async () => {
    const { startKeepAlive } = await loadWith({
      RENDER_EXTERNAL_URL: RENDER_URL,
      KEEP_ALIVE: 'on',
    });
    const handle = startKeepAlive();
    expect(handle).not.toBeNull();

    expect(fetch).not.toHaveBeenCalled(); // nothing fires immediately
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${RENDER_URL}/api/health`);

    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(3);

    handle!.stop();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(3); // stopped means stopped
  });

  it('survives a failing ping and keeps trying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const { startKeepAlive } = await loadWith({
      RENDER_EXTERNAL_URL: RENDER_URL,
      KEEP_ALIVE: 'on',
    });
    const handle = startKeepAlive();

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(2);

    handle?.stop();
  });
});
