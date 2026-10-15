import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BUIDCO_LOGO_URI } from '../../assets/buidcoLogo';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { useLogoutMutation } from '../../app/api/authApi';
import {
  dismissMdBriefing,
  selectIsAuthenticated,
  selectShowMdBriefing,
} from '../../features/auth/authSlice';
import { useInactivityLogout } from '../../hooks/useInactivityLogout';
import { MdSchemeSummaryModal } from '../md/MdSchemeSummaryModal';
import { TenderDashboardModal } from '../tender/TenderDashboardModal';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

/** localStorage key for the desktop sidebar collapsed preference. */
const LS_SIDEBAR = 'buidco_sidebar_collapsed_v1';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_SIDEBAR) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(v: boolean): void {
  try { localStorage.setItem(LS_SIDEBAR, v ? '1' : '0'); } catch { /* quota */ }
}

export function AppShell(): JSX.Element {
  const dispatch = useAppDispatch();
  const showMdBriefing = useAppSelector(selectShowMdBriefing);
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [tenderOpen, setTenderOpen] = useState<boolean>(false);
  const location = useLocation();

  // Auto-close the mobile drawer whenever the user navigates. On desktop the
  // NavLink's onClick would still fire onCloseMobile but no drawer is open,
  // so this is a defence-in-depth for programmatic navigation (e.g. redirects).
  useEffect(() => {
    setMobileOpen(false);
    // The Tender Dashboard now docks beside the sidebar rather than covering
    // it, so its nav links are clickable while it is open. Close it on
    // navigation — otherwise the user would land on the new section with the
    // dashboard still parked over it.
    setTenderOpen(false);
  }, [location.pathname]);

  // Session ends after a full hour with no interaction — and only then.
  // Mounted here rather than in App so the timer exists exactly as long as
  // the authenticated shell does. The logout mutation revokes the refresh
  // token server-side, so the session is really gone, not just forgotten
  // by this tab.
  const authed = useAppSelector(selectIsAuthenticated);
  const [logout] = useLogoutMutation();
  const handleInactivityTimeout = useCallback((): void => {
    void logout();
  }, [logout]);
  useInactivityLogout({ enabled: authed, onTimeout: handleInactivityTimeout });

  // Publish the real top-bar height.
  //
  // The Sidebar and the Tender Dashboard both need to sit below TopNav, and
  // both hard-coded 50px — the height of its FIRST row. TopNav actually
  // renders a second, unconditional row (the universal search bar), so it is
  // ~100px. The sidebar was therefore sticking 50px too high AND sizing
  // itself 50px too tall, hanging off the bottom of the screen: on a short
  // viewport its last items sat below the fold with no way to reach them,
  // which reads exactly like a sidebar that won't scroll.
  //
  // Measured rather than re-hard-coded, because the search row's height is
  // content-driven and changes with breakpoint.
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [topNavH, setTopNavH] = useState<number>(100);

  useEffect(() => {
    const header = shellRef.current?.querySelector('header');
    if (!header) return;
    const measure = (): void => setTopNavH(Math.round(header.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const toggleCollapsed = (): void => {
    setCollapsed((prev) => {
      const next = !prev;
      saveCollapsed(next);
      return next;
    });
  };

  return (
    <div
      ref={shellRef}
      className="relative min-h-screen bg-[#F4F6F9] font-sans text-[#111827]"
      // Published so full-screen overlays rendered outside the flex row (the
      // Tender Dashboard) can dock beside the sidebar instead of covering it,
      // and keep following it when it collapses. Matches Sidebar's own
      // lg:w-[64px] / lg:w-[220px].
      style={{
        '--sidebar-w': collapsed ? '64px' : '220px',
        '--topnav-h': `${topNavH}px`,
      } as React.CSSProperties}
    >
      {/* Faded BUIDCO watermark — same pattern as the reference JSX. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[length:480px_480px] bg-center bg-no-repeat opacity-[0.08]"
        style={{ backgroundImage: `url(${BUIDCO_LOGO_URI})` }}
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        <TopNav
          onOpenMobileNav={() => {
            // Below `lg` the nav is an off-canvas drawer that lives inside
            // the shell, so it cannot paint over the Tender Dashboard (a
            // sibling of the shell). Reaching for the hamburger means "I want
            // to navigate", so close the dashboard and show the drawer rather
            // than sliding it open behind the panel where nothing appears to
            // happen. On desktop the two coexist and this never fires.
            setTenderOpen(false);
            setMobileOpen(true);
          }}
        />
        <div className="flex flex-1">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
            onOpenTenderDashboard={() => setTenderOpen(true)}
            tenderOpen={tenderOpen}
          />
          <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 sm:py-6">
            <div className="mx-auto max-w-[1400px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <MdSchemeSummaryModal
        open={showMdBriefing}
        onClose={() => dispatch(dismissMdBriefing())}
      />
      <TenderDashboardModal
        open={tenderOpen}
        onClose={() => setTenderOpen(false)}
      />
    </div>
  );
}
