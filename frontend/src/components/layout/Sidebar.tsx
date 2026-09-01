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
  Wallet,
  X,
} from 'lucide-react';
import { useAppSelector } from '../../app/hooks';
import { selectCurrentUser } from '../../features/auth/authSlice';
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
  /** Opens the KPI reference guide drawer (mobile copy of TopNav's button). */
  onOpenKpiGuide: () => void;
}

export function Sidebar({
  collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, onOpenTenderDashboard, onOpenKpiGuide,
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
          'sticky top-[50px] z-40 flex h-[calc(100vh-50px)] shrink-0 flex-col border-r border-[#E5E7EB] bg-white transition-all duration-200',
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
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Primary">
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
                onClick={() => {
                  onCloseMobile();
                  onOpenTenderDashboard();
                }}
              />
            </li>
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
              onOpenKpiGuide={onOpenKpiGuide}
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
}

/**
 * Same visual grammar as SidebarLink but for actions that open a modal
 * rather than navigating. No `isActive` state — the modal manages its own
 * open/closed lifecycle.
 */
function SidebarButton({
  label, Icon, collapsed, onClick,
}: {
  label: string;
  Icon: typeof LayoutDashboard;
  collapsed: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] font-medium text-[#4B5563] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]',
        collapsed && 'lg:justify-center lg:px-1.5',
      )}
    >
      <Icon
        size={17}
        className="shrink-0 text-[#6B7280] group-hover:text-[#374151]"
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
  to, label, Icon, collapsed, end, onNavigate,
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
          isActive
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
              isActive ? 'text-white' : 'text-[#6B7280] group-hover:text-[#374151]',
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

