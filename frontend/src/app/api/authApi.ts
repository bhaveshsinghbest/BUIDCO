import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { api } from '../api';
import { isSessionRejection } from '../baseQuery';
import { resetActivityClock } from '../../hooks/useInactivityLogout';
import {
  clearCredentials,
  markUnauthenticated,
  openMdBriefing,
  setCredentials,
} from '../../features/auth/authSlice';
import type {
  AuthResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
} from '../../types/api';

function isAuthResponse(r: LoginResponse): r is AuthResponse {
  return 'accessToken' in r;
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({ url: 'auth/login', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // Only bind credentials + fire the MD briefing when we got a
          // full AuthResponse. The needsDivision case is step 1 of the
          // PD handshake — no session yet.
          if (isAuthResponse(data)) {
            // Phase C2 — wipe every RTK Query cache entry before binding
            // the new identity. Prevents an MD's cached KPI/Project
            // payloads from being served to a PD who signs in next
            // (same endpoint + same undefined args = cache hit).
            dispatch(api.util.resetApiState());
            // Start the inactivity clock fresh. The hook adopts any stored
            // timestamp so tabs share one timer — without this, a session
            // left idle before signing out would carry its stale clock into
            // the next sign-in and expire it immediately.
            resetActivityClock();
            dispatch(setCredentials(data));
            if (data.user.role === 'MD') {
              dispatch(openMdBriefing());
            }
          }
        } catch {
          /* leave auth state untouched — the error surfaces to the caller. */
        }
      },
      invalidatesTags: ['Auth'],
    }),

    /**
     * Explicit refresh. Base-query reauth handles the implicit case
     * (401 → refresh → retry). This mutation lets callers proactively
     * refresh (e.g. on app boot to hydrate the access token from the
     * still-valid refresh cookie).
     */
    refresh: build.mutation<AuthResponse, void>({
      query: () => ({
        url: 'auth/refresh',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {},
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // Refresh is silent token rotation for the SAME user — cache
          // stays valid. Only setCredentials, no resetApiState().
          dispatch(setCredentials(data));
        } catch (err) {
          // Only an explicit 401/403 means the session is actually gone.
          // A transport failure (offline, proxy timeout, cold-starting API,
          // any 5xx) tells us nothing about the refresh cookie's validity —
          // tearing the session down there is what logged active users out.
          const error = (err as { error?: FetchBaseQueryError } | undefined)?.error;
          if (isSessionRejection(error)) {
            dispatch(api.util.resetApiState());
            dispatch(clearCredentials());
          } else {
            // Session preserved. `markUnauthenticated` only moves us out of
            // the 'unknown' boot state, so a first-load refresh that never
            // landed still resolves the app instead of hanging on a splash.
            dispatch(markUnauthenticated());
          }
        }
      },
    }),

    logout: build.mutation<void, void>({
      query: () => ({ url: 'auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          // Wipe every RTK Query cache entry on sign-out so the next user
          // (potentially a different role) starts with a blank slate.
          dispatch(api.util.resetApiState());
          resetActivityClock();
          dispatch(clearCredentials());
        }
      },
      invalidatesTags: ['Auth'],
    }),

    me: build.query<MeResponse, void>({
      query: () => 'auth/me',
      providesTags: ['Auth'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useMeQuery,
  useLazyMeQuery,
} = authApi;
