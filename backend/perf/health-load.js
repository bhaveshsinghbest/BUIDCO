/**
 * Performance smoke test using autocannon.
 *
 * Baseline: hits GET /api/health for 10 s at 10 concurrent connections.
 * Health is a static handler — this measures the express + helmet + cors
 * pipeline overhead, NOT any DB latency.
 *
 * Usage:
 *   1. Terminal A: cd buidco-dashboard/backend && npm run dev
 *   2. Terminal B: cd buidco-dashboard/backend && npm run perf:health
 *
 * Reads TARGET_URL env var (default http://localhost:4000). Do NOT point
 * this at Render/Neon prod — the free tier will throttle or crash.
 */
import autocannon from 'autocannon';

const url = process.env.TARGET_URL ?? 'http://localhost:4000';

const instance = autocannon({
  url: `${url}/api/health`,
  connections: 10,
  duration: 10,
  pipelining: 1,
  headers: {
    'user-agent': 'buidco-perf/1.0 autocannon',
  },
});

autocannon.track(instance, { renderProgressBar: true, renderResultsTable: true });

instance.on('done', (result) => {
  const p99 = result.latency?.p99 ?? -1;
  const rps = result.requests?.average ?? 0;
  const errors = (result.errors ?? 0) + (result.timeouts ?? 0) + (result.non2xx ?? 0);
  process.stdout.write(
    `\nSummary: ${rps.toFixed(0)} req/s avg, p99 latency ${p99} ms, ${errors} error(s)\n`,
  );
  if (errors > 0) {
    process.exitCode = 1;
  }
});
