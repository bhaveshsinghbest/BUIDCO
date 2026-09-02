import { NavLink, useParams } from 'react-router-dom';
import { useGetLookupsQuery } from '../app/api/lookupsApi';
import { useGetProjectQuery } from '../app/api/projectsApi';
import { useListCosEotForProjectQuery } from '../app/api/cosEotApi';
import { useListMgmtActionsForProjectQuery } from '../app/api/mgmtActionsApi';
import { useListMilestonesQuery } from '../app/api/milestonesApi';
import { useListGeoPhotosQuery } from '../app/api/geoPhotosApi';
import { useGetFundsUcByProjectQuery } from '../app/api/fundsUcApi';
import { useAppSelector } from '../app/hooks';
import { RoleGate } from '../components/auth/RoleGate';
import { OmAlertCell } from '../components/projects/OmAlertCell';
import { PbgAlertCell } from '../components/projects/PbgAlertCell';
import { PriorityBadge } from '../components/projects/PriorityBadge';
import { ProgressBar } from '../components/projects/ProgressBar';
import { StatusBadge } from '../components/projects/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { selectCurrentUser } from '../features/auth/authSlice';
import { formatCurrencyCr, formatDate, formatPercent } from '../lib/formatters';
import { fundsUcStatusOf } from '../lib/fundsUc';
import type { ProjectDetail } from '../types/api';

