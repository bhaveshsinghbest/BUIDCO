/**
 * Tests for the 1-hour inactivity timeout.
 *
 * Time is faked, so these assert the real thresholds (a full hour) without
 * waiting for one. The `limitMs` override exists for readability, not to
 * dodge the real constant — the last test pins INACTIVITY_LIMIT_MS itself.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INACTIVITY_LIMIT_MS,
  takeLogoutReason,
  useInactivityLogout,
} from './useInactivityLogout';

const HOUR = 60 * 60 * 1000;

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Simulate a real interaction the hook listens for. */
function interact(): void {
  act(() => {
    window.dispatchEvent(new Event('pointerdown'));
  });
}

describe('useInactivityLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not log out before the limit', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout({ enabled: true, onTimeout, limitMs: HOUR }));

    advance(HOUR - 60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('logs out after the limit with no activity', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout({ enabled: true, onTimeout, limitMs: HOUR }));

    advance(HOUR + 60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('activity resets the timer', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout({ enabled: true, onTimeout, limitMs: HOUR }));

    // Stay busy across a span far longer than the limit.
    for (let i = 0; i < 8; i++) {
      advance(HOUR / 2);
      interact();
    }
    expect(onTimeout).not.toHaveBeenCalled();

    // Then go quiet.
    advance(HOUR + 60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('fires only once even if the interval keeps ticking', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout({ enabled: true, onTimeout, limitMs: HOUR }));

    advance(HOUR * 3);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled (signed out)', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout({ enabled: false, onTimeout, limitMs: HOUR }));

    advance(HOUR * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('records a reason the login screen can show', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout({ enabled: true, onTimeout, limitMs: HOUR }));

    advance(HOUR + 60_000);
    expect(takeLogoutReason()).toBe('inactivity');
    // Reading it clears it, so a later reload doesn't re-show the banner.
    expect(takeLogoutReason()).toBeNull();
  });

  it('adopts an existing cross-tab clock instead of extending the session', () => {
    // Another tab last saw activity 59 minutes ago.
    localStorage.setItem('buidco_last_activity_v1', String(Date.now() - (HOUR - 60_000)));

    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout({ enabled: true, onTimeout, limitMs: HOUR }));

    // A newly-opened tab must not reset that clock — 2 more minutes expires it.
    advance(2 * 60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('another tab’s activity keeps this tab alive', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLogout({ enabled: true, onTimeout, limitMs: HOUR }));

    advance(HOUR - 60_000);
    // A sibling tab writes fresh activity to the shared clock.
    localStorage.setItem('buidco_last_activity_v1', String(Date.now()));
    advance(2 * 60_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('uses a 1-hour limit by default', () => {
    expect(INACTIVITY_LIMIT_MS).toBe(HOUR);
  });
});
