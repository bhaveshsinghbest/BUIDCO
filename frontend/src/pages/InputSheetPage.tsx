import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useListCosEotForProjectQuery } from '../app/api/cosEotApi';
import { useListFundsUcQuery } from '../app/api/fundsUcApi';
import { useListGeoPhotosQuery } from '../app/api/geoPhotosApi';
import { useListMgmtActionsForProjectQuery } from '../app/api/mgmtActionsApi';
import {
  useCreateProjectMutation,
  useGetProjectQuery,
  useUpdateProjectMutation,
} from '../app/api/projectsApi';
import { useAppSelector } from '../app/hooks';
import { selectCurrentUser } from '../features/auth/authSlice';
import { RoleGate } from '../components/auth/RoleGate';
import { ActionRemarksSection } from '../components/input-sheet/ActionRemarksSection';
import { BasicInfoSection } from '../components/input-sheet/BasicInfoSection';
import { ContractSecuritySection } from '../components/input-sheet/ContractSecuritySection';
import { CosEotSection } from '../components/input-sheet/CosEotSection';
import { FundingSourceSection } from '../components/input-sheet/FundingSourceSection';
import { GeoTaggingSection } from '../components/input-sheet/GeoTaggingSection';
import { ImportProjectDialog } from '../components/input-sheet/ImportProjectDialog';
import { OmDetailsSection } from '../components/input-sheet/OmDetailsSection';
import { PhaseDatesSection } from '../components/input-sheet/PhaseDatesSection';
import { ProgressFinancialSection } from '../components/input-sheet/ProgressFinancialSection';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { draftToPayload, useProjectDraft } from '../hooks/useProjectDraft';
import templateUrl from '../assets/Template.xlsx';

type SectionId =
  | 'basic'
  | 'phase'
  | 'progress'
  | 'cos'
  | 'contract'
  | 'geo'
  | 'action'
  | 'om'
  | 'funding';

interface SectionDef {
  id: SectionId;
  label: string;
}

type SectionGroup = 'all' | 'fixed' | 'variable';

/**
 * Fixed Inputs — Basic Info + Contract & Security. Only MD/Admin may edit.
 * Backend also enforces this (see `FIXED_INPUT_KEYS` in projectsService).
 * Sub-tabs are numbered 01..N within the group (not globally) so the
 * sequence matches what a user actually clicks through.
 */
const FIXED_SECTIONS: SectionDef[] = [
  { id: 'basic', label: '01 Basic Info' },
  { id: 'contract', label: '02 Contract & Security' },
];

/** Variable Inputs — everything else. Editable by anyone with canUpdate. */
const VARIABLE_SECTIONS: SectionDef[] = [
  { id: 'phase', label: '01 Phase & Dates' },
  { id: 'progress', label: '02 Progress & Financial' },
  { id: 'cos', label: '03 CoS / EoT' },
  { id: 'geo', label: '04 GeoTagging' },
  { id: 'action', label: '05 Action & Remarks' },
  { id: 'om', label: '06 O&M Details' },
  { id: 'funding', label: '07 Funding Source' },
];

const FIXED_IDS = new Set<SectionId>(FIXED_SECTIONS.map((s) => s.id));

/** Which group a given section belongs to. */
function groupOf(id: SectionId): SectionGroup {
  return FIXED_IDS.has(id) ? 'fixed' : 'variable';
}

/**
 * "ALL Fields" is a special group that renders every section stacked on one
 * page — no sub-tabs. `section` is meaningless when this group is active.
 */
const ALL_GROUP: SectionGroup = 'all';


