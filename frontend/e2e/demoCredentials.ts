/**
 * Password of the demo_* accounts the end-to-end suites sign in with
 * (finding S-02).
 *
 * It is read from the environment and never written in a spec: the value
 * that used to be hardcoded here was published with the repository, and the
 * same accounts existed on internet-facing databases. Set it to the
 * DEMO_ACCOUNT_PASSWORD the local database was seeded with:
 *
 *   backend:  DEMO_ACCOUNT_PASSWORD=<12+ chars> npm run db:seed-demo-roles
 *   frontend: DEMO_ACCOUNT_PASSWORD=<same value> npx playwright test ...
 *
 * These suites are for a local development stack only — the API refuses
 * demo_* sign-ins in production.
 */
export function demoPassword(): string {
  const value = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!value) {
    throw new Error(
      'Set DEMO_ACCOUNT_PASSWORD to the password the demo_* accounts were seeded with (npm run db:seed-demo-roles).',
    );
  }
  return value;
}
