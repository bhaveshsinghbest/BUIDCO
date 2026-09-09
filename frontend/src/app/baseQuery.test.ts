// @vitest-environment node
/**
 * Integration test for the reauth interceptor.
 *
 * We swap `globalThis.fetch` with a scripted vi.fn that returns whatever
 * we tell it, in order, per call. Then trigger a query on a store wired
 * with the real api slice + auth reducer, and assert that:
 *   - a 401 triggers exactly one call to /auth/refresh
 *   - the store receives setCredentials after a successful refresh
 *   - the original request is retried and its result reaches the query state
 *   - the refresh call is de-duplicated when two 401s land simultaneously
 */

import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { __resetRefreshInFlight } from './baseQuery';
import { authApi } from './api/authApi';
import { kpisApi } from './api/kpisApi';
import { authReducer, clearCredentials, setCredentials } from '../features/auth/authSlice';

// The kpisApi import must actually run — TS may drop unused ones otherwise.
void authApi;
void kpisApi;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** RTK Query calls fetch(request, init) — request is a Request object, not a URL string. */
function urlOf(call: unknown[]): string {
  const arg = call[0];
  if (typeof arg === 'string') return arg;
  if (arg instanceof Request) return arg.url;
  if (arg instanceof URL) return arg.toString();
  return String(arg);
}

/** Return only the fetch calls that hit a given URL substring. */
function callsMatching(mock: ReturnType<typeof vi.fn>, needle: string): unknown[][] {
  return mock.mock.calls.filter((c) => urlOf(c as unknown[]).includes(needle));
}

function makeStore(): ReturnType<
  typeof configureStore<{ auth: ReturnType<typeof authReducer>; api: ReturnType<typeof api.reducer> }>
