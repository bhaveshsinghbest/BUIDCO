/**
 * Auth state — access token + user profile held in memory only.
 *
 * The refresh token lives in an httpOnly cookie the browser sends to
 * /api/auth/refresh; we never touch it directly. The access token is
 * kept here (never localStorage/sessionStorage) so a successful XSS
 * still can't smuggle it out without also compromising the running app.
 * Downside: a full page reload signs the user out until the refresh
 * flow re-mints an access token — App.tsx triggers that on mount.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { UserPublic } from '../../types/api';

export interface AuthState {
  user: UserPublic | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  /** `unknown` before the initial refresh attempt completes; then `in` or `out`. */
  status: 'unknown' | 'in' | 'out';
  /** True right after an MD explicitly logs in — drives the MD Scheme Summary popup. */
  showMdBriefing: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  accessTokenExpiresAt: null,
  status: 'unknown',
  showMdBriefing: false,
};

export interface SetCredentialsPayload {
  user: UserPublic;
  accessToken: string;
  accessTokenExpiresAt: string;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<SetCredentialsPayload>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.accessTokenExpiresAt = action.payload.accessTokenExpiresAt;
      state.status = 'in';
    },
    clearCredentials(state) {
      state.user = null;
      state.accessToken = null;
      state.accessTokenExpiresAt = null;
      state.status = 'out';
      state.showMdBriefing = false;
    },
    /** After the initial refresh attempt returns 401, mark us as definitively out. */
    markUnauthenticated(state) {
      if (state.status === 'unknown') {
        state.status = 'out';
      }
    },
    /**
     * Dispatched by the login mutation (not by silent refresh) so the MD
     * scheme-summary popup opens on every explicit sign-in but stays out
     * of the way when the app just resumes an existing session.
     */
    openMdBriefing(state) {
      state.showMdBriefing = true;
    },
    dismissMdBriefing(state) {
      state.showMdBriefing = false;
    },
  },
});

export const {
  setCredentials,
  clearCredentials,
  markUnauthenticated,
  openMdBriefing,
  dismissMdBriefing,
} = authSlice.actions;
export const authReducer = authSlice.reducer;

/* Selectors — typed against RootState via inference in hooks.ts. */

interface WithAuth {
  auth: AuthState;
}

export const selectAccessToken = (s: WithAuth): string | null => s.auth.accessToken;
export const selectCurrentUser = (s: WithAuth): UserPublic | null => s.auth.user;
export const selectAuthStatus = (s: WithAuth): AuthState['status'] => s.auth.status;
export const selectIsAuthenticated = (s: WithAuth): boolean => s.auth.status === 'in';
export const selectShowMdBriefing = (s: WithAuth): boolean => s.auth.showMdBriefing;
export const selectHasRole = (s: WithAuth, ...roles: readonly UserPublic['role'][]): boolean => {
  const role = s.auth.user?.role;
  return role !== undefined && roles.includes(role);
};

/**
 * "Can view projects" (MD bypasses). The API refuses every project-data
 * endpoint without it (security finding S-03); the UI hides those screens
 * so the user is not shown pages that can only fail.
 */
export const selectCanViewProjects = (s: WithAuth): boolean => {
  const u = s.auth.user;
  return !!u && (u.role === 'MD' || u.canViewProjects);
};

/** True when the current user can perform the given project action (MD bypasses flags). */
export const selectCanCreateProjects = (s: WithAuth): boolean => {
  const u = s.auth.user;
  return !!u && (u.role === 'MD' || u.canCreateProjects);
};
export const selectCanUpdateProjects = (s: WithAuth): boolean => {
  const u = s.auth.user;
  return !!u && (u.role === 'MD' || u.canUpdateProjects);
};
export const selectCanDeleteProjects = (s: WithAuth): boolean => {
  const u = s.auth.user;
  return !!u && (u.role === 'MD' || u.canDeleteProjects);
};
/** True when the user can access the User Management view (MD + Admin). */
export const selectCanManageUsers = (s: WithAuth): boolean => {
  const role = s.auth.user?.role;
  return role === 'MD' || role === 'Admin';
};
