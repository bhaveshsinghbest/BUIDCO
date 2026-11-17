import { NavLink } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { openMdBriefing, selectCanViewProjects } from '../../features/auth/authSlice';
import { cn } from '../../lib/utils';
import { RoleGate } from '../auth/RoleGate';

/**
 * The primary-nav items live in the left sidebar. This cluster carries the
 * utility pills (Input Sheet / MoM / O&M) and role-gated chips (Audit
 * Trail — MD/Admin; MD Briefing — MD). Rendered by both TopNav (desktop
 * row, `hidden lg:flex`) and Sidebar (mobile drawer, `lg:hidden`) — single
 * source of truth so the two never drift apart.
 */
interface NavItem {
  to: string;
  label: string;
  icon?: string;
  end?: boolean;
}

const UTILITY_NAV_BEFORE_MOM: NavItem[] = [
  { to: '/input-sheet', label: 'Input Sheet', icon: '📋' },
];
const UTILITY_NAV_MOM_ONWARDS: NavItem[] = [
  { to: '/mom', label: 'MoM', icon: '📅' },
  { to: '/om', label: 'O&M', icon: '🔧' },
];

export const utilityLinkClass = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1.5 text-[11.5px] transition-colors border',
    isActive
      ? 'border-transparent bg-[#1E3A5F] font-bold text-white'
      : 'border-[#E5E7EB] bg-white font-medium text-[#374151] hover:bg-[#F9FAFB]',
  );

interface UtilityNavClusterProps {
  /** Called after a link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void;
  className?: string;
}

export function UtilityNavCluster({
  onNavigate, className,
}: UtilityNavClusterProps): JSX.Element {
  // Every link here opens project information (S-03).
  const canViewProjects = useAppSelector(selectCanViewProjects);
  if (!canViewProjects) return <div className={className} />;
  return (
    <div className={className}>
      {UTILITY_NAV_BEFORE_MOM.map((item) => (
        <NavLink key={item.to} to={item.to} className={utilityLinkClass} onClick={onNavigate}>
          {item.icon && <span className="text-[13px]" aria-hidden>{item.icon}</span>}
          {item.label}
        </NavLink>
      ))}
      <RoleGate allow={['MD']}>
        <MdPortfolioBriefingButton {...(onNavigate ? { onNavigate } : {})} />
      </RoleGate>
      {UTILITY_NAV_MOM_ONWARDS.map((item) => (
        <NavLink key={item.to} to={item.to} className={utilityLinkClass} onClick={onNavigate}>
          {item.icon && <span className="text-[13px]" aria-hidden>{item.icon}</span>}
          {item.label}
        </NavLink>
      ))}
      <RoleGate allow={['MD', 'Admin']}>
        <NavLink to="/audit" className={utilityLinkClass} onClick={onNavigate}>
          <span aria-hidden>🕒</span> Audit Trail
        </NavLink>
      </RoleGate>
    </div>
  );
}

function MdPortfolioBriefingButton({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      onClick={() => {
        dispatch(openMdBriefing());
        onNavigate?.();
      }}
      title="Open MD Portfolio Briefing"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-[#1E3A5F] bg-[#1E3A5F] px-2.5 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#162B47]"
    >
      <span aria-hidden>📊</span> MD Portfolio Briefing
    </button>
  );
}
