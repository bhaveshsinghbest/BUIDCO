import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudRain,
  FileEdit,
  FolderTree,
  Gavel,
  LayoutDashboard,
  Map,
  Tag,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAppSelector } from '../../app/hooks';
import { selectCurrentUser } from '../../features/auth/authSlice';
import { RoleGate } from '../auth/RoleGate';
import { cn } from '../../lib/utils';
import type { UserRole } from '../../types/api';
import { NavClock } from './NavClock';
import { UserPill } from './UserPill';
import { UtilityNavCluster } from './UtilityNav';

/**
 * Primary navigation (Read.md §1). Order matches the spec exactly; labels
 * kept as the current app spells them per user's answer during scoping.
 */
interface NavItem {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  end?: boolean;
  /** Roles this item is hidden for. Absent = shown to everyone. */
  hideFor?: UserRole[];
}

/**
 * Phase C2 — PDs are pinned to a single division and shouldn't be looking
 * at portfolio-wide District/Division breakdowns. Hidden client-side in
 * the sidebar (spec choice: hide entirely). Backend also filters for
 * defence-in-depth if a PD types the URL manually.
 */
const PRIMARY_NAV: NavItem[] = [
  { to: '/',                    label: 'Overview',           Icon: LayoutDashboard, end: true },
  { to: '/sectors',             label: 'Sectors',            Icon: Tag },
  { to: '/schemes',             label: 'Schemes',            Icon: FolderTree },
  { to: '/projects',            label: 'Projects',           Icon: ClipboardList },
  { to: '/divisions',           label: 'Divisions',          Icon: Map,    hideFor: ['PD'] },
  { to: '/cos-eot',             label: 'CoS / EoT',          Icon: FileEdit },
  { to: '/management-actions',  label: 'Management Action',  Icon: CheckSquare },
  { to: '/gaps',                label: 'Outstanding Gaps',   Icon: AlertTriangle },
  { to: '/pre-monsoon',         label: 'Pre-Monsoon Prep',   Icon: CloudRain },
  { to: '/funds-uc',            label: 'Funds & UC',         Icon: Wallet },
];

interface Props {
  /** Desktop collapsed state (persists to localStorage). */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile drawer open state (transient). */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** Opens the Tender Dashboard modal (separate group below the primary nav). */
  onOpenTenderDashboard: () => void;
  /** True while the Tender Dashboard panel is open. It has no route of its
   *  own, so the router cannot derive this — AppShell owns the state. */
  tenderOpen: boolean;
}

