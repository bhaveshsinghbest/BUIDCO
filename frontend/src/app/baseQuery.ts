/**
 * fetchBaseQuery + reauth interceptor.
 *
 * Every request goes out with:
 *   - Authorization: Bearer <access-token from Redux> (added in prepareHeaders)
 *   - credentials: 'include'   (so the refresh cookie can flow on /auth/refresh)
 *
 * When a request comes back 401 we assume the access token expired,
 * fire ONE /auth/refresh call (shared across every concurrent 401 via
 * a promise lock — no thundering herd), then retry the original request
 * exactly once. If refresh also fails we clear credentials so the UI
 * can redirect to the login screen.
 */

import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { env } from '../env';
import {
  clearCredentials,
  markUnauthenticated,
  setCredentials,
  type AuthState,
} from '../features/auth/authSlice';
import type { AuthResponse } from '../types/api';

interface StoreShape {
  auth: AuthState;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: env.VITE_API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, api) => {
    const token = (api.getState() as StoreShape).auth.accessToken;
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

/**
 * Why a refresh failed decides whether the session is over.
 *
 *  - `ok`          the server minted a new access token.
 *  - `rejected`    the server explicitly refused (401/403): the refresh
 *                  cookie is missing, expired, revoked or rotated away.
 *                  This is the only outcome that ends a session.
 *  - `unavailable` the request never got a verdict — offline, DNS/TLS
 *                  failure, proxy timeout, a cold-starting API, any 5xx.
 *                  The session is probably still perfectly valid, so we
 *                  keep it and let the next request try again.
 *
 * Collapsing `unavailable` into `rejected` is what logged active users out:
 * a single dropped request mid-session ended it, and on this deployment the
 * API sleeps after ~15 minutes idle, so the first request back was routinely
 * slow enough to fail that way.
 */
type RefreshOutcome =
  | { kind: 'ok'; data: AuthResponse }
  | { kind: 'rejected' }
  | { kind: 'unavailable' };

/** True only when the server itself answered "this session is not valid". */
export function isSessionRejection(error: FetchBaseQueryError | undefined): boolean {
  if (!error) return false;
  return error.status === 401 || error.status === 403;
}

/**
 * Shared promise so N concurrent 401s only trigger ONE refresh call.
 * Reset once the refresh completes (either way).
 */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

async function attemptRefresh(
  api: Parameters<BaseQueryFn>[1],
  extra: unknown,
): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async (): Promise<RefreshOutcome> => {
    const result = await rawBaseQuery(
      {
        url: 'auth/refresh',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {},
      },
      api,
      extra as FetchArgs['body'],
    );
    if (result.data) {
      return { kind: 'ok', data: result.data as AuthResponse };
    }
    return isSessionRejection(result.error) ? { kind: 'rejected' } : { kind: 'unavailable' };
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status !== 401) {
    return result;
  }

  // Refresh endpoint itself failing shouldn't loop.
  const argUrl = typeof args === 'string' ? args : args.url;
  if (argUrl.endsWith('auth/refresh')) {
    api.dispatch(clearCredentials());
    return result;
  }

  const refreshed = await attemptRefresh(api, extraOptions);
  if (refreshed.kind === 'ok') {
    api.dispatch(
      setCredentials({
        user: refreshed.data.user,
        accessToken: refreshed.data.accessToken,
        accessTokenExpiresAt: refreshed.data.accessTokenExpiresAt,
      }),
    );
    result = await rawBaseQuery(args, api, extraOptions);
  } else if (refreshed.kind === 'rejected') {
    api.dispatch(markUnauthenticated());
    api.dispatch(clearCredentials());
  }
  // 'unavailable': keep the session. The caller still gets the failed
  // result and can surface a "couldn't reach the server" state, but the
  // user stays signed in and the next request retries the refresh.
  return result;
};

/** Test hook — resets the module-level lock between test cases. */
export function __resetRefreshInFlight(): void {
  refreshInFlight = null;
}
