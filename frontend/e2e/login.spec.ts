/**
 * E2E login flow tests.
 *
 * All /api/auth/* traffic is mocked with page.route(), so this suite has
 * NO backend / DB dependency. It exercises the real UI — routing, form
 * submission, RTK Query wiring, error banners, PD two-step handshake.
 */
import { expect, test } from '@playwright/test';

const REFRESH_URL_RE = /\/api\/auth\/refresh$/;
const LOGIN_URL_RE = /\/api\/auth\/login$/;
const ME_URL_RE = /\/api\/auth\/me$/;
const HEALTH_URL_RE = /\/api\/health$/;

/**
 * LoginPage fires a fire-and-forget /api/health on mount to wake the API
 * before the user submits (Render free-tier cold start). Stub it so this
 * suite keeps its "no backend dependency" property.
 */
async function mockHealth(page: import('@playwright/test').Page): Promise<void> {
  await page.route(HEALTH_URL_RE, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    });
  });
}

async function mockRefresh401(page: import('@playwright/test').Page): Promise<void> {
  // App.tsx mounts → fires refresh — mock a 401 so we land on /login cleanly.
  await page.route(REFRESH_URL_RE, (route) => {
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NO_REFRESH_COOKIE', message: 'x' } }),
    });
  });
}

async function mockMe(page: import('@playwright/test').Page, user: unknown): Promise<void> {
  await page.route(ME_URL_RE, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    });
  });
}

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await mockRefresh401(page);
    await mockHealth(page);
  });

  test('renders the credentials form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Welcome to BUIDCo Portal/i })).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('surfaces "Invalid username or password" on 401', async ({ page }) => {
    await page.route(LOGIN_URL_RE, (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
        }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(/Invalid username or password/i);
    // Still on login page — no redirect.
    await expect(page).toHaveURL(/\/login$/);
  });

  test('surfaces the rate-limit message on 429', async ({ page }) => {
    await page.route(LOGIN_URL_RE, (route) => {
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'RATE_LIMITED', message: 'Too many requests' },
        }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('anything');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(/Too many attempts/i);
  });

  /**
   * Transport failures must NOT read as a credential rejection. The API is a
   * separate service behind a proxy, so a cold start or gateway error arrives
   * with no parseable body — previously indistinguishable from a wrong
   * password, which sent users off retyping correct credentials.
   */
  test('a network failure says the server is unreachable, not "invalid password"', async ({ page }) => {
    await page.route(LOGIN_URL_RE, (route) => route.abort('failed'));

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('correct-pw');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(/could not reach the server/i);
    await expect(page.getByRole('alert')).not.toHaveText(/invalid username or password/i);
  });

  /**
   * A gateway error is what a cold-starting Render instance looks like from
   * the browser, so the page must treat it as "still booting" and retry
   * rather than reporting a failure the user cannot act on.
   */
  test('a 504 gateway error shows a waking-up status, not an error', async ({ page }) => {
    await page.route(LOGIN_URL_RE, (route) => {
      route.fulfill({
        status: 504,
        contentType: 'text/html',
        body: '<html><body>Gateway Timeout</body></html>',
      });
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('correct-pw');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('status')).toHaveText(/waking the server/i);
    // The red error box must stay away while we are still retrying.
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  /**
   * The point of the retry: the first request after an idle period dies in
   * the proxy, but it woke the origin, so the next one succeeds. The user
   * should end up signed in without touching anything.
   */
  /**
   * Render answers 429 with a text/plain body when it is rate-limiting
   * requests that wake a hibernating instance. fetchBaseQuery cannot parse
   * that as JSON, so it surfaces as PARSING_ERROR with originalStatus 429 —
   * which the cold-start retry used to treat as 'still booting' and retry
   * six times, hammering the limiter that was already refusing us.
   */
  test('a hibernate rate-limit 429 is not retried and is explained honestly', async ({ page }) => {
    let calls = 0;
    await page.route(LOGIN_URL_RE, (route) => {
      calls += 1;
      route.fulfill({
        status: 429,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'x-render-routing': 'hibernate-rate-limited' },
        body: 'Too Many Requests',
      });
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('correct-pw');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Explained as a waking server, not as the user's fault.
    await expect(page.getByRole('alert')).toHaveText(/starting up and is briefly refusing/i);
    await expect(page.getByRole('alert')).not.toHaveText(/too many attempts/i);

    // And critically: tried exactly once.
    await page.waitForTimeout(8000);
    expect(calls, 'a 429 must never be retried').toBe(1);
  });

  test('a cold start that recovers signs the user in without a retry click', async ({ page }) => {
    const mdUser = {
      userId: 1,
      username: 'shri',
      role: 'MD',
      fullName: 'Test MD',
      canCreateProjects: true,
      canUpdateProjects: true,
      canDeleteProjects: true,
      canViewProjects: true,
    };
    let calls = 0;
    // Intercept the whole API, not just /auth/login. Once the retry
    // succeeds the app lands on the dashboard and fires its own queries; if
    // those reach a real backend they answer 401 to this fake token, the
    // session is torn down exactly as designed, and the user is bounced
    // back to /login — which would look like the retry failing. Mocking
    // everything keeps this test about the cold-start retry and makes it
    // independent of whether a backend happens to be running.
    //
    // Matched on pathname rather than a loose substring: the app's own
    // source modules live under /src/app/api/, so a regex like /\/api\//
    // would intercept those too and serve JSON in place of JavaScript.
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => {
        const url = route.request().url();

        if (LOGIN_URL_RE.test(url)) {
          calls += 1;
          if (calls === 1) {
            // First attempt: the gateway gives up on the booting origin.
            route.fulfill({
              status: 504,
              contentType: 'text/html',
              body: '<html><body>Gateway Timeout</body></html>',
            });
            return;
          }
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              user: mdUser,
              accessToken: 'test-token',
              accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
            }),
          });
          return;
        }

        // App.tsx fires /auth/refresh on mount to restore a session from the
        // refresh cookie. This test starts signed out, so it must be refused
        // — answering 200 here would make the app believe it is already
        // authenticated and navigate straight off the login page.
        if (/\/api\/auth\/refresh$/.test(url)) {
          route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'no session' } }),
          });
          return;
        }

        // Everything the dashboard asks for afterwards: authenticated, empty.
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0 }),
        });
      },
    );

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('correct-pw');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('status')).toHaveText(/waking the server/i);
    // First backoff is 5s, so allow for it plus the round trip.
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 20_000 });
    expect(calls).toBe(2);
  });

  test('successful MD login redirects away from /login', async ({ page }) => {
    const mdUser = {
      userId: 1,
      username: 'shri',
      role: 'MD',
      fullName: 'Shri',
      canCreateProjects: true,
      canUpdateProjects: true,
      canDeleteProjects: true,
      canViewProjects: true,
    };
    await page.route(LOGIN_URL_RE, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'set-cookie': 'buidco_refresh=stub; Path=/api/auth; HttpOnly' },
        body: JSON.stringify({
          user: mdUser,
          accessToken: 'stub.access.jwt',
          accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        }),
      });
    });
    await mockMe(page, mdUser);

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('correct-pw');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Router navigates to '/' after setCredentials fires.
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('PD two-step: credentials submit → division picker appears', async ({ page }) => {
    await page.route(LOGIN_URL_RE, (route, request) => {
      const body = request.postDataJSON() as { divisionId?: number };
      if (body.divisionId === undefined) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            needsDivision: true,
            divisions: [
              { divisionId: 10, divisionName: 'Patna Municipal' },
              { divisionId: 20, divisionName: 'Gaya' },
            ],
          }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              userId: 7,
              username: 'pd_kumar',
              role: 'PD',
              fullName: 'PD Kumar',
              canCreateProjects: false,
              canUpdateProjects: false,
              canDeleteProjects: false,
              canViewProjects: true,
              divisionId: body.divisionId,
            },
            accessToken: 'stub.access.jwt',
            accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          }),
        });
      }
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('pd_kumar');
    await page.getByLabel('Password').fill('pd-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Step 2 UI renders.
    await expect(page.getByText(/Signed in as pd_kumar/i)).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Division' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /← Back/i })).toBeVisible();
  });

  /**
   * The regression this locks down: with nothing listening on the API port,
   * Vite's proxy answers /api/* with 500 and an EMPTY text/plain body.
   * fetchBaseQuery turns an empty body into `data: null`, so the error
   * matched no branch — not 401, not 429, not PARSING_ERROR, not
   * FETCH_ERROR, not 502/503/504 — and landed on the generic
   * "Sign-in failed. Please try again." A correct password read as a
   * rejected one, which is the single most misleading thing this page can
   * say.
   */
  test('a bodyless 500 from the proxy says the API is unreachable, not "sign-in failed"', async ({
    page,
  }) => {
    await page.route(LOGIN_URL_RE, (route) => {
      route.fulfill({ status: 500, contentType: 'text/plain', body: '' });
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('correct-pw');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText(/could not reach the api server/i);
    await expect(alert).not.toHaveText(/sign-in failed/i);
    await expect(alert).not.toHaveText(/invalid username or password/i);
  });

  /**
   * The counterpart: the new branch keys on the ABSENCE of an API error
   * envelope, so a genuine 500 from the API itself must still surface the
   * API's own message rather than being relabelled "unreachable".
   */
  test('a real API 500 still surfaces the API message', async ({ page }) => {
    await page.route(LOGIN_URL_RE, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Database unavailable' } }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill('shri');
    await page.getByLabel('Password').fill('correct-pw');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText(/Database unavailable/i);
    await expect(alert).not.toHaveText(/could not reach/i);
  });

  /**
   * Prevention rather than a better epitaph: the mount probe already runs to
   * warm the instance, so it can also report a dead API before the user has
   * typed anything at all.
   */
  test('an unreachable API is announced before any password is typed', async ({ page }) => {
    await page.route(HEALTH_URL_RE, (route) => {
      route.fulfill({ status: 500, contentType: 'text/plain', body: '' });
    });

    await page.goto('/login');

    const notice = page.getByRole('status');
    await expect(notice).toHaveText(/API server is not responding/i);
    await expect(notice).toHaveText(/not a problem with your credentials/i);
    // Nothing was typed to earn that message.
    await expect(page.getByLabel('Password')).toHaveValue('');
  });

  test('the unreachable notice clears itself once the API comes up', async ({ page }) => {
    let healthy = false;
    await page.route(HEALTH_URL_RE, (route) => {
      if (healthy) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' }),
        });
        return;
      }
      route.fulfill({ status: 500, contentType: 'text/plain', body: '' });
    });

    await page.goto('/login');
    await expect(page.getByRole('status')).toHaveText(/API server is not responding/i);

    // The backend starts. The page re-probes every 5s, so the notice must go
    // away on its own — needing a reload to clear it would just be a second
    // confusing state.
    healthy = true;
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 20_000 });
  });
});
