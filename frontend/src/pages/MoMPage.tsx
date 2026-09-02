import { useMemo, useState } from 'react';
import {
  useCreateMomMutation,
  useDeleteMomMutation,
  useListMomQuery,
  useUpdateMomMutation,
} from '../app/api/momApi';
import { useListProjectsQuery } from '../app/api/projectsApi';
import { RoleGate } from '../components/auth/RoleGate';
import { ActionPointList } from '../components/mom/ActionPointList';
import { MoMForm } from '../components/mom/MoMForm';
import { MoMStatusBadge } from '../components/mom/MoMStatusBadge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/formatters';
import type { MoM, MomStatus } from '../types/api';

const STATUS_FILTERS: Array<MomStatus | 'All'> = [
  'All',
  'Action Pending',
  'In Progress',
  'Resolved',
  'Deferred',
];

export function MoMPage(): JSX.Element {
  const listQ = useListMomQuery({ limit: 50 });
  const projectsQ = useListProjectsQuery({ limit: 100 });
  const [createMom, createState] = useCreateMomMutation();
  const [updateMom, updateState] = useUpdateMomMutation();
  const [deleteMom, deleteState] = useDeleteMomMutation();

  const [statusFilter, setStatusFilter] = useState<MomStatus | 'All'>('All');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<MoM | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const busy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projectsQ.data?.items ?? []) map.set(p.projectId, p.projectName);
    return map;
  }, [projectsQ.data]);

  const filteredItems = useMemo(() => {
    const raw = listQ.data?.items ?? [];
    if (statusFilter === 'All') return raw;
    return raw.filter((m) => m.momStatus === statusFilter);
  }, [listQ.data, statusFilter]);

  const handleCreate = async (body: Parameters<typeof createMom>[0]): Promise<void> => {
    const created = await createMom(body).unwrap();
    setAddOpen(false);
    setExpanded(created.momId);
  };
  const handleUpdate = async (
    momId: number,
    body: Parameters<typeof updateMom>[0]['body'],
  ): Promise<void> => {
    await updateMom({ momId, body }).unwrap();
    setEditing(null);
  };
  const handleDelete = async (momId: number): Promise<void> => {
    if (!window.confirm('Delete this MoM (and all its action points)?')) return;
    await deleteMom(momId).unwrap();
    if (expanded === momId) setExpanded(null);
  };

  return (
    <article className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#111827]">Minutes of Meeting</h1>
          <p className="text-[12.5px] text-[#6B7280]">
            Record, track, and manage meeting minutes and follow-up action items.
          </p>
        </div>
        <RoleGate allow={['Admin', 'MD']}>
          <Button onClick={() => setAddOpen((o) => !o)} disabled={busy}>
            {addOpen ? '× Close form' : '+ Add MoM'}
          </Button>
        </RoleGate>
      </header>

      {addOpen ? (
        <MoMForm onCancel={() => setAddOpen(false)} onSubmit={handleCreate} busy={busy} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors',
              statusFilter === s
                ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                : 'border-[#D1D5DB] bg-white text-[#6B7280] hover:text-[#374151]',
            )}
          >
            {s}
          </button>
        ))}
        <span className="ml-2 text-[11px] text-[#6B7280]">
          {filteredItems.length} of {listQ.data?.items.length ?? 0} shown
        </span>
      </div>

      {listQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {!listQ.isLoading && filteredItems.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-[12.5px] text-[#6B7280]">
            {statusFilter === 'All'
              ? 'No MoMs recorded yet. Click "+ Add MoM" to record one.'
              : `No MoMs in "${statusFilter}" status.`}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {filteredItems.map((mom) => {
          const isExpanded = expanded === mom.momId;
          const linkedName = mom.projectId ? projectsById.get(mom.projectId) : null;
          const isEditing = editing?.momId === mom.momId;

          return (
            <Card key={mom.momId}>
              <CardContent className="p-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : mom.momId)}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-3 text-left hover:bg-[#F9FAFB]"
                >
                  <div className="flex h-14 w-14 flex-col items-center justify-center rounded-md bg-[#EFF6FF] text-center">
                    <span className="text-lg font-extrabold leading-none text-[#1D4ED8]">
                      {mom.meetingDate ? new Date(mom.meetingDate).getDate() : '—'}
                    </span>
                    <span className="mt-0.5 text-[10px] font-semibold text-[#60A5FA]">
                      {mom.meetingDate
                        ? new Date(mom.meetingDate).toLocaleString('en-IN', {
                            month: 'short',
                            year: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#111827]">{mom.meetingTitle}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11.5px] text-[#6B7280]">
                      {mom.venue ? <span>📍 {mom.venue}</span> : null}
                      {mom.chairperson ? <span>👤 {mom.chairperson}</span> : null}
                      {linkedName ? <span>🔗 {linkedName}</span> : null}
                    </div>
                    {mom.decisions ? (
                      <p className="mt-1 line-clamp-2 text-[12px] text-[#374151]">
                        <span className="font-semibold text-[#6B7280]">Decisions: </span>
                        {mom.decisions}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <MoMStatusBadge status={mom.momStatus} />
                    <span className="text-[10.5px] text-[#9CA3AF]">
                      {isExpanded ? '▲ Collapse' : '▼ Expand'}
                    </span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="space-y-4 border-t border-[#F3F4F6] px-4 py-4">
                    {isEditing ? (
                      <MoMForm
                        initial={mom}
                        onCancel={() => setEditing(null)}
                        onSubmit={(body) => handleUpdate(mom.momId, body)}
                        busy={busy}
                      />
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <ReadOnly label="Agenda" value={mom.agenda} />
                          <ReadOnly label="Decisions" value={mom.decisions} />
                          <ReadOnly label="Attendees" value={mom.attendees} />
                          <ReadOnly label="Remarks" value={mom.remarks} />
                        </div>
                        <div className="border-t border-[#F3F4F6] pt-3">
                          <ActionPointList momId={mom.momId} />
                        </div>
                        <RoleGate allow={['Admin', 'MD']}>
                          <div className="flex items-center gap-2 border-t border-[#F3F4F6] pt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing(mom)}
                              disabled={busy}
                            >
                              Edit MoM
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(mom.momId)}
                              disabled={busy}
                            >
                              Delete MoM
                            </Button>
                            <span className="ml-2 text-[11px] text-[#9CA3AF]">
                              Created {formatDate(mom.createdAt)}
                            </span>
                          </div>
                        </RoleGate>
                      </>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </article>
  );
}

function ReadOnly({ label, value }: { label: string; value: string | null }): JSX.Element {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
        {label}
      </div>
      <p className="whitespace-pre-line text-[12.5px] text-[#374151]">{value ?? '—'}</p>
    </div>
  );
}