export function Sidebar({
  collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, onOpenTenderDashboard, tenderOpen,
}: Props): JSX.Element {
  const currentUser = useAppSelector(selectCurrentUser);
  const role = currentUser?.role;
  const visibleNav = PRIMARY_NAV.filter(
    (item) => !item.hideFor || !role || !item.hideFor.includes(role),
  );

  // Close mobile drawer on Escape (matches modal convention).
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCloseMobile();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Backdrop — mobile drawer only */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        aria-label="Primary navigation"
        className={cn(
          // Base — desktop persistent, mobile fixed drawer
          // Offset and height both track the REAL TopNav height (published by
          // AppShell as --topnav-h). These were hard-coded to 50px — the
          // height of TopNav's first row only — so the sidebar stuck too high
          // and ran ~50px past the bottom of the screen, putting its last
          // items out of reach. `dvh` rather than `vh` so mobile browser
          // chrome doesn't cause the same overhang.
          'sticky top-[var(--topnav-h,100px)] z-40 flex h-[calc(100dvh-var(--topnav-h,100px))] shrink-0 flex-col border-r border-[#E5E7EB] bg-white transition-all duration-200',
          // Collapsed width (desktop) toggles between rail and full
          collapsed ? 'lg:w-[64px]' : 'lg:w-[220px]',
          // Mobile: fixed drawer slides in from left
          'fixed left-0 w-[240px] shadow-2xl',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: no translation regardless
          'lg:sticky lg:translate-x-0 lg:shadow-none',
        )}
      >
        {/* Header — toggle (desktop) or close (mobile) */}
        <div
          className={cn(
            'flex shrink-0 items-center border-b border-[#E5E7EB] px-2 py-2',
            collapsed ? 'lg:justify-center' : 'justify-between',
          )}
        >
          {/* Mobile close */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] lg:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>

          {/* Desktop expand/collapse toggle */}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'hidden items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] lg:inline-flex',
              collapsed ? 'w-9 justify-center' : 'w-full justify-between',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <span className="uppercase tracking-wider">Navigation</span>
                <ChevronLeft size={16} />
              </>
            )}
          </button>
        </div>

        {/* Nav list — single scrollable container for both the primary
            navigation and (mobile-only) the Quick Actions section below it,
            so the two never scroll independently of one another. */}
        <nav className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="Primary">
          <ul className="flex flex-col gap-0.5 px-2">
            {visibleNav.map((item) => (
              <li key={item.to}>
                <SidebarLink
                  to={item.to}
                  label={item.label}
                  Icon={item.Icon}
                  collapsed={collapsed}
                  end={item.end ?? false}
                  onNavigate={onCloseMobile}
                  // The Tender Dashboard has no route, so the underlying
                  // page's link stays "active" underneath it — leaving two
                  // items highlighted at once and no clear answer to "where
                  // am I?". While the panel is open it owns the current
                  // state, and the route link steps back.
                  forceInactive={tenderOpen}
                />
              </li>
            ))}
          </ul>

          {/*
            Tender Dashboard sits in its own group below Pre-Monsoon
            Preparation (Tender_Dashboard.md §3). It opens a modal instead of
            navigating, so it's a button rather than a NavLink. The <hr>
            visually separates it from the primary nav.
          */}
          <hr
            aria-hidden
            className={cn(
              'mx-2 my-2 border-t border-[#E5E7EB]',
              collapsed ? 'lg:mx-1.5' : '',
            )}
          />
          <ul className="flex flex-col gap-0.5 px-2">
            <li>
              <SidebarButton
                label="Tender Dashboard"
                Icon={Gavel}
                collapsed={collapsed}
                active={tenderOpen}
                onClick={() => {
                  onCloseMobile();
                  onOpenTenderDashboard();
                }}
              />
            </li>
            <RoleGate allow={['MD', 'Admin', 'PD']}>
              <li>
                <SidebarLink
                  to="/users"
                  label="User Management"
                  Icon={Users}
                  collapsed={collapsed}
                  end={false}
                  onNavigate={onCloseMobile}
                  forceInactive={tenderOpen}
                />
              </li>
            </RoleGate>
          </ul>

          {/* Quick Actions — TopNav's utility pills/KPI Guide/Audit Trail/
              Users don't fit in the header row below `lg`, so they live
              here instead, in the same scroll container as the nav above. */}
          <div className="mt-4 border-t border-[#E5E7EB] px-2 pt-3 lg:hidden">
            <div className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Quick Actions
            </div>
            <UtilityNavCluster
              onNavigate={onCloseMobile}
              className="flex flex-col items-stretch gap-1.5"
            />
          </div>
        </nav>

        {/* Account footer — mobile only; clock + user pill/sign-out relocate
            here so the mobile top bar is just hamburger + logo. Sits below
            the scrollable region (not part of it — it's account chrome, not
            a nav item or quick action). */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-[#E5E7EB] px-2 py-2 lg:hidden">
          <div className="px-0.5">
            <NavClock />
          </div>
          <UserPill compact />
        </div>
      </aside>
    </>
  );
}

interface SidebarLinkProps {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  collapsed: boolean;
  end: boolean;
  onNavigate: () => void;
  /** Suppress the router-derived active state (the Tender Dashboard panel
   *  is open and owns "current" instead). */
  forceInactive?: boolean;
}

/**
 * Same visual grammar as SidebarLink but for actions that open a panel
 * rather than navigating.
 *
 * `active` is passed in rather than derived from the router, because the
 * Tender Dashboard has no route of its own — it is panel state owned by
 * AppShell. Without it the item stayed unstyled while the dashboard was
 * open, so nothing in the nav indicated which section you were in.
 */
function SidebarButton({
  label, Icon, collapsed, active = false, onClick,
}: {
  label: string;
  Icon: typeof LayoutDashboard;
  collapsed: boolean;
  active?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium transition-colors',
        collapsed && 'lg:justify-center lg:px-1.5',
        // Matches SidebarLink's active treatment exactly, so an open panel
        // reads the same as an active route.
        active
          ? 'bg-[#1E3A5F] text-white'
          : 'text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111827]',
      )}
    >
      <Icon
        size={17}
        className={cn(
          'shrink-0 transition-transform',
          active ? 'text-white' : 'text-[#6B7280] group-hover:text-[#374151]',
        )}
        aria-hidden
      />
      <span
        className={cn(
          'truncate transition-opacity',
          collapsed ? 'lg:hidden' : 'inline',
        )}
      >
        {label}
      </span>
    </button>
  );
}

function SidebarLink({
  to, label, Icon, collapsed, end, onNavigate, forceInactive = false,
}: SidebarLinkProps): JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium transition-colors',
          collapsed && 'lg:justify-center lg:px-1.5',
          isActive && !forceInactive
            ? 'bg-[#1E3A5F] text-white'
            : 'text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111827]',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={17}
            className={cn(
              'shrink-0 transition-transform',
              isActive && !forceInactive
                ? 'text-white'
                : 'text-[#6B7280] group-hover:text-[#374151]',
            )}
            aria-hidden
          />
          <span
            className={cn(
              'truncate transition-opacity',
              collapsed ? 'lg:hidden' : 'inline',
            )}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

