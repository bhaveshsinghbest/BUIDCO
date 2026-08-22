import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useLogoutMutation } from '../../app/api/authApi';
import { useGetLookupsQuery } from '../../app/api/lookupsApi';
import { useAppSelector } from '../../app/hooks';
import { selectCurrentUser } from '../../features/auth/authSlice';
import type { UserRole } from '../../types/api';

/** Full-form role labels for the header user pill (PD_role.md §2/§3). */
const ROLE_DISPLAY: Record<UserRole, string> = {
  MD: 'Managing Director',
  Admin: 'Admin',
  PD: 'Project Director',
  Viewer: 'Viewer',
};

interface Props {
  /** Stacked, narrow layout for the mobile sidebar footer (fixed 240px
   *  drawer) instead of the wide single-row desktop TopNav pill. */
  compact?: boolean;
}

/**
 * Header user pill (PD_role.md §2/§3). Self-contained — owns its own auth/
 * lookups/logout wiring so it can be dropped into both the desktop TopNav
 * row and the mobile sidebar footer with no props threaded through parents.
 *
 *   All roles → Username · Role
 *   PDs      → Username · Role · Division (matches the JWT's session division;
 *              updates automatically if the divisionId in Redux changes)
 */
export function UserPill({ compact = false }: Props): JSX.Element {
  const { data: lookups } = useGetLookupsQuery();
  const user = useAppSelector(selectCurrentUser);
  const [logout, { isLoading: loggingOut }] = useLogoutMutation();
  const navigate = useNavigate();

  const divisionName = user?.role === 'PD' && user.divisionId !== undefined
    ? lookups?.divisions.find((d) => d.divisionId === user.divisionId)?.divisionName
        ?? `#${user.divisionId}`
    : null;

  const onSignOut = async (): Promise<void> => {
    try {
      await logout().unwrap();
    } catch {
      /* clearCredentials still fires from the mutation's onQueryStarted finally. */
    }
    navigate('/login', { replace: true });
  };

  const displayName = user?.fullName || user?.username || '—';
  const roleLabel = user ? (ROLE_DISPLAY[user.role] ?? user.role) : '—';
  // Full descriptor for the tooltip so truncation doesn't hide data.
  const fullDescriptor = [displayName, roleLabel, divisionName]
    .filter(Boolean)
    .join(' · ');

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2"
        title={fullDescriptor}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22C55E]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold text-[#111827]">{displayName}</div>
          <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
            {roleLabel}
            {divisionName ? <span className="text-[#6D28D9]"> · {divisionName}</span> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onSignOut()}
          disabled={loggingOut}
          aria-label={loggingOut ? 'Signing out…' : 'Sign out'}
          title={loggingOut ? 'Signing out…' : 'Sign out'}
          className="shrink-0 cursor-pointer rounded border border-transparent bg-white p-1.5 text-[#6B7280] transition-colors hover:border-[#FCA5A5] hover:bg-[#FEF2F2] hover:text-[#B91C1C] disabled:opacity-60"
        >
          <LogOut size={15} aria-hidden />
        </button>
      </div>
    );
  }

  // Compact single-row pill: dot · Name · role/division · sign-out.
  // Fits within the 50px header without vertical overflow.
  return (
    <div
      className="flex h-8 items-center gap-2 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white pl-2.5 pr-1"
      title={fullDescriptor}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22C55E]" aria-hidden />
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="max-w-[110px] truncate text-[11.5px] font-bold text-[#111827]">
          {displayName}
        </span>
        <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#6B7280]">
          {roleLabel}
        </span>
        {divisionName ? (
          <>
            <span aria-hidden className="text-[9.5px] leading-none text-[#D1D5DB]">·</span>
            <span className="max-w-[90px] truncate text-[9.5px] font-semibold uppercase tracking-wider text-[#6D28D9]">
              {divisionName}
            </span>
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void onSignOut()}
        disabled={loggingOut}
        className="ml-1 shrink-0 cursor-pointer rounded border border-transparent bg-white px-2 py-1 text-[10.5px] font-medium text-[#6B7280] transition-colors hover:border-[#FCA5A5] hover:bg-[#FEF2F2] hover:text-[#B91C1C] disabled:opacity-60"
      >
        {loggingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
