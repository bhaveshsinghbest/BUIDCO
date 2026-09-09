/**
 * Inactivity-based session timeout (bhaveshTask.md Task 3).
 *
 * Signs the user out after a full hour with no interaction, and only then.
 * This is deliberately the ONLY client-side rule that ends a session — the
 * reauth interceptor in baseQuery.ts now treats a failed token refresh as a
 * transport problem unless the server explicitly answers 401/403, so a
 * network blip or a cold-starting API no longer looks like a logout.
 *
 * Two implementation choices worth keeping:
 *
 * 1. We compare wall-clock timestamps on a poll rather than arming a single
 *    `setTimeout(ONE_HOUR)`. Background tabs get their timers throttled and a
 *    suspended laptop stops them entirely, so a timeout scheduled an hour out
 *    fires late and unpredictably. A stored timestamp is correct across sleep,
 *    throttling and clock drift alike.
 *
 * 2. Last-activity lives in localStorage, so every tab shares one timer.
 *    Working in one tab keeps the others alive, and whichever tab notices the
 *    expiry first ends the session for all of them. Without this, a second tab
 *    left open in the background would sign you out of the tab you were using.
 *
 * Regaining visibility is intentionally NOT treated as activity: coming back
 * to a tab after ninety minutes must log you out, not reset the clock. It does
 * trigger an immediate re-check so an expired session is caught on return
 * instead of up to one poll interval later.
 */

import { useEffect, useRef } from 'react';

export const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;

/** How often we compare now() against last-activity. */
const CHECK_INTERVAL_MS = 30_000;

/**
 * Activity is noisy (pointermove alone can fire hundreds of times a second),
 * and every event would otherwise be a localStorage write. One write per
 * 30s is far below the 1-hour limit, so throttling costs no accuracy.
 */
const WRITE_THROTTLE_MS = 30_000;

const LS_LAST_ACTIVITY = 'buidco_last_activity_v1';
const SS_LOGOUT_REASON = 'buidco_logout_reason';

/**
 * Events that count as a person being present. `scroll` and `pointermove`
 * are passive listeners so they never delay rendering.
 */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const;

function readStoredActivity(): number | null {
  try {
    const raw = localStorage.getItem(LS_LAST_ACTIVITY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // private mode / storage disabled — in-memory fallback covers us.
  }
}

function writeStoredActivity(at: number): void {
  try {
    localStorage.setItem(LS_LAST_ACTIVITY, String(at));
  } catch {
    /* quota or storage disabled — the in-memory ref still drives this tab. */
  }
}

/** Record why the session ended so the login screen can explain it. */
export function setLogoutReason(reason: 'inactivity'): void {
  try {
    sessionStorage.setItem(SS_LOGOUT_REASON, reason);
  } catch {
    /* non-fatal: the user just sees the plain login screen. */
  }
}

/** Read and clear the pending logout reason, if any. */
export function takeLogoutReason(): string | null {
  try {
    const v = sessionStorage.getItem(SS_LOGOUT_REASON);
    if (v) sessionStorage.removeItem(SS_LOGOUT_REASON);
    return v;
  } catch {
    return null;
  }
}

/** Clear the shared activity clock — call on an explicit sign-in or sign-out. */
export function resetActivityClock(): void {
  try {
    localStorage.removeItem(LS_LAST_ACTIVITY);
  } catch {
    /* ignore */
  }
}

export interface InactivityOptions {
  /** Only arm the timer while a session actually exists. */
  enabled: boolean;
  /** Invoked once when the idle limit is crossed. */
  onTimeout: () => void;
  /** Override for tests. */
  limitMs?: number;
  checkIntervalMs?: number;
}

export function useInactivityLogout({
  enabled,
  onTimeout,
  limitMs = INACTIVITY_LIMIT_MS,
  checkIntervalMs = CHECK_INTERVAL_MS,
}: InactivityOptions): void {
  // Keep the callback in a ref so re-renders don't tear down the listeners.
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const lastActivityRef = useRef<number>(Date.now());
  const lastWriteRef = useRef<number>(0);
  const firedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;

    firedRef.current = false;

    // Adopt an existing cross-tab clock so opening a second tab doesn't
    // silently extend an already-idle session.
    const stored = readStoredActivity();
    const startedAt = stored ?? Date.now();
    lastActivityRef.current = startedAt;
    if (stored === null) writeStoredActivity(startedAt);

    const markActive = (): void => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastWriteRef.current >= WRITE_THROTTLE_MS) {
        lastWriteRef.current = now;
        writeStoredActivity(now);
      }
    };

    const check = (): void => {
      if (firedRef.current) return;
      // Another tab may have registered activity more recently than this one.
      const newest = Math.max(lastActivityRef.current, readStoredActivity() ?? 0);
      if (Date.now() - newest >= limitMs) {
        firedRef.current = true;
        setLogoutReason('inactivity');
        resetActivityClock();
        onTimeoutRef.current();
      }
    };

    const onVisibility = (): void => {
      // Returning to the tab is not activity, but it is the right moment to
      // notice a session that expired while the tab was hidden.
      if (document.visibilityState === 'visible') check();
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, markActive, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(check, checkIntervalMs);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, markActive);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [enabled, limitMs, checkIntervalMs]);
}
