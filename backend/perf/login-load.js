/**
 * Performance test for POST /api/auth/login.
 *
 * ⚠️ Every request will trip the loginLimiter (5 attempts / 15 min per IP)
 * unless UPSTASH env vars are cleared. This script is for measuring the
 * PIPE — express + zod + bcrypt.compare + DB SELECT — not for real load
 * against a limited endpoint.
 *
 * Local workflow:
 *   1. Terminal A: unset UPSTASH_REDIS_REST_URL, then npm run dev.
 *      Rate limiter falls back to the no-op, so we measure the true cost
 *      of the handler.
 *   2. Terminal B: npm run perf:login
 *
 * Reads TEST_USERNAME + TEST_PASSWORD from env. These MUST exist in your
 * local DB — seed with `npm run db:seed-admin`. Never run this against
 * Render / Neon prod — the DB writes and rate limiter make that unsafe.
 */
import autocannon from 'autocannon';

const url = process.env.TARGET_URL ?? 'http://localhost:4000';
const username = process.env.TEST_USERNAME ?? 'shri';
const password = process.env.TEST_PASSWORD ?? 'ChangeMe123!';

const instance = autocannon({
  url: `${url}/api/auth/login`,
  method: 'POST',
  connections: 5,
  duration: 5,
  headers: {
    'content-type': 'application/json',
    'user-agent': 'buidco-perf/1.0 autocannon',
  },
  body: JSON.stringify({ username, password }),
});

autocannon.track(instance, { renderProgressBar: true, renderResultsTable: true });

instance.on('done', (result) => {
  const p99 = result.latency?.p99 ?? -1;
  const rps = result.requests?.average ?? 0;
  const errors = (result.errors ?? 0) + (result.timeouts ?? 0);
  const non2xx = result.non2xx ?? 0;
  process.stdout.write(
    `\nSummary: ${rps.toFixed(0)} req/s avg, p99 latency ${p99} ms, ${errors} transport error(s), ${non2xx} non-2xx (likely rate-limit 429s)\n`,
  );
});
