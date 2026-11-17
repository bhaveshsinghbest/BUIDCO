import { Link, Outlet } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectCanViewProjects, selectCurrentUser } from '../../features/auth/authSlice';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

/**
 * Route guard for every screen that shows project information (security
 * finding S-03). The API is the real boundary — it answers 403
 * FORBIDDEN_VIEW to an account without "Can view projects" — so this only
 * stops the UI from opening pages that could not load, including when the
 * address is typed directly.
 */
export function ProjectViewGuard(): JSX.Element {
  const canView = useAppSelector(selectCanViewProjects);
  return canView ? <Outlet /> : <NoProjectAccess />;
}

function NoProjectAccess(): JSX.Element {
  const user = useAppSelector(selectCurrentUser);
  const canOpenUsers = user?.role === 'Admin' || user?.role === 'PD';
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>No access to project information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#6B7280]">
            Your account does not have the &ldquo;Can view projects&rdquo; permission, so dashboards,
            projects, funds, MoM and related pages are not available. Ask an MD or Admin to grant it.
          </p>
          {canOpenUsers ? (
            <Link
              to="/users"
              className="inline-flex h-9 items-center justify-center rounded bg-[#1E3A5F] px-4 text-sm font-medium text-white hover:bg-[#152a48]"
            >
              Go to User Management
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
