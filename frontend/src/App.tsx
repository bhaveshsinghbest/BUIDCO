import { useEffect } from 'react';
import { useRefreshMutation } from './app/api/authApi';
import { useAppSelector } from './app/hooks';
import { selectAuthStatus } from './features/auth/authSlice';
import { AppRoutes } from './router';

/**
 * On mount, silently refresh from the still-valid refresh cookie so a
 * page reload doesn't kick the user out until the refresh actually
 * fails. If refresh returns 401, ProtectedRoute redirects to /login.
 *
 * This call bypasses baseQuery's 401-triggered single-flight lock (it's
 * not a retry, it's the initial proactive attempt), so it needs its own
 * guard: React 18 StrictMode's dev-only double-invoke would otherwise
 * fire two identical /auth/refresh calls per mount (status is still
 * 'unknown' on both passes, since the first call hasn't resolved yet). A
 * module-level flag survives that fake unmount/remount pair — unlike a
 * ref, which StrictMode also resets — while still starting fresh on an
 * actual page reload, which is what we want either way.
 */
let bootRefreshStarted = false;

export function App(): JSX.Element {
  const status = useAppSelector(selectAuthStatus);
  const [refresh] = useRefreshMutation();

  useEffect(() => {
    if (status === 'unknown' && !bootRefreshStarted) {
      bootRefreshStarted = true;
      void refresh();
    }
  }, [status, refresh]);

  return <AppRoutes />;
}
