/**
 * Keeps the API awake on hosts that suspend idle instances.
 *
 * Why this exists
 * ---------------
 * The service runs on Render's free tier, which spins the instance down
 * after roughly 15 minutes without inbound traffic. The next request then
 * pays a full cold boot — measured repeatedly on this deployment at 32.7s,
 * 33.2s, 42.9s, 43.1s and 56.1s. The SPA reaches the API through a Vercel
 * rewrite whose proxy gives up well before that and returns an HTML gateway
 * page, so the browser gets something it cannot parse as JSON and the user
 * is told the server "sent an unexpected response". The login screen now
 * retries around it (see frontend LoginPage), but a two-minute sign-in is a
 * symptom being managed, not a problem being solved.
 *
 * A request the instance makes to its own public URL arrives back as
 * ordinary inbound traffic, so the idle timer never reaches 15 minutes and
 * the instance never sleeps. Render publishes that URL to the process as
 * RENDER_EXTERNAL_URL, so nothing needs configuring.
 *
 * Scope and limits — worth knowing before relying on it
 * -----------------------------------------------------
 *  - It only prevents sleep; it cannot wake an instance that is already
 *    asleep, because a sleeping instance runs no timers. After a deploy or
 *    a crash the first visitor still pays one cold boot.
 *  - Render's free tier allows 750 instance-hours a month and a month is at
 *    most 744 hours, so one always-on service still fits.
 *  - This is a workaround for a free-tier constraint. On a paid always-on
 *    plan it is pointless: set KEEP_ALIVE=off and delete the call.
 */
import { env } from '../env.js';

/** Comfortably inside the ~15 minute idle window, without being chatty. */
const PING_INTERVAL_MS = 10 * 60 * 1000;

/** A ping that hangs forever would stack up behind the next one. */
const PING_TIMEOUT_MS = 30_000;

export interface KeepAlive {
  stop: () => void;
}

/**
 * Starts the self-ping when running on a host that suspends idle instances.
 *
 * Returns null when it does not apply — locally, in tests, and on any host
 * that is not Render — so callers can log whether it actually engaged.
 */
export function startKeepAlive(): KeepAlive | null {
  if (env.KEEP_ALIVE === 'off') return null;

  const base = env.RENDER_EXTERNAL_URL;
  // No RENDER_EXTERNAL_URL means we are not on a host that sleeps. Pinging
  // localhost would be pure noise.
  if (!base) return null;

  const url = `${base.replace(/\/$/, '')}/api/health`;

  const ping = async (): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
      await fetch(url, { method: 'GET', signal: controller.signal });
    } catch (err) {
      // Deliberately swallowed. A failed keep-alive ping is not a reason to
      // disturb a healthy server; the next tick will try again. Logged at a
      // low key so a persistent failure is still discoverable.
      const reason = err instanceof Error ? err.message : String(err);
      process.stderr.write(`keep-alive ping failed: ${reason}\n`);
    } finally {
      clearTimeout(timer);
    }
  };

  const interval = setInterval(() => void ping(), PING_INTERVAL_MS);
  // Never hold the process open on shutdown for the sake of a ping.
  interval.unref();

  return {
    stop: () => clearInterval(interval),
  };
}
