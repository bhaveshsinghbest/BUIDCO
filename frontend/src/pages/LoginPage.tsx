import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useLoginMutation } from '../app/api/authApi';
import { useAppSelector } from '../app/hooks';
import { env } from '../env';
import { selectIsAuthenticated } from '../features/auth/authSlice';
import { takeLogoutReason } from '../hooks/useInactivityLogout';
import buidcoPic from '../assets/BUIDCo_pic.jpg';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { inputClassName, primaryButtonClassName, secondaryButtonClassName } from './authFormStyles';

interface LocationState {
  from?: { pathname: string };
}

interface PdDivision {
  divisionId: number;
  divisionName: string;
}

export function LoginPage(): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [login, { isLoading, error }] = useLoginMutation();
  const authed = useAppSelector(selectIsAuthenticated);
  const location = useLocation();

  // Step-2 state for PD login: after credentials verify, backend returns
  // { needsDivision, divisions[] }. We stash it here and render a picker.
  const [pdDivisions, setPdDivisions] = useState<PdDivision[] | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null);

  // If the inactivity timer ended the last session, say so. Being returned to
  // a bare login screen with no explanation is exactly what made the old
  // spurious logouts feel like a bug even once they were legitimate.
  const [timedOut] = useState<boolean>(() => takeLogoutReason() === 'inactivity');

  // Wake the API before the user can submit.
  //
  // The backend is on Render's free tier, which spins the instance down
  // after ~15 minutes idle. The next request pays a full cold boot —
  // measured at ~33s against /api/health, versus ~0.25s warm. Vercel's
  // rewrite proxy (vercel.json -> buidco.onrender.com) gives up long
  // before that and hands the browser an HTML gateway error, which
  // fetchBaseQuery can't parse as JSON. The result was a PARSING_ERROR /
  // FETCH_ERROR carrying no server message, so every such failure landed
  // on the generic "Sign-in failed" fallback — indistinguishable from a
  // wrong password.
  //
  // Firing a throwaway /health on mount overlaps the cold boot with the
  // seconds the user spends typing, so by submit time the instance is
  // usually already warm. Deliberately fire-and-forget: this is an
  // optimisation, and a failure here must never block the form.
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${env.VITE_API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => {
      /* warm-up is best-effort; the real error surfaces on submit. */
    });
    return () => {
      controller.abort();
    };
  }, []);

  const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? '/';
  if (authed) {
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      const body: { username: string; password: string; divisionId?: number } = {
        username,
        password,
      };
      if (pdDivisions && selectedDivisionId !== null) {
        body.divisionId = selectedDivisionId;
      }
      const res = await login(body).unwrap();
      // PD, step 1 → show division picker. Otherwise the mutation's
      // onQueryStarted already set credentials and the Navigate above fires.
      if ('needsDivision' in res && res.needsDivision) {
        setPdDivisions(res.divisions);
        setSelectedDivisionId(res.divisions[0]?.divisionId ?? null);
      }
    } catch {
      /* error state surfaces via `error`. Reset picker so user can retry cleanly. */
    }
  };

  const restartLogin = (): void => {
    setPdDivisions(null);
    setSelectedDivisionId(null);
    setPassword('');
  };

  const errorMessage = extractErrorMessage(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EEF1F6] p-4 sm:p-6 lg:p-10">
      <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-2xl lg:grid-cols-[46%_54%]">
        {/* ── Left branding panel ── */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0B1C33] via-[#152C4D] to-[#1D4ED8] px-8 py-10 text-center sm:py-14 lg:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className="h-44 w-36 overflow-hidden rounded-2xl bg-white shadow-lg sm:h-52 sm:w-[172px]">
              <img
                src={buidcoPic}
                alt="BUIDCO — Building Better Tomorrow"
                className="h-full w-full object-cover"
                style={{ objectPosition: 'center 22%' }}
              />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-wide text-white sm:text-3xl">
                BUIDCO
              </h1>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#93C5FD]">
                Project Monitoring System
              </p>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-[#CBD5E1]">
              A unified command center for tracking every BUIDCO project —
              from sanction to completion.
            </p>
          </div>
        </div>

        {/* ── Right authentication panel ── */}
        <div className="flex flex-col justify-center bg-white px-6 py-10 sm:px-10 sm:py-12 lg:px-14">
          <div className="mx-auto w-full max-w-sm">
            <h2 className="text-2xl font-extrabold text-[#111827] sm:text-3xl">
              Welcome to BUIDCo Portal
            </h2>
            <p className="mt-2 text-sm text-[#6B7280]">
              Sign in with your credentials to access the project dashboard.
            </p>

            {timedOut ? (
              <p
                className="mt-4 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-xs font-medium text-[#1E40AF]"
                role="status"
              >
                You were signed out after 1 hour of inactivity. Please sign in again.
              </p>
            ) : null}

            <form className="mt-8 space-y-4" onSubmit={onSubmit}>
              {pdDivisions ? (
                // ── Step 2 — PD division picker ──
                <>
                  <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-[12px] text-[#1E3A5F]">
                    <p className="font-semibold">Signed in as {username}</p>
                    <p className="mt-0.5 text-[11.5px] text-[#374151]">
                      You&rsquo;re a Project Director. Choose which division you&rsquo;re
                      working in for this session.
                    </p>
                  </div>
                  <label className="grid gap-1.5 text-xs font-semibold text-[#374151]">
                    Division
                    <select
                      required
                      value={selectedDivisionId ?? ''}
                      onChange={(e) => setSelectedDivisionId(Number(e.target.value))}
                      className="h-11 w-full rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm text-[#111827] transition-all duration-200 focus-visible:border-[#1D4ED8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1D4ED8]/15"
                    >
                      {pdDivisions.map((d) => (
                        <option key={d.divisionId} value={d.divisionId}>
                          {d.divisionName}
                        </option>
                      ))}
                    </select>
                  </label>
                  {errorMessage ? (
                    <p
                      className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs font-medium text-[#B91C1C]"
                      role="alert"
                    >
                      {errorMessage}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="submit"
                      className={`flex-1 ${primaryButtonClassName}`}
                      disabled={isLoading || selectedDivisionId === null}
                    >
                      {isLoading ? 'Signing in…' : 'Continue'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={restartLogin}
                      disabled={isLoading}
                      className={secondaryButtonClassName}
                    >
                      ← Back
                    </Button>
                  </div>
                </>
              ) : (
                // ── Step 1 — credentials (all roles) ──
                <>
                  <label className="grid gap-1.5 text-xs font-semibold text-[#374151]">
                    Username
                    <Input
                      autoComplete="username"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={inputClassName}
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-[#374151]">
                    Password
                    <Input
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClassName}
                    />
                  </label>
                  {errorMessage ? (
                    <p
                      className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs font-medium text-[#B91C1C]"
                      role="alert"
                    >
                      {errorMessage}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    className={`w-full ${primaryButtonClassName}`}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing in…' : 'Sign in'}
                  </Button>
                  <Link
                    to="/forgot-password"
                    className="block text-center text-[12.5px] font-semibold text-[#1D4ED8] hover:underline"
                  >
                    Forgot Password?
                  </Link>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Turn an RTK Query error into something a user can act on.
 *
 * `status` is either an HTTP code or one of fetchBaseQuery's string tags.
 * The transport failures matter here: the API is a separate Render service
 * behind a Vercel rewrite, so a cold start, a dropped connection or a
 * gateway HTML error page all arrive with NO parseable `data.error.message`.
 * Collapsing those into the same "Sign-in failed" string as a genuine
 * rejection is what made this impossible to diagnose from the screen —
 * users read it as "wrong password" and retyped credentials that were fine.
 */
function extractErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const anyErr = error as {
    status?: number | string;
    originalStatus?: number;
    data?: { error?: { message?: string } };
  };

  if (anyErr.status === 401) return 'Invalid username or password.';
  if (anyErr.status === 429) return 'Too many attempts. Try again in a few minutes.';

  // Never reached the API: offline, DNS/TLS failure, or the request was
  // still in flight when the proxy gave up.
  if (anyErr.status === 'FETCH_ERROR' || anyErr.status === 'TIMEOUT_ERROR') {
    return 'Could not reach the server. It may be starting up — wait a few seconds and try again.';
  }

  // Reached something, but it answered with non-JSON — almost always a
  // proxy/gateway error page rather than the API itself.
  if (anyErr.status === 'PARSING_ERROR') {
    return 'The server sent an unexpected response. It may be starting up — wait a few seconds and try again.';
  }

  const httpStatus = typeof anyErr.status === 'number' ? anyErr.status : anyErr.originalStatus;
  if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
    return 'The server is waking up. Please try again in a few seconds.';
  }

  return anyErr.data?.error?.message ?? 'Sign-in failed. Please try again.';
}
