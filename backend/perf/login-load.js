/**
 * Performance test for POST /api/auth/login.
 *
 * ⚠️ Development only. Every request counts against the login limits (per
 * account and per IP) wherever rate limiting is on. This script measures
 * the PIPE — express + zod + bcrypt.compare + DB SELECT — not real load
 * against a limited endpoint.
 *
 * Local workflow:
 *   1. Terminal A: npm run dev (development: rate limiting is off unless
 *      RATE_LIMIT_STORE is set), so we measure the true cost of the handler.
 *   2. Terminal B: TEST_USERNAME=... TEST_PASSWORD=... npm run perf:login
 *
 * Credentials come from TEST_USERNAME + TEST_PASSWORD only (finding S-32):
 * there is no fallback, so a published default can never be tried against a
 * server. Use a throwaway account on your local database — never a real
 * account, and never a deployed environment.
 */
import autocannon from 'autocannon';

const url = process.env.TARGET_URL ?? 'http://localhost:4000';
const username = process.env.TEST_USERNAME;
const password = process.env.TEST_PASSWORD;

if (!username || !password) {
  process.stderr.write('Set TEST_USERNAME and TEST_PASSWORD (a throwaway local account) before running perf:login.\n');
  process.exit(1);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  process.stderr.write(`Refusing to load-test ${url}: perf:login is for a local development server only.\n`);
  process.exit(1);
}

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