> {
  const store = configureStore({
    reducer: { auth: authReducer, [api.reducerPath]: api.reducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
  setupListeners(store.dispatch);
  return store;
}

describe('baseQueryWithReauth', () => {
  beforeEach(() => {
    __resetRefreshInFlight();
  });

  it('refreshes on 401, retries, and dispatches setCredentials', async () => {
    const store = makeStore();
    store.dispatch(
      setCredentials({
        user: { userId: 1, username: 'shri', role: 'MD', fullName: 'Shri', canCreateProjects: true, canUpdateProjects: true, canDeleteProjects: true, canViewProjects: true },
        accessToken: 'expired-token',
        accessTokenExpiresAt: '2026-07-04T00:00:00.000Z',
      }),
    );

    const fetchMock = vi
      .fn()
      // 1) first attempt → 401
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }))
      // 2) /auth/refresh → 200 with a new token
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user: { userId: 1, username: 'shri', role: 'MD', fullName: 'Shri', canCreateProjects: true, canUpdateProjects: true, canDeleteProjects: true, canViewProjects: true },
          accessToken: 'fresh-token',
          accessTokenExpiresAt: '2026-07-04T01:00:00.000Z',
        }),
      )
      // 3) retry of original → 200
      .mockResolvedValueOnce(jsonResponse(200, { total: 42, completed: 12, inProgress: 20, delayed: 0, onHold: 0, notStarted: 10, totalAaCr: 0, totalAgreementCr: 0, totalFinancialCr: 0, avgPhysicalPct: 60, avgFinancialPct: 40, financialUtilisationPct: 0 }));

    vi.stubGlobal('fetch', fetchMock);

    const data = await store.dispatch(kpisApi.endpoints.getOverviewKpis.initiate()).unwrap();
    expect(data.total).toBe(42);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((c: unknown[]) => urlOf(c));
    expect(urls[0]).toContain('kpis/overview');
    expect(urls[1]).toContain('auth/refresh');
    expect(urls[2]).toContain('kpis/overview');

    // Refresh call must carry Content-Type: application/json (CSRF-lite check).
    const refreshReq = fetchMock.mock.calls[1]?.[0] as Request;
    expect(refreshReq.method).toBe('POST');
    expect(refreshReq.headers.get('Content-Type')).toBe('application/json');

    // Retry must use the freshly-issued token.
    const retryReq = fetchMock.mock.calls[2]?.[0] as Request;
    expect(retryReq.headers.get('Authorization')).toBe('Bearer fresh-token');

    expect(store.getState().auth.accessToken).toBe('fresh-token');
    expect(store.getState().auth.status).toBe('in');

    vi.unstubAllGlobals();
  });

  it('clears credentials when refresh also fails', async () => {
    const store = makeStore();
    store.dispatch(
      setCredentials({
        user: { userId: 1, username: 'shri', role: 'MD', fullName: 'Shri', canCreateProjects: true, canUpdateProjects: true, canDeleteProjects: true, canViewProjects: true },
        accessToken: 'expired-token',
        accessTokenExpiresAt: '2026-07-04T00:00:00.000Z',
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'NO_REFRESH_COOKIE', message: 'x' } }));
    vi.stubGlobal('fetch', fetchMock);

    await store.dispatch(kpisApi.endpoints.getOverviewKpis.initiate());

    expect(store.getState().auth.status).toBe('out');
    expect(store.getState().auth.accessToken).toBeNull();

    vi.unstubAllGlobals();
  });

  /**
   * Regression for the "logged out while actively working" report.
   *
   * A refresh that fails for a TRANSPORT reason says nothing about whether
   * the session is still valid — the refresh cookie is very likely fine and
   * the request simply never arrived. Signing the user out here is what
   * turned every network blip and every cold start into a surprise logout.
   * Only an explicit 401/403 from the server may end the session.
   */
  it('does NOT clear credentials when refresh fails with a network error', async () => {
    const store = makeStore();
    store.dispatch(
      setCredentials({
        user: { userId: 1, username: 'shri', role: 'MD', fullName: 'Shri', canCreateProjects: true, canUpdateProjects: true, canDeleteProjects: true, canViewProjects: true },
        accessToken: 'expired-token',
        accessTokenExpiresAt: '2026-07-04T00:00:00.000Z',
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }))
      // /auth/refresh never lands — connection failure, not a rejection.
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await store.dispatch(kpisApi.endpoints.getOverviewKpis.initiate());

    expect(store.getState().auth.status).toBe('in');
    expect(store.getState().auth.accessToken).toBe('expired-token');

    vi.unstubAllGlobals();
  });

  it('does NOT clear credentials when refresh fails with a 503', async () => {
    const store = makeStore();
    store.dispatch(
      setCredentials({
        user: { userId: 1, username: 'shri', role: 'MD', fullName: 'Shri', canCreateProjects: true, canUpdateProjects: true, canDeleteProjects: true, canViewProjects: true },
        accessToken: 'expired-token',
        accessTokenExpiresAt: '2026-07-04T00:00:00.000Z',
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }))
      .mockResolvedValueOnce(jsonResponse(503, { error: { code: 'UNAVAILABLE', message: 'waking' } }));
    vi.stubGlobal('fetch', fetchMock);

    await store.dispatch(kpisApi.endpoints.getOverviewKpis.initiate());

    expect(store.getState().auth.status).toBe('in');

    vi.unstubAllGlobals();
  });

  it('de-duplicates refresh across concurrent 401s', async () => {
    const store = makeStore();
    store.dispatch(
      setCredentials({
        user: { userId: 1, username: 'shri', role: 'MD', fullName: 'Shri', canCreateProjects: true, canUpdateProjects: true, canDeleteProjects: true, canViewProjects: true },
        accessToken: 'expired-token',
        accessTokenExpiresAt: '2026-07-04T00:00:00.000Z',
      }),
    );

    let refreshResolve: (v: Response) => void = () => {};
    const refreshPromise = new Promise<Response>((res) => {
      refreshResolve = res;
    });

    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === 'string' ? req : req.url;
      if (url.includes('auth/refresh')) return refreshPromise;
      if (url.includes('kpis/')) {
        return Promise.resolve(
          jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    // Fire two queries in parallel so both hit 401 and both attempt refresh.
    const p1 = store.dispatch(kpisApi.endpoints.getOverviewKpis.initiate());
    const p2 = store.dispatch(kpisApi.endpoints.getStatusDonut.initiate());

    // Wait a tick for both initial requests to fire and the reauth path to enter.
    await new Promise((r) => setTimeout(r, 20));

    refreshResolve(
      jsonResponse(200, {
        user: { userId: 1, username: 'shri', role: 'MD', fullName: 'Shri', canCreateProjects: true, canUpdateProjects: true, canDeleteProjects: true, canViewProjects: true },
        accessToken: 'fresh-token',
        accessTokenExpiresAt: '2026-07-04T01:00:00.000Z',
      }),
    );

    await p1;
    await p2;

    expect(callsMatching(fetchMock, 'auth/refresh')).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it('does not loop when /auth/refresh itself returns 401', async () => {
    const store = makeStore();
    // No credentials — the refresh endpoint hitting 401 must short-circuit.
    store.dispatch(clearCredentials());

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'NO_REFRESH_COOKIE', message: 'x' } }));
    vi.stubGlobal('fetch', fetchMock);

    await store.dispatch(authApi.endpoints.refresh.initiate());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.status).toBe('out');

    vi.unstubAllGlobals();
  });
});
