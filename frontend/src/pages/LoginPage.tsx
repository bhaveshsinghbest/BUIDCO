import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useLoginMutation } from '../app/api/authApi';
import { useAppSelector } from '../app/hooks';
import { selectIsAuthenticated } from '../features/auth/authSlice';
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

function extractErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const anyErr = error as { status?: number; data?: { error?: { message?: string } } };
  if (anyErr.status === 401) return 'Invalid username or password.';
  if (anyErr.status === 429) return 'Too many attempts. Try again in a few minutes.';
  return anyErr.data?.error?.message ?? 'Sign-in failed. Please try again.';
}
