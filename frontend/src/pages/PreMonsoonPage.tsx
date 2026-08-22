import { useMemo, useState } from 'react';
import {
  useCreatePreMonsoonMutation,
  useDeletePreMonsoonMutation,
  useListPreMonsoonQuery,
  useUpdatePreMonsoonMutation,
} from '../app/api/preMonsoonApi';
import { RoleGate } from '../components/auth/RoleGate';
import { PriorityBadge } from '../components/projects/PriorityBadge';
import { FormField } from '../components/input-sheet/FormField';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches } from '../components/ui/ColumnFilter';
import { cn } from '../lib/utils';
import type { Priority } from '../types/api';

const PRIORITIES: Priority[] = ['High', 'Medium', 'Low', 'N/A'];

export function PreMonsoonPage(): JSX.Element {
  const { data, isLoading } = useListPreMonsoonQuery();
  const [createItem, createState] = useCreatePreMonsoonMutation();
  const [updateItem, updateState] = useUpdatePreMonsoonMutation();
  const [deleteItem, deleteState] = useDeletePreMonsoonMutation();

  const [topic, setTopic] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editPriority, setEditPriority] = useState<Priority | ''>('');
  const [editDeadline, setEditDeadline] = useState('');

  const busy = createState.isLoading || updateState.isLoading || deleteState.isLoading;
  const items = useMemo(() => data?.items ?? [], [data]);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (key: string, value: string): void => {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  };
  const activeFilterCount = Object.values(colFilters).filter(Boolean).length;
  const clearColFilters = (): void => setColFilters({});

  const filteredItems = useMemo(
    () =>
      items.filter(
        (it) =>
          textMatches(colFilters.topic ?? '', it.topic) &&
          selectMatches(colFilters.priority ?? '', it.priority ?? ''),
      ),
    [items, colFilters],
  );

  const priorityFilterOptions = useMemo(
    () => PRIORITIES.map((p) => ({ value: p, label: p })),
    [],
  );

  const handleAdd = async (): Promise<void> => {
    setError(null);
    if (!topic.trim()) {
      setError('Topic is required.');
      return;
    }
    try {
      await createItem({
        topic: topic.trim(),
        priority: priority || null,
        deadlineDate: deadline || null,
      }).unwrap();
      setTopic('');
      setPriority('');
      setDeadline('');
    } catch (err) {
      setError(readError(err));
    }
  };

  const startEdit = (itemId: number, curTopic: string, curPri: Priority | null, curDl: string | null): void => {
    setEditingId(itemId);
    setEditTopic(curTopic);
    setEditPriority(curPri ?? '');
    setEditDeadline(curDl ?? '');
  };

  const handleUpdate = async (itemId: number): Promise<void> => {
    setError(null);
    try {
      await updateItem({
        itemId,
        body: {
          topic: editTopic.trim(),
          priority: editPriority || null,
          deadlineDate: editDeadline || null,
        },
      }).unwrap();
      setEditingId(null);
    } catch (err) {
      setError(readError(err));
    }
  };

  const handleDelete = async (itemId: number): Promise<void> => {
    if (!window.confirm('Delete this preparation topic?')) return;
    try {
      setError(null);
      await deleteItem(itemId).unwrap();
    } catch (err) {
      setError(readError(err));
    }
  };

  return (
    <article className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-[#111827]">Pre-Monsoon Preparation</h1>
        <p className="text-[12.5px] text-[#6B7280]">
          Track preparation topics ahead of the monsoon season. All fields optional except Topic.
        </p>
      </header>

      <RoleGate allow={['Admin', 'MD']}>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#374151]">
              🌧️ Add Preparation Topic
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
              <FormField
                label="Topic"
                value={topic}
                onChange={setTopic}
                placeholder="e.g. Desilting of major drains"
              />
              <FormField
                label="Priority"
                type="select"
                value={priority}
                onChange={(v) => setPriority(v as Priority | '')}
                options={PRIORITIES as unknown as string[]}
              />
              <FormField
                label="Deadline"
                type="date"
                value={deadline}
                onChange={setDeadline}
              />
              <div className="flex items-end">
                <Button onClick={handleAdd} disabled={busy || !topic.trim()}>
                  + Add Topic
                </Button>
              </div>
            </div>
            {error ? (
              <div className="mt-3 rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B91C1C]">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </RoleGate>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-[#F3F4F6] bg-[#F9FAFB] px-4 py-2 text-[11.5px] font-bold text-[#374151]">
            <span>Preparation Topics ({filteredItems.length}{activeFilterCount > 0 ? ` of ${items.length}` : ''})</span>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearColFilters}
                className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
              >
                Clear column filters ({activeFilterCount})
              </button>
            ) : null}
          </div>
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
              No preparation topics yet.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
              No preparation topics match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">
                      <div>Topic</div>
                      <ColumnFilterText
                        value={colFilters.topic ?? ''}
                        onChange={(v) => setColFilter('topic', v)}
                        placeholder="Filter…"
                      />
                    </th>
                    <th className="px-4 py-2 text-left">
                      <div>Priority</div>
                      <ColumnFilterSelect
                        value={colFilters.priority ?? ''}
                        onChange={(v) => setColFilter('priority', v)}
                        options={priorityFilterOptions}
                      />
                    </th>
                    <th className="px-4 py-2 text-left">Deadline</th>
                    <RoleGateHead />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it, idx) => {
                    const overdue = it.deadlineDate && it.deadlineDate < todayStr;
                    const isEditing = editingId === it.itemId;
                    return (
                      <tr
                        key={it.itemId}
                        className={cn('border-b border-[#F3F4F6]', idx % 2 === 1 && 'bg-[#FAFAFA]')}
                      >
                        <td className="px-4 py-2 text-[#9CA3AF]">{idx + 1}</td>
                        <td className="px-4 py-2 font-semibold text-[#111827]">
                          {isEditing ? (
                            <input
                              value={editTopic}
                              onChange={(e) => setEditTopic(e.target.value)}
                              className="h-8 w-full rounded border border-[#D1D5DB] px-2 text-[12.5px]"
                            />
                          ) : (
                            it.topic
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isEditing ? (
                            <select
                              value={editPriority}
                              onChange={(e) => setEditPriority(e.target.value as Priority | '')}
                              className="h-8 rounded border border-[#D1D5DB] px-2 text-[12.5px]"
                            >
                              <option value="">— None —</option>
                              {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <PriorityBadge priority={it.priority} />
                          )}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2 tabular-nums',
                            overdue && 'font-semibold text-[#B91C1C]',
                          )}
                        >
                          {isEditing ? (
                            <input
                              type="date"
                              value={editDeadline}
                              onChange={(e) => setEditDeadline(e.target.value)}
                              className="h-8 rounded border border-[#D1D5DB] px-2 text-[12.5px]"
                            />
                          ) : (
                            <>
                              {it.deadlineDate ?? '—'}
                              {overdue ? ' (overdue)' : ''}
                            </>
                          )}
                        </td>
                        <RoleGate allow={['Admin', 'MD']}>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              {isEditing ? (
                                <>
                                  <Button
                                    size="xs"
                                    onClick={() => handleUpdate(it.itemId)}
                                    disabled={busy}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => setEditingId(null)}
                                    disabled={busy}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() =>
                                      startEdit(
                                        it.itemId,
                                        it.topic,
                                        it.priority ?? null,
                                        it.deadlineDate ?? null,
                                      )
                                    }
                                    disabled={busy}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="destructive"
                                    onClick={() => handleDelete(it.itemId)}
                                    disabled={busy}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </RoleGate>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </article>
  );
}

function RoleGateHead(): JSX.Element {
  return (
    <RoleGate allow={['Admin', 'MD']}>
      <th className="px-4 py-2 text-left">Actions</th>
    </RoleGate>
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