export function InputSheetPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const isEdit = Boolean(projectId);
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  // MD bypasses granular flags (matches backend requireProjectCreate/Update).
  const canCreate = currentUser?.role === 'MD' || Boolean(currentUser?.canCreateProjects);
  const canUpdate = currentUser?.role === 'MD' || Boolean(currentUser?.canUpdateProjects);
  // Only MD + Admin can change Fixed Input sections (Basic Info + Contract &
  // Security). Backend also strips those keys from PD/Viewer patches, so this
  // is UX polish that matches the security boundary.
  const canEditFixed = currentUser?.role === 'MD' || currentUser?.role === 'Admin';
  // Creating a project always touches Fixed Input fields (projectName etc.),
  // so non-Admin/MD can never create — regardless of canCreateProjects.
  const canSave = isEdit ? canUpdate : (canCreate && canEditFixed);

  const detail = useGetProjectQuery(projectId ?? '', { skip: !isEdit });
  const cosEot = useListCosEotForProjectQuery(projectId ?? '', { skip: !isEdit });
  const mgmt = useListMgmtActionsForProjectQuery(projectId ?? '', { skip: !isEdit });
  const photos = useListGeoPhotosQuery(projectId ?? '', { skip: !isEdit });
  const fundsUc = useListFundsUcQuery(undefined, { skip: !isEdit });
  const fundsUcEntry = fundsUc.data?.items.find((e) => e.projectId === projectId) ?? null;

  const { draft, setField, isDirty } = useProjectDraft(detail.data ?? null);
  const [createProject, createState] = useCreateProjectMutation();
  const [updateProject, updateState] = useUpdateProjectMutation();

  const [importOpen, setImportOpen] = useState(false);
  const [section, setSection] = useState<SectionId>('basic');
  // Open on the ALL Fields group by default — it renders every section in
  // sequential order and is the fastest way to scan the whole form.
  const [groupOverride, setGroupOverride] = useState<SectionGroup | null>(ALL_GROUP);
  const [flash, setFlash] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const activeGroup: SectionGroup = groupOverride ?? groupOf(section);
  const activeSubTabs =
    activeGroup === 'fixed'
      ? FIXED_SECTIONS
      : activeGroup === 'variable'
        ? VARIABLE_SECTIONS
        : [];

  /**
   * Clicking a top-level tab jumps to that group's first sub-section (or the
   * unified view for "ALL Fields"). If the user is already inside that group
   * we keep them on their current sub-tab so a stray click doesn't lose their
   * place.
   */
  const openGroup = (g: SectionGroup): void => {
    if (g === activeGroup) return;
    if (g === ALL_GROUP) {
      setGroupOverride(ALL_GROUP);
      return;
    }
    setGroupOverride(null);
    setSection((g === 'fixed' ? FIXED_SECTIONS : VARIABLE_SECTIONS)[0]!.id);
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const busy = createState.isLoading || updateState.isLoading;

  const handleSave = async (): Promise<void> => {
    if (!draft.projectName.trim()) {
      setFlash({ text: 'Project Name is required.', kind: 'err' });
      setSection('basic');
      return;
    }
    try {
      const payload = draftToPayload(draft);
      if (isEdit && projectId) {
        await updateProject({ projectId, body: payload }).unwrap();
        setFlash({ text: 'Project updated.', kind: 'ok' });
      } else {
        const created = await createProject(payload).unwrap();
        setFlash({ text: 'Project created — switching to edit mode.', kind: 'ok' });
        navigate(`/input-sheet/${created.projectId}`, { replace: true });
      }
    } catch (err) {
      setFlash({ text: readError(err), kind: 'err' });
    }
  };

  if (isEdit && detail.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isEdit && (detail.error || !detail.data)) {
    const status =
      typeof detail.error === 'object' && detail.error && 'status' in detail.error
        ? (detail.error as { status?: number }).status
        : undefined;
    return (
      <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm">
        <p className="font-semibold text-[#B91C1C]">
          {status === 404 ? 'This project does not exist.' : 'Could not load project.'}
        </p>
        <NavLink to="/projects" className="mt-2 inline-block text-[#1D4ED8] hover:underline">
          ← Back to all projects
        </NavLink>
      </div>
    );
  }

  return (
    <RoleGate
      // PD is included: whether they can actually create/update is enforced
      // by their canCreateProjects/canUpdateProjects flags (checked below
      // and by the backend). Locking PD out of the page entirely blocks
      // even the ones the Admin has granted create/update permission to.
      allow={['Admin', 'MD', 'PD']}
      fallback={
        <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm">
          <p className="font-semibold text-[#B91C1C]">
            You don&apos;t have permission to edit projects.
          </p>
          <p className="mt-1 text-[#6B7280]">Viewer role is read-only for the Input Sheet.</p>
          <NavLink to="/projects" className="mt-2 inline-block text-[#1D4ED8] hover:underline">
            ← Back to all projects
          </NavLink>
        </div>
      }
    >
      <article className="space-y-4">
        <header className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                <NavLink to="/projects" className="text-[#1D4ED8] hover:underline">
                  ← All projects
                </NavLink>
                {isEdit && projectId ? (
                  <NavLink
                    to={`/projects/${projectId}`}
                    className="ml-3 text-[#1D4ED8] hover:underline"
                  >
                    View detail →
                  </NavLink>
                ) : null}
              </p>
              <h1 className="text-xl font-bold tracking-tight text-[#111827]">
                {isEdit ? draft.projectName || '(Untitled)' : 'Add New Project'}
              </h1>
              <p className="text-[12px] text-[#6B7280]">
                Only Project Name is required.{' '}
                {isDirty ? (
                  <span className="ml-1 font-bold text-[#B45309]">Unsaved changes</span>
                ) : null}
                {!canSave ? (
                  <span className="ml-1 font-bold text-[#B91C1C]">
                    ·{' '}
                    {!isEdit && !canEditFixed
                      ? 'Read-only (MD/Admin only can create — Basic Info + Contract & Security are Fixed Inputs)'
                      : `Read-only (${isEdit ? 'update' : 'create'} permission not granted)`}
                  </span>
                ) : null}
                {canSave && !canEditFixed && isEdit ? (
                  <span className="ml-1 font-bold text-[#92400E]">
                    · Fixed Input sections locked to MD/Admin
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isEdit ? (
                <>
                  <a
                    href={templateUrl}
                    download="BUIDCO_Project_Import_Template.xlsx"
                    className="inline-flex h-9 items-center justify-center rounded border border-[#D1D5DB] bg-white px-4 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB]"
                  >
                    ⬇ Download Template
                  </a>
                  <Button
                    variant="outline"
                    onClick={() => setImportOpen(true)}
                    disabled={!canSave}
                    title={!canSave ? 'Your account cannot create projects. Ask an Admin.' : undefined}
                  >
                    ⬆ Import Project
                  </Button>
                </>
              ) : null}
              <Button
                onClick={handleSave}
                disabled={busy || !canSave}
                title={
                  !canSave
                    ? isEdit
                      ? 'Your account cannot update projects. Ask an Admin.'
                      : 'Your account cannot create projects. Ask an Admin.'
                    : undefined
                }
              >
                {busy ? 'Saving…' : isEdit ? '✓ Save Changes' : '✓ Create Project'}
              </Button>
            </div>
          </div>
          {flash ? (
            <div
              className={cn(
                'mt-3 rounded border px-3 py-2 text-[12.5px]',
                flash.kind === 'ok'
                  ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                  : 'border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]',
              )}
            >
              {flash.text}
            </div>
          ) : null}
        </header>

        {/*
          Two-level navigation:
            • Top row — segmented-control style tabs: "Fixed Inputs" and
              "Variable Inputs". Clicking either opens its sub-tab strip.
            • Bottom row — the active group's sub-tabs, renumbered 01..N
              per group so the sequence reflects what the user sees.
          Fixed Inputs shows a 🔒 for non-MD/Admin users so the read-only
          status of Basic Info + Contract & Security is obvious at a glance.
        */}
        <div className="space-y-2">
          <div
            role="tablist"
            aria-label="Input group"
            className="flex w-full flex-wrap gap-1 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-1 shadow-inner sm:inline-flex sm:w-auto sm:flex-nowrap sm:gap-0"
          >
            <GroupTab
              label="ALL Fields"
              count={FIXED_SECTIONS.length + VARIABLE_SECTIONS.length}
              active={activeGroup === 'all'}
              locked={false}
              onClick={() => openGroup('all')}
            />
            <GroupTab
              label="Fixed Inputs"
              count={FIXED_SECTIONS.length}
              active={activeGroup === 'fixed'}
              locked={!canEditFixed}
              lockedNote="MD/Admin only"
              onClick={() => openGroup('fixed')}
            />
            <GroupTab
              label="Variable Inputs"
              count={VARIABLE_SECTIONS.length}
              active={activeGroup === 'variable'}
              locked={false}
              onClick={() => openGroup('variable')}
            />
          </div>

          {activeGroup !== 'all' ? (
            <nav
              role="tablist"
              aria-label={`${activeGroup === 'fixed' ? 'Fixed' : 'Variable'} input sub-sections`}
              className="flex flex-wrap gap-0.5 border-b-2 border-[#E5E7EB]"
            >
              {activeSubTabs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={section === s.id}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    '-mb-0.5 inline-flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2 text-[11.5px] font-semibold transition-colors',
                    section === s.id
                      ? 'border-[#1E3A5F] text-[#1E3A5F]'
                      : 'border-transparent text-[#6B7280] hover:text-[#374151]',
                  )}
                >
                  {activeGroup === 'fixed' && !canEditFixed ? (
                    <span aria-hidden className="text-[10px]">🔒</span>
                  ) : null}
                  {s.label}
                </button>
              ))}
            </nav>
          ) : null}
        </div>

        {/*
          Render order:
            Fixed / Variable tabs — only the picked `section` renders (position
              in JSX below is irrelevant; per-section default `num` prop is used).
            ALL Fields tab — every section renders in JSX order. Contract &
              Financial Security is intentionally slotted AFTER CoS/EoT here
              per the request; explicit `num` overrides give the ALL tab a
              clean sequential 01..09 numbering.
        */}
        <div className={activeGroup === 'all' ? 'space-y-4' : undefined}>
          {activeGroup === 'all' || section === 'basic' ? (
            <BasicInfoSection
              draft={draft}
              setField={setField}
              readOnly={!canEditFixed}
              {...(activeGroup === 'all' ? { num: '01' } : {})}
            />
          ) : null}
          {activeGroup === 'all' || section === 'phase' ? (
            <PhaseDatesSection
              projectId={projectId ?? null}
              draft={draft}
              setField={setField}
              cosItems={cosEot.data?.items ?? []}
              {...(activeGroup === 'all' ? { num: '02' } : {})}
            />
          ) : null}
          {activeGroup === 'all' || section === 'progress' ? (
            <ProgressFinancialSection
              draft={draft}
              setField={setField}
              cosItems={cosEot.data?.items ?? []}
              {...(activeGroup === 'all' ? { num: '03' } : {})}
            />
          ) : null}
          {activeGroup === 'all' || section === 'cos' ? (
            <CosEotSection
              projectId={projectId ?? null}
              items={cosEot.data?.items ?? []}
              {...(activeGroup === 'all' ? { num: '04' } : {})}
            />
          ) : null}
          {activeGroup === 'all' || section === 'contract' ? (
            <ContractSecuritySection
              draft={draft}
              setField={setField}
              readOnly={!canEditFixed}
              {...(activeGroup === 'all' ? { num: '05' } : {})}
            />
          ) : null}
          {activeGroup === 'all' || section === 'geo' ? (
            <GeoTaggingSection
              projectId={projectId ?? null}
              draft={draft}
              setField={setField}
              photos={photos.data?.items ?? []}
              {...(activeGroup === 'all' ? { num: '06' } : {})}
            />
          ) : null}
          {activeGroup === 'all' || section === 'action' ? (
            <ActionRemarksSection
              projectId={projectId ?? null}
              draft={draft}
              setField={setField}
              actions={mgmt.data?.items ?? []}
              {...(activeGroup === 'all' ? { num: '07' } : {})}
            />
          ) : null}
          {activeGroup === 'all' || section === 'om' ? (
            <OmDetailsSection
              draft={draft}
              setField={setField}
              {...(activeGroup === 'all' ? { num: '08' } : {})}
            />
          ) : null}
          {activeGroup === 'all' || section === 'funding' ? (
            <FundingSourceSection
              projectId={projectId ?? null}
              entry={fundsUcEntry}
              {...(activeGroup === 'all' ? { num: '09' } : {})}
            />
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-[#E5E7EB] pt-3">
          <Button onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : isEdit ? '✓ Save Changes' : '✓ Create Project'}
          </Button>
          {isEdit && projectId ? (
            <NavLink
              to={`/projects/${projectId}`}
              className="text-[13px] text-[#1D4ED8] hover:underline"
            >
              Cancel & return to detail
            </NavLink>
          ) : (
            <NavLink to="/projects" className="text-[13px] text-[#1D4ED8] hover:underline">
              Cancel
            </NavLink>
          )}
        </footer>
      </article>

      {importOpen ? <ImportProjectDialog onClose={() => setImportOpen(false)} /> : null}
    </RoleGate>
  );
}

/**
 * Top-level segmented-control tab. Two of these ("Fixed Inputs" / "Variable
 * Inputs") sit above the sub-tab strip. The active one gets the navy fill;
 * `locked` overlays a 🔒 for PD/Viewer users so they know the Fixed group
 * opens read-only. `count` is a subtle "· 2" chip showing sub-tab count.
 */
function GroupTab({
  label, count, active, locked, lockedNote, onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  locked: boolean;
  lockedNote?: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-[12.5px] font-bold transition-colors',
        active
          ? 'bg-[#1E3A5F] text-white shadow'
          : 'bg-transparent text-[#374151] hover:bg-white hover:text-[#111827]',
      )}
    >
      {locked ? <span aria-hidden className="text-[12px]">🔒</span> : null}
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
          active ? 'bg-white/20 text-white' : 'bg-[#E5E7EB] text-[#6B7280]',
        )}
      >
        {count}
      </span>
      {locked && lockedNote ? (
        <span
          className={cn(
            'ml-0.5 text-[10px] italic',
            active ? 'text-white/80' : 'text-[#92400E]',
          )}
        >
          · {lockedNote}
        </span>
      ) : null}
    </button>
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
