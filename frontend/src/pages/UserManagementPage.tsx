import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useGetLookupsQuery } from '../app/api/lookupsApi';
import {
  useCreateUserMutation,
  useDeleteUserMutation,
  useListUsersQuery,
  useUpdateUserMutation,
} from '../app/api/usersApi';
import { useAppSelector } from '../app/hooks';
import { selectCurrentUser } from '../features/auth/authSlice';
import { RoleGate } from '../components/auth/RoleGate';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FormField } from '../components/input-sheet/FormField';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches } from '../components/ui/ColumnFilter';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/formatters';
import type { CreateUserPayload, UpdateUserPayload, UserRole, UserRow } from '../types/api';

const ROLE_TONE: Record<UserRole, string> = {
  MD:     'bg-[#F0F4F8] text-[#1E3A5F] border-[#93C5FD]',
  Admin:  'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]',
  PD:     'bg-[#F5F3FF] text-[#6D28D9] border-[#C4B5FD]',
  Viewer: 'bg-[#F9FAFB] text-[#6B7280] border-[#E5E7EB]',
};

/** Deletion hierarchy (Task 2) — mirrors backend's DELETABLE_ROLES in usersService.ts; the backend is the real authorization boundary, this only drives button visibility. */
const DELETABLE_ROLES: Record<UserRole, UserRole[]> = {
  MD: ['Admin', 'PD', 'Viewer'],
  Admin: ['PD', 'Viewer'],
  PD: ['Viewer'],
  Viewer: [],
};