export function ProjectDetailPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const user = useAppSelector(selectCurrentUser);
  const detail = useGetProjectQuery(projectId ?? '', { skip: !projectId });
  const lookups = useGetLookupsQuery();
  const cosEot = useListCosEotForProjectQuery(projectId ?? '', { skip: !projectId });
  const mgmt = useListMgmtActionsForProjectQuery(projectId ?? '', { skip: !projectId });
  const milestones = useListMilestonesQuery(projectId ?? '', { skip: !projectId });
  const photos = useListGeoPhotosQuery(projectId ?? '', { skip: !projectId });
  const fundsUc = useGetFundsUcByProjectQuery(projectId ?? '', { skip: !projectId });

  if (!projectId) {
    return <ErrorPanel message="Missing project id in URL." />;
  }
  if (detail.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (detail.error || !detail.data) {
    const status =
      typeof detail.error === 'object' && detail.error && 'status' in detail.error
        ? (detail.error as { status?: number }).status
        : undefined;
    return (
      <ErrorPanel
        message={status === 404 ? 'This project does not exist.' : 'Could not load project.'}
      />
    );
  }

  const project = detail.data;
  const sectorName = project.sectorId
    ? lookups.data?.sectors.find((s) => s.sectorId === project.sectorId)?.sectorName
    : null;
  const districtName = project.districtId
    ? lookups.data?.districts.find((d) => d.districtId === project.districtId)?.districtName
    : null;
  const schemeNames = (project.schemes ?? []).map(
    (id) => lookups.data?.schemes.find((s) => s.schemeId === id)?.schemeName ?? `#${id}`,
  );

  return (
    <article className="space-y-4">
      <header className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              <NavLink to="/projects" className="text-[#1D4ED8] hover:underline">
                ← All projects
              </NavLink>
              {sectorName ? <span className="ml-2 text-[#6B7280]">{sectorName}</span> : null}
              {districtName ? <span className="ml-2 text-[#6B7280]">· {districtName}</span> : null}
            </p>
            <h1 className="break-words text-xl font-bold tracking-tight text-[#111827]">
              {project.projectName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />
              {project.projectStage ? (
                <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#1E3A5F]">
                  Stage · {project.projectStage}
                </span>
              ) : null}
              {project.workType ? (
                <span className="rounded-full border border-[#D1D5DB] bg-[#F9FAFB] px-2 py-0.5 text-[10.5px] font-semibold text-[#374151]">
                  {project.workType}
                </span>
              ) : null}
            </div>
          </div>
          <RoleGate allow={['Admin', 'MD']}>
            <NavLink
              to={`/input-sheet/${project.projectId}`}
              className="inline-flex h-9 items-center justify-center rounded bg-[#1E3A5F] px-4 text-sm font-medium text-white hover:bg-[#152a48]"
            >
              ✏ Edit in Input Sheet
            </NavLink>
          </RoleGate>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-[#F3F4F6] pt-3 sm:grid-cols-3">
          <Metric label="Effective Physical %" value={formatPercent(project.effectivePhysicalPct)}>
            <ProgressBar value={project.effectivePhysicalPct} color="#1D4ED8" showLabel={false} />
            {project.isMilestoneWeighted ? (
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#15803D]">
                Milestone-weighted
              </span>
            ) : (
              <span className="mt-0.5 text-[10px] text-[#6B7280]">Manual entry</span>
            )}
          </Metric>
          <Metric label="Financial %" value={formatPercent(project.financialProgressPct)}>
            <ProgressBar value={project.financialProgressPct} color="#22C55E" showLabel={false} />
          </Metric>
          <Metric label="AA Amount" value={formatCurrencyCr(project.aaAmountCr)}>
            <span className="text-[11px] text-[#6B7280]">
              Agreement: {formatCurrencyCr(project.agreementAmountCr)}
            </span>
          </Metric>
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid
              fields={[
                { label: 'City', value: project.city },
                { label: 'District', value: districtName },
                { label: 'Sector', value: sectorName },
                {
                  label: 'Scheme(s)',
                  value: schemeNames.length > 0 ? schemeNames.join(', ') : null,
                },
                { label: 'Contractor', value: project.contractor },
                { label: 'PD', value: project.pd },
                { label: 'Sponsoring Dept', value: project.sponsoringDept },
                { label: 'Implementing Agency', value: project.implementingAgency },
                { label: 'Current Phase', value: project.currentPhase },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule & Delay</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid
              fields={[
                { label: 'Sanction Date', value: formatDate(project.sanctionDate) },
                { label: 'Planned End Date', value: formatDate(project.plannedEndDate) },
                { label: 'Revised End Date', value: formatDate(project.revisedEndDate) },
                {
                  label: 'Expected Completion',
                  value:
                    formatDate(project.expectedCompletionDate) === '—'
                      ? (project.expectedCompletionRaw ?? '—')
                      : formatDate(project.expectedCompletionDate),
                },
                { label: 'Scheduled Progress %', value: formatPercent(project.scheduledProgressPct) },
                { label: 'Delay Reason', value: project.delayReason },
                { label: 'Department Stuck At', value: project.deptStuckAt },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Contract & Financial</CardTitle>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
              All ₹ Cr
            </span>
          </CardHeader>
          <CardContent>
            <FieldGrid
              fields={[
                { label: 'Agreement Number', value: project.agreementNumber },
                { label: 'Agreement Date', value: formatDate(project.agreementDate) },
                { label: 'Appointed Date', value: formatDate(project.appointedDate) },
                { label: 'Contract Value', value: formatCurrencyCr(project.contractValueCr) },
                {
                  label: 'Mobilisation Advance Issued',
                  value: formatCurrencyCr(project.mobAdvanceIssuedCr),
                },
                {
                  label: 'Advance Recovered',
                  value: formatCurrencyCr(project.mobAdvanceRecoveredCr),
                },
                {
                  label: 'Advance Outstanding',
                  value: formatCurrencyCr(project.advanceOutstandingCr),
                },
                {
                  label: 'Retention Held',
                  value: formatCurrencyCr(project.retentionMoneyHeldCr),
                },
                { label: 'Total Payments', value: formatCurrencyCr(project.totalPaymentsCr) },
                { label: 'Last Payment Date', value: formatDate(project.lastPaymentDate) },
                { label: 'Last RA Bill No.', value: project.lastRaBillNo },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funding Source & UC</CardTitle>
          </CardHeader>
          <CardContent>
            {fundsUc.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !fundsUc.data ? (
              <p className="text-sm text-[#6B7280]">
                No Funding Source recorded yet. Add it from the Input Sheet&apos;s Funding Source section.
              </p>
            ) : (
              <FieldGrid
                fields={[
                  { label: 'Funding Source', value: fundsUc.data.fundingSource },
                  ...(fundsUc.data.fundingSource === 'Central - State Share'
                    ? [
                        { label: 'Central Share', value: formatPercent(fundsUc.data.centralSharePct, 0) },
                        { label: 'State Share', value: formatPercent(fundsUc.data.stateSharePct, 0) },
                      ]
                    : []),
                  { label: 'Opening Balance', value: formatCurrencyCr(fundsUc.data.openingBalanceCr) },
                  { label: 'Grant Received', value: formatCurrencyCr(fundsUc.data.grantReceivedCr) },
                  { label: 'Expenditure Incurred', value: formatCurrencyCr(fundsUc.data.expenditureIncurredCr) },
                  {
                    label: 'Closing Balance',
                    value: formatCurrencyCr(
                      fundsUc.data.openingBalanceCr + fundsUc.data.grantReceivedCr - fundsUc.data.expenditureIncurredCr,
                    ),
                  },
                  { label: 'Sanction No.', value: fundsUc.data.sanctionNo },
                  { label: 'UC Submitted Date', value: formatDate(fundsUc.data.ucSubmittedDate) },
                  { label: 'UC Status', value: fundsUcStatusOf(fundsUc.data) },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PBG & EMD</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid
              fields={[
                { label: 'PBG Number', value: project.pbgNumber },
                { label: 'PBG Amount', value: formatCurrencyCr(project.pbgAmountCr) },
                { label: 'PBG Issuing Bank', value: project.pbgIssuingBank },
                { label: 'PBG Expiry Date', value: formatDate(project.pbgExpiryDate) },
                { label: 'EMD Amount', value: formatCurrencyCr(project.emdAmountCr) },
                { label: 'EMD Reference', value: project.emdRefNumber },
                { label: 'EMD Date', value: formatDate(project.emdDate) },
              ]}
              extra={
                <div className="col-span-2 pt-1">
                  <PbgAlertCell pbgExpiryDate={project.pbgExpiryDate} />
                </div>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>O&M</CardTitle>
          </CardHeader>
          <CardContent>
            {!project.omApplicable ? (
              <p className="text-sm text-[#6B7280]">Not applicable to this project.</p>
            ) : (
              <>
                <FieldGrid
                  fields={[
                    { label: 'O&M Start', value: formatDate(project.omStartDate) },
                    { label: 'Period (months)', value: project.omPeriodMonths ?? '—' },
                    { label: 'O&M End', value: formatDate(project.omEndDate) },
                    { label: 'O&M Agency', value: project.omAgency },
                    { label: 'Status Override', value: project.omStatusOverride },
                  ]}
                />
                <div className="mt-3">
                  <OmAlertCell
                    status={project.status}
                    omApplicable={project.omApplicable}
                    omStartDate={project.omStartDate}
                    omEndDate={project.omEndDate}
                    omPeriodMonths={project.omPeriodMonths}
                    omStatusOverride={project.omStatusOverride}
                  />
                </div>
                {project.omRemarks ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-[#374151]">
                    {project.omRemarks}
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outstanding Gap & Remarks</CardTitle>
          </CardHeader>
          <CardContent>
            {project.remark ? (
              <p className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">
                ⚠ {project.remark}
              </p>
            ) : (
              <p className="text-sm text-[#6B7280]">No outstanding gap recorded.</p>
            )}
            {project.mainWork ? (
              <div className="mt-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Main Work
                </p>
                <p className="whitespace-pre-wrap text-sm text-[#111827]">{project.mainWork}</p>
              </div>
            ) : null}
            {project.projectBrief ? (
              <div className="mt-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Project Brief
                </p>
                <p className="whitespace-pre-wrap text-sm text-[#111827]">{project.projectBrief}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>CoS / EoT ({cosEot.data?.items.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {cosEot.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : cosEot.data && cosEot.data.items.length > 0 ? (
              <ul className="space-y-1.5 text-xs">
                {cosEot.data.items.map((row) => (
                  <li
                    key={row.cosId}
                    className="flex items-center justify-between rounded border border-[#E5E7EB] px-3 py-1.5"
                  >
                    <span className="font-medium text-[#111827]">
                      {row.cosNumber ?? 'CoS'} · {row.category ?? '—'}
                    </span>
                    <span className="text-[#6B7280] tabular-nums">
                      {formatCurrencyCr(row.cosAmountCr)}{' '}
                      {row.eotDaysGranted ? `· +${row.eotDaysGranted}d` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6B7280]">No CoS/EoT records.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Management Actions ({mgmt.data?.items.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {mgmt.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : mgmt.data && mgmt.data.items.length > 0 ? (
              <ul className="space-y-1.5 text-xs">
                {mgmt.data.items.map((row) => (
                  <li key={row.itemId} className="flex items-start gap-2">
                    <span
                      className={
                        row.status === 'Open'
                          ? 'mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#B91C1C]'
                          : 'mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#15803D]'
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#111827]">{row.topic}</p>
                      <p className="text-[10.5px] text-[#6B7280]">
                        {row.status}
                        {row.deadlineDate ? ` · due ${formatDate(row.deadlineDate)}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6B7280]">No management actions.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Milestones ({milestones.data?.items.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {milestones.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : milestones.data && milestones.data.items.length > 0 ? (
              <ul className="space-y-1.5 text-xs">
                {milestones.data.items.map((m) => (
                  <li
                    key={m.milestoneId}
                    className="flex items-center justify-between rounded border border-[#E5E7EB] px-3 py-1.5"
                  >
                    <span className="font-medium text-[#111827]">{m.milestoneName}</span>
                    <span className="tabular-nums text-[#374151]">{m.weightPct}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6B7280]">
                No milestones defined yet. Add them from the Input Sheet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Geo-tagged Photos ({photos.data?.items.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {photos.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : photos.data && photos.data.items.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.data.items.slice(0, 6).map((p) => (
                  <a
                    key={p.photoId}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group block overflow-hidden rounded border border-[#E5E7EB] bg-[#F9FAFB]"
                  >
                    <img
                      src={p.url}
                      alt={p.caption ?? 'Geo photo'}
                      loading="lazy"
                      className="h-24 w-full object-cover transition-transform group-hover:scale-105"
                    />
                    {p.caption ? (
                      <p className="truncate p-1 text-[10px] text-[#374151]">{p.caption}</p>
                    ) : null}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6B7280]">
                No photos yet.{' '}
                {user?.role === 'Viewer'
                  ? 'You can add a URL-source photo from the Input Sheet.'
                  : 'Add photos from the Input Sheet.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  children,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-3">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-[#111827]">{value}</dd>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

function FieldGrid({
  fields,
  extra,
}: {
  fields: Array<{ label: string; value: React.ReactNode }>;
  extra?: React.ReactNode;
}): JSX.Element {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {fields.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
            {f.label}
          </dt>
          <dd className="truncate text-[13px] text-[#111827]">{f.value ?? '—'}</dd>
        </div>
      ))}
      {extra}
    </dl>
  );
}

function ErrorPanel({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm">
      <p className="font-semibold text-[#B91C1C]">{message}</p>
      <NavLink
        to="/projects"
        className="mt-2 inline-block text-[#1D4ED8] hover:underline"
      >
        ← Back to all projects
      </NavLink>
    </div>
  );
}

// Keep the ProjectDetail import used so the tsc doesn't drop it — component
// consumes the shape indirectly through hooks.
export type { ProjectDetail };
