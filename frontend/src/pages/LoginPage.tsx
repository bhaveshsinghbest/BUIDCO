import { useEffect, useRef, useState, type FormEvent } from 'react';
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

/**
 * How long to wait before each cold-start retry.
 *
 * The first attempt is already killed by the proxy at ~30s, so these add up
 * to roughly 80s of further cover — comfortably past the slowest boot we
 * have measured (56s).
 *
 * Sized from measurement, not guesswork. Observed cold boots across a month:
 * 32.7s, 33.2s, 33.2s, 43.1s, 43.2s, 56.1s. The earlier 8/16/24 schedule gave
 * only 48s of waiting, so a boot at the slow end of that range exhausted the
 * retries and the user was told to try again — which is the failure this
 * schedule exists to prevent. These six delays cover 135s of waiting.
 */
const COLD_START_BACKOFF_MS = [5_000, 10_000, 15_000, 25_000, 35_000, 45_000];

/**
 * A connection failure faster than this never reached anything, so it is
 * "no network", not "origin still booting" — the latter only surfaces after
 * the proxy has sat waiting.
 */
const SLOW_FAILURE_MS = 5_000;

/**
 * True for failures that mean "the backend is probably still booting"
 * rather than "the server considered this request and said no".
 *
 * A wrong password (401) or a rate limit (429) is never retried. Nor is an
 * instant connection failure: if the user is simply offline, spinning
 * through the whole backoff before admitting it would be far worse than
 * saying so immediately.
 */
function isColdStartError(error: unknown, elapsedMs: number): boolean {
  if (!error || typeof error !== 'object') return false;
  const { status, originalStatus } = error as {
    status?: number | string;
    originalStatus?: number;
  };
  const httpStatus = typeof status === 'number' ? status : originalStatus;

  // 429 is never retried, and this check must come FIRST.
  //
  // Render rate-limits requests that try to wake a hibernating free-tier
  // service, answering 429 with a text/plain "Too Many Requests" body and
  // an X-Render-Routing: hibernate-rate-limited header. Because the body is
  // not JSON, fetchBaseQuery fails to parse it and reports PARSING_ERROR
  // with originalStatus 429 — which the PARSING_ERROR branch below would
  // otherwise treat as "still booting" and retry six times, hammering the
  // very rate limiter that is already refusing us and making the wake take
  // longer. Backing off immediately is the only correct response.
  if (httpStatus === 429) return false;

  // Reached a proxy or gateway, which answered for an origin that isn't
  // up yet. Unambiguously worth retrying.
  if (
    status === 'PARSING_ERROR' ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504
  ) {
    return true;
  }

  // Never got a verdict. Only a *slow* failure looks like a proxy giving up
  // on a booting origin; an instant one means there was nothing to talk to.
  if (status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR') {
    const online = typeof navigator === 'undefined' || navigator.onLine;
    return online && elapsedMs >= SLOW_FAILURE_MS;
  }

  return false;
}

/**
 * Shown instead of an error while a cold-start retry is in flight.
 *
 * Counts the seconds elapsed as well as the attempt number: a wait of up to
 * two minutes with no visible movement reads as a hang, and the whole point
 * of this notice is to stop a successful-but-slow sign-in looking broken.
 */