export function UserManagementPage(): JSX.Element {
  const me = useAppSelector(selectCurrentUser);
  const { data, isLoading } = useListUsersQuery();
  const { data: lookups } = useGetLookupsQuery();
  const [createUser, createState] = useCreateUserMutation();
  const [updateUser, updateState] = useUpdateUserMutation();
  const [deleteUser, deleteState] = useDeleteUserMutation();

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const busy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  // Opens the typed-confirmation modal below rather than deleting directly —
  // shared entry point for both the row action button and the edit form's
  // delete button.
  const onDeleteUser = (target: UserRow): void => {
    setDeleteError(null);
    setDeleting(target);
  };

  const canPromote = me?.role === 'MD';
  // MD sees every role; Admin can create Viewer and PD.
  const rolesAvailable: UserRole[] = canPromote
    ? ['MD', 'Admin', 'PD', 'Viewer']
    : ['PD', 'Viewer'];

  const rows = useMemo(() => data?.items ?? [], [data]);
  const usersById = useMemo(() => {
    const map = new Map<number, UserRow>();
    for (const r of rows) map.set(r.userId, r);
    return map;
  }, [rows]);

  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (key: string, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const activeFilterCount = Object.values(colFilters).filter((v) => v.trim() !== '').length;

  const roleFilterOptions = rolesAvailable.map((r) => ({ value: r, label: r }));
  const statusFilterOptions = [
    { value: 'Active', label: 'Active' },
    { value: 'Inactive', label: 'Inactive' },
  ];

  const filteredRows = useMemo(
    () =>
      rows.filter((u) => {
        if (!textMatches(colFilters.username ?? '', u.username)) return false;
        if (!textMatches(colFilters.fullName ?? '', u.fullName)) return false;
        if (!selectMatches(colFilters.role ?? '', u.role)) return false;
        if (!selectMatches(colFilters.status ?? '', u.isActive ? 'Active' : 'Inactive')) return false;
        return true;
      }),
    [rows, colFilters],
  );

  return (
    <RoleGate
      allow={['MD', 'Admin', 'PD']}
      fallback={
        <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm">
          <p className="font-semibold text-[#B91C1C]">
            You don't have permission to manage users.
          </p>
          <NavLink to="/" className="mt-2 inline-block text-[#1D4ED8] hover:underline">
            ← Back to overview
          </NavLink>
        </div>
      }
    >
      <article className="space-y-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#111827]">User Management</h1>
            <p className="text-[12.5px] text-[#6B7280]">
              {me?.role === 'MD'
                ? 'Full control: create any role, toggle project CRUD flags, assign PD divisions, deactivate.'
                : me?.role === 'Admin'
                  ? 'Admin scope: create/edit Viewer and Project Director accounts. Assign divisions and configure project permissions.'
                  : 'PD scope: view and delete Viewer accounts.'}
            </p>
          </div>
          {me?.role !== 'PD' ? (
            <Button onClick={() => setAddOpen((o) => !o)} disabled={busy}>
              {addOpen ? '× Close form' : `+ Add ${canPromote ? 'User' : 'Viewer'}`}
            </Button>
          ) : null}
        </header>

        {addOpen ? (
          <UserForm
            mode="create"
            rolesAvailable={rolesAvailable}
            canPromote={canPromote}
            busy={busy}
            divisionsCatalog={lookups?.divisions ?? []}
            onCancel={() => setAddOpen(false)}
            onSubmit={async (payload) => {
              await createUser(payload as CreateUserPayload).unwrap();
              setAddOpen(false);
            }}
          />
        ) : null}

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-[#F3F4F6] bg-[#F9FAFB] px-3 py-2 text-[11.5px] font-bold text-[#374151]">
                <span>Users ({filteredRows.length}{activeFilterCount > 0 ? ` of ${rows.length}` : ''})</span>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setColFilters({})}
                    className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
                  >
                    Clear column filters ({activeFilterCount})
                  </button>
                ) : null}
              </div>
              {filteredRows.length === 0 ? (
                <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
                  No users match the current column filters.
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left align-top">
                        <div>Username</div>
                        <ColumnFilterText value={colFilters.username ?? ''} onChange={(v) => setColFilter('username', v)} />
                      </th>
                      <th className="px-3 py-2 text-left align-top">
                        <div>Full name</div>
                        <ColumnFilterText value={colFilters.fullName ?? ''} onChange={(v) => setColFilter('fullName', v)} />
                      </th>
                      <th className="px-3 py-2 text-left align-top">
                        <div>Role</div>
                        <ColumnFilterSelect
                          value={colFilters.role ?? ''}
                          onChange={(v) => setColFilter('role', v)}
                          options={roleFilterOptions}
                        />
                      </th>
                      <th className="px-3 py-2 text-left">Divisions (PD)</th>
                      <th className="px-3 py-2 text-center">View</th>
                      <th className="px-3 py-2 text-center">Create</th>
                      <th className="px-3 py-2 text-center">Update</th>
                      <th className="px-3 py-2 text-center">Delete</th>
                      <th className="px-3 py-2 text-left align-top">
                        <div>Status</div>
                        <ColumnFilterSelect
                          value={colFilters.status ?? ''}
                          onChange={(v) => setColFilter('status', v)}
                          options={statusFilterOptions}
                        />
                      </th>
                      <th className="px-3 py-2 text-left">Created by</th>
                      <th className="px-3 py-2 text-left">Last login</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((u, idx) => {
                      const canEdit =
                        me?.role === 'MD'
                        || (me?.role === 'Admin' && (u.role === 'Viewer' || u.role === 'PD'));
                      const isSelf = me?.userId === u.userId;
                      // Delete policy mirrors backend's DELETABLE_ROLES hierarchy
                      // (usersService.ts) — MD→Admin/PD/Viewer, Admin→PD/Viewer, PD→Viewer.
                      const canDelete = !isSelf && (me ? DELETABLE_ROLES[me.role].includes(u.role) : false);
                      const createdByLabel = u.createdBy
                        ? usersById.get(u.createdBy)?.username ?? `#${u.createdBy}`
                        : '—';
                      const divisionsLabel = u.role === 'PD'
                        ? (u.divisions.length === 0
                            ? '—'
                            : u.divisions
                                .map((id) => lookups?.divisions.find((d) => d.divisionId === id)?.divisionName ?? `#${id}`)
                                .join(', '))
                        : '—';
                      return (
                        <tr
                          key={u.userId}
                          className={cn(
                            'border-b border-[#F3F4F6]',
                            idx % 2 === 1 && 'bg-[#FAFAFA]',
                            u.isActive === false && 'opacity-60',
                          )}
                        >
                          <td className="px-3 py-2 text-[#9CA3AF]">{idx + 1}</td>
                          <td className="px-3 py-2 font-semibold text-[#111827]">
                            {u.username}
                            {isSelf ? (
                              <span className="ml-1 text-[10px] text-[#1D4ED8]">(you)</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-[#374151]">{u.fullName ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'inline-flex rounded border px-2 py-0.5 text-[10.5px] font-bold',
                                ROLE_TONE[u.role],
                              )}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-[#374151]">
                            {u.role === 'PD' ? (
                              <span title={divisionsLabel} className="line-clamp-2 max-w-[220px] text-[11px]">
                                {divisionsLabel}
                              </span>
                            ) : (
                              <span className="text-[#D1D5DB]">—</span>
                            )}
                          </td>
                          <PermCell
                            enabled={u.role === 'MD' || u.canViewProjects}
                            bypassed={u.role === 'MD'}
                          />
                          <PermCell
                            enabled={u.role === 'MD' || u.canCreateProjects}
                            bypassed={u.role === 'MD'}
                          />
                          <PermCell
                            enabled={u.role === 'MD' || u.canUpdateProjects}
                            bypassed={u.role === 'MD'}
                          />
                          <PermCell
                            enabled={u.role === 'MD' || u.canDeleteProjects}
                            bypassed={u.role === 'MD'}
                          />
                          <td className="px-3 py-2">
                            {u.isActive ? (
                              <span className="rounded-full bg-[#F0FDF4] px-2 py-0.5 text-[10.5px] font-semibold text-[#15803D]">
                                Active
                              </span>
                            ) : (
                              <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10.5px] font-semibold text-[#B91C1C]">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[#6B7280]">{createdByLabel}</td>
                          <td className="px-3 py-2 tabular-nums text-[#6B7280]">
                            {formatDate(u.lastLogin)}
                          </td>
                          <td className="px-3 py-2">
                            {canEdit || canDelete ? (
                              <div className="flex items-center gap-1.5">
                                {canEdit ? (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => setEditing(u)}
                                    disabled={busy}
                                  >
                                    Edit
                                  </Button>
                                ) : null}
                                {canDelete ? (
                                  <Button
                                    size="xs"
                                    variant="destructive"
                                    onClick={() => onDeleteUser(u)}
                                    disabled={busy}
                                    title={`Delete ${u.username}`}
                                  >
                                    Delete
                                  </Button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-[10.5px] text-[#9CA3AF]">Read-only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {editing ? (
          <UserForm
            mode="edit"
            initial={editing}
            rolesAvailable={rolesAvailable}
            canPromote={canPromote}
            busy={busy}
            isSelf={me?.userId === editing.userId}
            divisionsCatalog={lookups?.divisions ?? []}
            canDeleteUser={me ? DELETABLE_ROLES[me.role].includes(editing.role) : false}
            onDeleteUser={() => onDeleteUser(editing)}
            onCancel={() => setEditing(null)}
            onSubmit={async (payload) => {
              await updateUser({ userId: editing.userId, body: payload as UpdateUserPayload }).unwrap();
              setEditing(null);
            }}
          />
        ) : null}

        {deleting ? (
          <DeleteUserConfirm
            user={deleting}
            busy={deleteState.isLoading}
            errorText={deleteError}
            onCancel={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            onConfirm={async () => {
              try {
                await deleteUser(deleting.userId).unwrap();
                setDeleting(null);
                setDeleteError(null);
              } catch (e) {
                setDeleteError(extractApiErrorMessage(e));
              }
            }}
          />
        ) : null}
      </article>
    </RoleGate>
  );
}

/**
 * Confirmation modal for deleting a user. Blocks the destructive action
 * behind a typed username check so a stray click can't wipe an account.
 */
function DeleteUserConfirm({
  user, busy, errorText, onCancel, onConfirm,
}: {
  user: UserRow;
  busy: boolean;
  errorText: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  const matches = typed === user.username;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-user-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
    >
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <div className="relative w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white shadow-2xl">
        <header className="rounded-t-xl border-b border-[#F3F4F6] bg-[#FEF2F2] px-5 py-4">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#B91C1C]">
            ⚠ Destructive action
          </p>
          <h3 id="delete-user-title" className="mt-0.5 text-[16px] font-bold text-[#111827]">
            Delete user <span className="text-[#B91C1C]">{user.username}</span>?
          </h3>
        </header>

        <div className="space-y-3 px-5 py-4 text-[13px] text-[#374151]">
          <p>
            This will permanently remove <strong>{user.fullName || user.username}</strong>{' '}
            <span className="text-[#6B7280]">
              ({user.role}
              {user.role === 'PD' && user.divisions.length > 0
                ? ` · ${user.divisions.length} division${user.divisions.length === 1 ? '' : 's'}`
                : ''}
              )
            </span>{' '}
            from BUIDCO. They will lose access immediately and cannot sign
            in again unless recreated.
          </p>
          <p className="text-[12px] text-[#6B7280]">
            Historical audit entries and project records they created will
            remain intact.
          </p>
          <label className="mt-2 grid gap-1 text-[12px] font-semibold text-[#374151]">
            Type <span className="rounded bg-[#F3F4F6] px-1 py-0.5 font-mono text-[11px] text-[#B91C1C]">{user.username}</span> to confirm:
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              autoFocus
              className="h-9 w-full rounded border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-1"
              autoComplete="off"
            />
          </label>
          {errorText ? (
            <p
              role="alert"
              className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12px] font-medium text-[#B91C1C]"
            >
              {errorText}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 rounded-b-xl border-t border-[#F3F4F6] bg-[#F9FAFB] px-5 py-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={busy || !matches}
            title={matches ? undefined : `Type "${user.username}" to enable`}
          >
            {busy ? 'Deleting…' : 'Delete user'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function extractApiErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Delete failed. Please try again.';
  const anyErr = err as { status?: number; data?: { error?: { message?: string } } };
  return anyErr.data?.error?.message ?? `Delete failed (HTTP ${anyErr.status ?? '?'})`;
}

function PermCell({
  enabled,
  bypassed,
}: {
  enabled: boolean;
  bypassed: boolean;
}): JSX.Element {
  if (bypassed) {
    return (
      <td className="px-3 py-2 text-center">
        <span
          className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10.5px] font-bold text-[#1D4ED8]"
          title="MD role bypasses granular flags — always allowed."
        >
          MD ★
        </span>
      </td>
    );
  }
  return (
    <td className="px-3 py-2 text-center">
      {enabled ? (
        <span className="text-[#15803D]" aria-label="Enabled">
          ✓
        </span>
      ) : (
        <span className="text-[#B91C1C]" aria-label="Disabled">
          ✕
        </span>
      )}
    </td>
  );
}

interface FormPayload {
  username?: string;
  password?: string;
  fullName?: string | null;
  role?: UserRole;
  isActive?: boolean;
  canCreateProjects?: boolean;
  canUpdateProjects?: boolean;
  canDeleteProjects?: boolean;
  canViewProjects?: boolean;
  divisions?: number[];
  email?: string | null;
  mobileNumber?: string | null;
}

interface UserFormProps {
  mode: 'create' | 'edit';
  initial?: UserRow;
  rolesAvailable: UserRole[];
  canPromote: boolean;
  busy: boolean;
  isSelf?: boolean;
  divisionsCatalog: Array<{ divisionId: number; divisionName: string; regionId: number }>;
  /** Whether the current actor may delete this row, per the role hierarchy (edit mode only). */
  canDeleteUser?: boolean;
  onDeleteUser?: () => void;
  onCancel: () => void;
  onSubmit: (payload: FormPayload) => Promise<void>;
}

function UserForm({
  mode,
  initial,
  rolesAvailable,
  canPromote,
  busy,
  isSelf,
  divisionsCatalog,
  canDeleteUser,
  onDeleteUser,
  onCancel,
  onSubmit,
}: UserFormProps): JSX.Element {
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [role, setRole] = useState<UserRole>(initial?.role ?? 'Viewer');
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [canCreate, setCanCreate] = useState<boolean>(initial?.canCreateProjects ?? false);
  const [canUpdate, setCanUpdate] = useState<boolean>(initial?.canUpdateProjects ?? false);
  const [canDelete, setCanDelete] = useState<boolean>(initial?.canDeleteProjects ?? false);
  const [canView,   setCanView]   = useState<boolean>(initial?.canViewProjects ?? true);
  const [divisions, setDivisions] = useState<number[]>(initial?.divisions ?? []);
  const [email, setEmail] = useState(initial?.email ?? '');
  const [mobileNumber, setMobileNumber] = useState(initial?.mobileNumber ?? '');
  const [error, setError] = useState<string | null>(null);

  const canEditRole = mode === 'create' ? true : canPromote && !isSelf;

  const submit = async (): Promise<void> => {
    setError(null);
    if (mode === 'create' && username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (mode === 'create' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (mode === 'edit' && password && password.length < 8) {
      setError('Password must be at least 8 characters (or leave blank to keep unchanged).');
      return;
    }
    if (role === 'PD' && divisions.length === 0) {
      setError('A Project Director must be assigned at least one division.');
      return;
    }

    const payload: FormPayload = {
      fullName: fullName.trim() || null,
      canCreateProjects: canCreate,
      canUpdateProjects: canUpdate,
      canDeleteProjects: canDelete,
      canViewProjects:   canView,
      email: email.trim() || null,
      mobileNumber: mobileNumber.trim() || null,
    };
    if (mode === 'create') {
      payload.username = username.trim();
      payload.password = password;
      payload.role = role;
    } else {
      if (password) payload.password = password;
      if (canEditRole) payload.role = role;
      payload.isActive = isActive;
    }
    // Only send divisions when relevant to prevent accidentally wiping.
    if (role === 'PD' || initial?.role === 'PD') {
      payload.divisions = divisions;
    }

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(readError(err));
    }
  };

  const isMdRole = role === 'MD';
  const isPdRole = role === 'PD';

  return (
    <div className="space-y-3 rounded-lg border border-[#93C5FD] bg-[#F0F7FF] p-4">
      <h2 className="text-sm font-bold text-[#1D4ED8]">
        {mode === 'create' ? 'Create user' : `Edit ${initial?.username}`}
      </h2>

      {error ? (
        <div className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B91C1C]">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {mode === 'create' ? (
          <FormField
            label="Username"
            value={username}
            onChange={setUsername}
            required
            hint="3–60 characters, unique."
          />
        ) : (
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#374151]">
              Username
            </div>
            <div className="mt-1 flex h-9 items-center rounded border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-[13px] text-[#6B7280]">
              {initial?.username}
              <span className="ml-2 text-[10.5px]">(not editable)</span>
            </div>
          </div>
        )}
        <FormField label="Full name" value={fullName} onChange={setFullName} />
        <FormField
          label="Email"
          value={email}
          onChange={setEmail}
          hint="Used for Forgot Password OTP delivery."
        />
        <FormField
          label="Mobile number"
          value={mobileNumber}
          onChange={setMobileNumber}
          hint="Used for Forgot Password OTP delivery (SMS not yet wired up)."
        />
        <FormField
          label={mode === 'create' ? 'Password' : 'New password (blank = unchanged)'}
          value={password}
          onChange={setPassword}
          required={mode === 'create'}
          hint="Minimum 8 characters."
        />
        <FormField
          label="Role"
          type="select"
          value={role}
          onChange={(v) => setRole(v as UserRole)}
          options={rolesAvailable as unknown as string[]}
          disabled={!canEditRole}
          hint={!canEditRole ? (isSelf ? "Can't change your own role." : 'Admin cannot promote roles.') : ''}
        />
        {mode === 'edit' ? (
          <FormField
            label="Status"
            type="select"
            value={isActive ? 'Active' : 'Inactive'}
            onChange={(v) => setIsActive(v === 'Active')}
            options={['Active', 'Inactive']}
            disabled={isSelf ?? false}
            hint={isSelf ? "Can't deactivate yourself." : ''}
          />
        ) : null}
      </div>

      {/* ── PD-only: division assignment ─────────────────────────────── */}
      {isPdRole ? (
        <div className="rounded border border-[#C4B5FD] bg-[#F5F3FF] p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#6D28D9]">
            ▌ Division assignment · Project Director
          </div>
          <p className="mt-1 text-[12px] text-[#4B5563]">
            The PD picks one of these at each login; only projects in the
            chosen division are visible for that session. Assign at least one.
          </p>
          <div className="mt-2 max-h-56 overflow-y-auto rounded border border-[#DDD6FE] bg-white p-2">
            {divisionsCatalog.length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF]">No divisions configured yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
                {divisionsCatalog.map((d) => {
                  const on = divisions.includes(d.divisionId);
                  return (
                    <label
                      key={d.divisionId}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] transition-colors',
                        on
                          ? 'bg-[#EDE9FE] font-semibold text-[#6D28D9]'
                          : 'text-[#374151] hover:bg-[#F9FAFB]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          setDivisions((prev) =>
                            e.target.checked
                              ? [...prev, d.divisionId]
                              : prev.filter((id) => id !== d.divisionId),
                          );
                        }}
                        className="h-3.5 w-3.5"
                      />
                      {d.divisionName}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-2 text-[11px] text-[#6B7280]">
            {divisions.length} assigned
            {divisions.length > 0 ? (
              <button
                type="button"
                onClick={() => setDivisions([])}
                className="ml-2 text-[#B91C1C] hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded border border-[#E5E7EB] bg-white p-3">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#374151]">
          ▌ Project permissions
        </div>
        {isMdRole ? (
          <p className="mt-1 text-[12px] text-[#1D4ED8]">
            💡 MD role bypasses these flags — always allowed to view/create/update/delete any project.
          </p>
        ) : (
          <p className="mt-1 text-[12px] text-[#6B7280]">
            Toggle each action independently. Admin role always keeps all four on by default.
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <PermToggle
            label="Can view projects"
            checked={canView || isMdRole}
            disabled={isMdRole}
            onChange={setCanView}
          />
          <PermToggle
            label="Can create projects"
            checked={canCreate || isMdRole}
            disabled={isMdRole}
            onChange={setCanCreate}
          />
          <PermToggle
            label="Can update projects"
            checked={canUpdate || isMdRole}
            disabled={isMdRole}
            onChange={setCanUpdate}
          />
          <PermToggle
            label="Can delete projects"
            checked={canDelete || isMdRole}
            disabled={isMdRole}
            onChange={setCanDelete}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[#BFDBFE] pt-3">
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save changes'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {mode === 'edit' && canDeleteUser && onDeleteUser ? (
          <Button variant="destructive" onClick={onDeleteUser} disabled={busy} className="ml-auto">
            Delete user
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PermToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <label
      className={cn(
        'flex items-center gap-2 rounded border px-3 py-2 text-[12.5px]',
        checked
          ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
          : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-[#D1D5DB]"
      />
      <span className="font-semibold">{label}</span>
    </label>
  );
}

function readError(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const e = (data as { error?: { message?: string } }).error;
      if (e?.message) return e.message;
    }
  }
  return 'Something went wrong. Please retry.';
}
