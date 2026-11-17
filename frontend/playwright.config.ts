import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for BUIDCO frontend E2E.
 *
 * login.spec mocks its /api/* traffic; the *.audit.spec suites drive a real
 * local API and database. Development stack only — never a deployed server.
 *
 * Environment:
 *   DEMO_ACCOUNT_PASSWORD  password of the seeded demo_* accounts (required by
 *                          the audit suites; see e2e/demoCredentials.ts)
 *   E2E_BASE_URL           run against an already-running frontend instead of
 *                          booting Vite on :5173, e.g. a disposable test stack
 *                          on another port (then also set AUDIT_APP_URL)
 * The API it talks to must run with NODE_ENV set (`npm run dev` does this).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // These suites drive the real dev server + database, so a long serial run
  // can hit transient stalls. One retry locally keeps that from masking as a
  // product failure; CI keeps its own higher count.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  /**
   * Chromium runs everything by default. Firefox and WebKit (Safari's engine)
   * are opt-in via `--project=firefox` / `--project=webkit` and are scoped to
   * login.spec, the one suite that mocks its own API traffic — the data-driven
   * suites hammer a single dev server and running them three times over adds
   * flakiness without testing anything browser-specific.
   *
   * Edge and Chrome proper share Chromium's engine, so `--project=edge`
   * exercises the real Edge channel when it is installed locally.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /login\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /login\.spec\.ts/,
    },
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
      testMatch: /login\.spec\.ts/,
    },
  ],
  // With E2E_BASE_URL the caller has started the stack; otherwise boot Vite.
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: 'ignore' as const,
          stderr: 'pipe' as const,
        },
      }),
});
