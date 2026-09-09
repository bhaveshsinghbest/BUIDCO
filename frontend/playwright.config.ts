import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for BUIDCO frontend E2E.
 *
 * Every spec mocks the /api/* traffic via page.route(), so this suite does
 * NOT need the Render/Neon backend to be up — only the Vite dev server.
 * `webServer` boots Vite automatically and Playwright waits for it.
 */
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
    baseURL: 'http://localhost:5173',
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
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