function WakingNotice({ attempt, since }: { attempt: number; since: number }): JSX.Element {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - since) / 1000));
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - since) / 1000)), 1000);
    return () => clearInterval(id);
  }, [since]);

  return (
    <p
      className="flex items-center gap-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-xs font-medium text-[#1E3A5F]"
      role="status"
    >
      <span
        aria-hidden
        className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-[#BFDBFE] border-t-[#1D4ED8]"
      />
      <span>
        Waking the server — the first sign-in after a quiet period can take up to two minutes.
        Retrying automatically (attempt {attempt} of {COLD_START_BACKOFF_MS.length}, {elapsed}s
        elapsed)… you do not need to do anything.
      </span>
    </p>
  );
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

  /**
   * Set when the mount-time probe finds the API unreachable, so the page can
   * say so before a password is typed rather than after.
   */
  const [apiUnreachable, setApiUnreachable] = useState(false);

  // Which cold-start retry we're on (0 = not retrying). Drives the "waking
  // the server" notice and keeps the red error box hidden while we're still
  // trying — see attemptLogin below.
  const [wakeAttempt, setWakeAttempt] = useState(0);
  /** When the current cold-start wait began, for the elapsed counter. */
  const [wakeSince, setWakeSince] = useState(0);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

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
    })
      .then((res) => {
        // A 5xx to /health is the proxy reporting that it could not reach the
        // API at all. In development that means the backend process simply
        // is not running, and saying so now is worth a great deal: the
        // alternative is the user typing a correct password and being told
        // sign-in failed, which sends them hunting for a credential problem
        // that does not exist. Deliberately dev-only — in production a
        // failed probe usually means a hibernating instance that the
        // submit-time retry rides out, and crying "unreachable" there would
        // be both wrong and alarming.
        if (import.meta.env.DEV && !res.ok && res.status >= 500) {
          setApiUnreachable(true);
        }
      })
      .catch((err: unknown) => {
        // Aborting on unmount is not a failure.
        const aborted = err instanceof Error && err.name === 'AbortError';
        if (import.meta.env.DEV && !aborted) setApiUnreachable(true);
      });
    return () => {
      controller.abort();
    };
  }, []);

  // Keep probing while the warning is up, so starting the backend clears it
  // on its own. Without this the notice would outlive the problem and the
  // user would have to know to reload.
  useEffect(() => {
    if (!apiUnreachable) return undefined;
    const id = setInterval(() => {
      void fetch(`${env.VITE_API_BASE_URL}/health`, { method: 'GET' })
        .then((res) => {
          if (res.ok) setApiUnreachable(false);
        })
        .catch(() => {
          /* still down — leave the notice up. */
        });
    }, 5_000);
    return () => {
      clearInterval(id);
    };
  }, [apiUnreachable]);

  const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? '/';
  if (authed) {
    return <Navigate to={redirectTo} replace />;
  }

  /**
   * Sign in, riding out a cold start rather than reporting it as a failure.
   *
   * On Render's free tier the instance sleeps after ~15 minutes idle and the
   * next request pays a full boot — measured at 33s and, on a later check,
   * 56s. Vercel's rewrite proxy gives up around 30s and returns an HTML
   * gateway page, so the first attempt after an idle period *always* fails
   * with PARSING_ERROR even though nothing is wrong with the credentials or
   * the server. The boot it triggered continues in the background, so simply
   * trying again shortly after succeeds.
   *
   * So: retry transport failures on a backoff that covers roughly 135s of
   * boot time, and only show the red error box once those are exhausted.
   * A real rejection (401 wrong password, 429 rate limit) is never retried.
   */
  const attemptLogin = async (
    body: { username: string; password: string; divisionId?: number },
    retry = 0,
  ): Promise<void> => {
    const startedAt = Date.now();
    try {
      const res = await login(body).unwrap();
      setWakeAttempt(0);
      // PD, step 1 → show division picker. Otherwise the mutation's
      // onQueryStarted already set credentials and the Navigate above fires.
      if ('needsDivision' in res && res.needsDivision) {
        setPdDivisions(res.divisions);
        setSelectedDivisionId(res.divisions[0]?.divisionId ?? null);
      }
    } catch (err) {
      const nextDelay = COLD_START_BACKOFF_MS[retry];
      const coldStart = isColdStartError(err, Date.now() - startedAt);
      if (nextDelay === undefined || !coldStart || !aliveRef.current) {
        setWakeAttempt(0);
        return;
      }
      setWakeAttempt(retry + 1);
      if (retry === 0) setWakeSince(startedAt);
      await new Promise((resolve) => setTimeout(resolve, nextDelay));
      if (!aliveRef.current) return;
      await attemptLogin(body, retry + 1);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const body: { username: string; password: string; divisionId?: number } = {
      username,
      password,
    };
    if (pdDivisions && selectedDivisionId !== null) {
      body.divisionId = selectedDivisionId;
    }
    await attemptLogin(body);
  };

  const restartLogin = (): void => {
    setPdDivisions(null);
    setSelectedDivisionId(null);
    setPassword('');
  };

  // While a cold-start retry is in flight the mutation's `error` holds the
  // transport failure we are deliberately riding out — showing it would be
  // telling the user about a problem we are already fixing.
  const waking = wakeAttempt > 0;
  const busy = isLoading || waking;
  const errorMessage = waking ? null : extractErrorMessage(error);

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

            {apiUnreachable ? (
              <p
                className="mt-4 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-2.5 text-xs font-medium text-[#92400E]"
                role="status"
              >
                The API server is not responding, so no sign-in can succeed yet — this is not a
                problem with your credentials. Start the backend (<code>npm run dev</code> in{' '}
                <code>backend/</code>, port 4000); this notice clears itself once it is up.
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
                  {waking ? <WakingNotice attempt={wakeAttempt} since={wakeSince} /> : null}
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
                      disabled={busy || selectedDivisionId === null}
                    >
                      {waking ? 'Waking server…' : isLoading ? 'Signing in…' : 'Continue'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={restartLogin}
                      disabled={busy}
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
                  {waking ? <WakingNotice attempt={wakeAttempt} since={wakeSince} /> : null}
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
                    disabled={busy}
                  >
                    {waking ? 'Waking server…' : isLoading ? 'Signing in…' : 'Sign in'}
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

  // Two very different things arrive as 429, and telling them apart matters:
  //
  //  - The API's own rate limiter answers JSON, and genuinely means the
  //    account or IP has made too many sign-in attempts.
  //  - The host rate-limits requests that wake a hibernating instance and
  //    answers text/plain, which fetchBaseQuery surfaces as PARSING_ERROR
  //    with originalStatus 429. The user has done nothing wrong, and
  //    "too many attempts" would send them hunting for a problem with
  //    their password that does not exist.
  if (anyErr.status === 429) return 'Too many attempts. Try again in a few minutes.';
  if (anyErr.status === 'PARSING_ERROR' && anyErr.originalStatus === 429) {
    return 'The server is starting up and is briefly refusing new requests. Please wait about a minute, then sign in again.';
  }

  // Never reached the API: offline, DNS/TLS failure, or the request was
  // still in flight when the proxy gave up.
  if (anyErr.status === 'FETCH_ERROR' || anyErr.status === 'TIMEOUT_ERROR') {
    return 'Could not reach the server. It may be starting up — wait a few seconds and try again.';
  }

  // Reached something, but it answered with non-JSON — almost always a
  // proxy/gateway error page rather than the API itself. By the time this
  // reaches the screen the automatic cold-start retries have already been
  // spent, so the advice is to wait longer, not to try instantly.
  if (anyErr.status === 'PARSING_ERROR') {
    return 'The server is still waking up and did not respond in time. Please wait about a minute and sign in again.';
  }

  const httpStatus = typeof anyErr.status === 'number' ? anyErr.status : anyErr.originalStatus;
  if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
    return 'The server is waking up. Please try again in a few seconds.';
  }

  // Any other 5xx that carries no API error envelope did not come from the
  // API. It is the proxy in front of it reporting that it could not reach
  // the origin at all: Vite answers 500 with an empty text/plain body when
  // nothing is listening on the API port, and an empty body becomes
  // `data: null`, so this used to fall through to the generic fallback and
  // read as a rejected password — the one thing it is not. The API's own
  // failures always carry { error: { code, message } }, so the presence of
  // that envelope is what distinguishes the two.
  const apiMessage = anyErr.data?.error?.message;
  if (httpStatus !== undefined && httpStatus >= 500 && !apiMessage) {
    return import.meta.env.DEV
      ? 'Could not reach the API server. The backend does not appear to be running — start it on port 4000 and sign in again.'
      : 'Could not reach the API server. It is not responding right now — please try again in a minute.';
  }

  return apiMessage ?? 'Sign-in failed. Please try again.';
}
