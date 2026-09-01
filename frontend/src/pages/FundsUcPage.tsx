import { useMemo, useRef, useState } from 'react';
import {
  useCreateFundsUcMutation,
  useDeleteFundsUcMutation,
  useListFundsUcQuery,
  useUpdateFundsUcMutation,
} from '../app/api/fundsUcApi';
import { useGetLookupsQuery } from '../app/api/lookupsApi';
import { useListProjectsQuery } from '../app/api/projectsApi';
import { RoleGate } from '../components/auth/RoleGate';
import { StatCard } from '../components/overview/StatCard';
import { FundsUcForm } from '../components/fundsUc/FundsUcForm';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches } from '../components/ui/ColumnFilter';
import { formatCurrencyCr, formatDate } from '../lib/formatters';
import { cn } from '../lib/utils';
import type { FundingSource, FundsUcCreatePayload, FundsUcEntry, FundsUcStatus } from '../types/api';

const FUNDING_SOURCES: FundingSource[] = [
  'Central - EAP',
  'Central - Non-EAP',
  'Central - State Share',
  'State Funded',
];

function statusOf(entry: FundsUcEntry): FundsUcStatus {
  if (entry.ucSubmittedDate) return 'Submitted';
  if (entry.expenditureIncurredCr > 0) return 'Overdue';
  return 'Pending';
}

function closingBalanceOf(entry: FundsUcEntry): number {
  return entry.openingBalanceCr + entry.grantReceivedCr - entry.expenditureIncurredCr;
}

const STATUS_BADGE: Record<FundsUcStatus, string> = {
  Submitted: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]',
  Pending: 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]',
  Overdue: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
};

export function FundsUcPage(): JSX.Element {
  const listQ = useListFundsUcQuery();
  const { data: lookups } = useGetLookupsQuery();
  const projectsQ = useListProjectsQuery({ limit: 100 });
  const [createEntry, createState] = useCreateFundsUcMutation();
  const [updateEntry, updateState] = useUpdateFundsUcMutation();
  const [deleteEntry, deleteState] = useDeleteFundsUcMutation();

  const ledgerRef = useRef<HTMLDivElement>(null);
  const scrollToLedger = (): void => {
    ledgerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FundsUcEntry | null>(null);
  const busy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (key: string, value: string): void => {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  };
  const activeFilterCount = Object.values(colFilters).filter(Boolean).length;
  const clearColFilters = (): void => setColFilters({});

  const projectsById = useMemo(() => {
    const map = new Map<string, { projectName: string; divisionId: number | null; schemes: number[] }>();
    for (const p of projectsQ.data?.items ?? []) {
      map.set(p.projectId, { projectName: p.projectName, divisionId: p.divisionId ?? null, schemes: p.schemes });
    }
    return map;
  }, [projectsQ.data]);

  const divisionNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of lookups?.divisions ?? []) map.set(d.divisionId, d.divisionName);
    return map;
  }, [lookups]);

  const schemeNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of lookups?.schemes ?? []) map.set(s.schemeId, s.schemeName);
    return map;
  }, [lookups]);

  const items = useMemo(() => listQ.data?.items ?? [], [listQ.data]);

  const rows = useMemo(
    () =>
      items.map((entry) => {
        const proj = projectsById.get(entry.projectId);
        const divisionName = proj?.divisionId != null ? divisionNameById.get(proj.divisionId) ?? null : null;
        const schemeNames = (proj?.schemes ?? []).map((id) => schemeNameById.get(id) ?? `#${id}`);
        return {
          entry,
          projectName: proj?.projectName ?? entry.projectId,
          divisionName,
          schemeNames,
          closingBalanceCr: closingBalanceOf(entry),
          status: statusOf(entry),
        };
      }),
    [items, projectsById, divisionNameById, schemeNameById],
  );

  const kpis = useMemo(
    () => ({
      projectsTracked: items.length,
      grantReceivedCr: items.reduce((sum, e) => sum + e.grantReceivedCr, 0),
      expenditureIncurredCr: items.reduce((sum, e) => sum + e.expenditureIncurredCr, 0),
      closingBalanceCr: rows.reduce((sum, r) => sum + r.closingBalanceCr, 0),
      ucOverdue: rows.filter((r) => r.status === 'Overdue').length,
    }),
    [items, rows],
  );

  const byFundingSource = useMemo(
    () =>
      FUNDING_SOURCES.map((source) => {
        const matching = rows.filter((r) => r.entry.fundingSource === source);
        return {
          fundingSource: source,
          projects: matching.length,
          grantReceivedCr: matching.reduce((sum, r) => sum + r.entry.grantReceivedCr, 0),
          expenditureIncurredCr: matching.reduce((sum, r) => sum + r.entry.expenditureIncurredCr, 0),
          closingBalanceCr: matching.reduce((sum, r) => sum + r.closingBalanceCr, 0),
        };
      }),
    [rows],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          textMatches(colFilters.project ?? '', r.projectName) &&
          textMatches(colFilters.scheme ?? '', r.schemeNames.join(', ')) &&
          selectMatches(colFilters.division ?? '', r.divisionName ?? '') &&
          selectMatches(colFilters.fundingSource ?? '', r.entry.fundingSource) &&
          textMatches(colFilters.sanctionNo ?? '', r.entry.sanctionNo ?? '') &&
          selectMatches(colFilters.status ?? '', r.status),
      ),
    [rows, colFilters],
  );

  const divisionOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.divisionName).filter((v): v is string => Boolean(v))))
        .sort()
        .map((v) => ({ value: v, label: v })),
    [rows],
  );

  const handleCreate = async (body: FundsUcCreatePayload): Promise<void> => {
    await createEntry(body).unwrap();
    setAddOpen(false);
  };
  const handleUpdate = async (fundsUcId: number, body: FundsUcCreatePayload): Promise<void> => {
    const { fundingSource, openingBalanceCr, grantReceivedCr, expenditureIncurredCr, sanctionNo, ucSubmittedDate, remarks } = body;
    await updateEntry({
      fundsUcId,
      body: {
        fundingSource,
        openingBalanceCr: openingBalanceCr ?? 0,
        grantReceivedCr: grantReceivedCr ?? 0,
        expenditureIncurredCr: expenditureIncurredCr ?? 0,
        sanctionNo: sanctionNo ?? null,
        ucSubmittedDate: ucSubmittedDate ?? null,
        remarks: remarks ?? null,
      },
    }).unwrap();
    setEditing(null);
  };
  const handleDelete = async (fundsUcId: number): Promise<void> => {
    if (!window.confirm('Delete this Funds & UC entry?')) return;
    await deleteEntry(fundsUcId).unwrap();
  };

  return (
    <article className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#111827]">Funds &amp; Utilization Certificate (UC)</h1>
          <p className="text-[12.5px] text-[#6B7280]">
            GFR 12-A style fund ledger — Opening Balance, Grant Received, Expenditure Incurred, Closing
            Balance — with UC submission tracking, by scheme and funding source.
          </p>
        </div>
        <RoleGate allow={['Admin', 'MD']}>
          <Button onClick={() => { setEditing(null); setAddOpen((v) => !v); }} disabled={busy}>
            {addOpen ? 'Close' : '+ Add Entry'}
          </Button>
        </RoleGate>
      </header>

      {addOpen ? (
        <FundsUcForm busy={busy} onCancel={() => setAddOpen(false)} onSubmit={handleCreate} />
      ) : null}
      {editing ? (
        <FundsUcForm
          initial={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={(body) => handleUpdate(editing.fundsUcId, body)}
        />
      ) : null}

      {listQ.isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <StatCard
            label="Projects Tracked"
            value={kpis.projectsTracked}
            tone="brand"
            hint="View in ledger →"
            onClick={scrollToLedger}
          />
          <StatCard
            label="Grant Received (₹ Cr.)"
            value={formatCurrencyCr(kpis.grantReceivedCr)}
            tone="info"
            hint="View in ledger →"
            onClick={scrollToLedger}
          />
          <StatCard
            label="Expenditure Incurred (₹ Cr.)"
            value={formatCurrencyCr(kpis.expenditureIncurredCr)}
            tone="success"
            hint="View in ledger →"
            onClick={scrollToLedger}
          />
          <StatCard
            label="Closing Balance (₹ Cr.)"
            value={formatCurrencyCr(kpis.closingBalanceCr)}
            tone="warning"
            hint="View in ledger →"
            onClick={scrollToLedger}
          />
          <StatCard
            label="UC Overdue"
            value={kpis.ucOverdue}
            tone="danger"
            hint="View in ledger →"
            onClick={() => {
              setColFilter('status', 'Overdue');
              scrollToLedger();
            }}
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-[#F3F4F6] bg-[#1E3A5F] px-4 py-2.5 text-[12.5px] font-bold text-white">
            By Funding Source
          </div>
          {listQ.isLoading ? (
            <div className="p-4"><Skeleton className="h-24 w-full" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                    <th className="px-4 py-2 text-left">Funding Source</th>
                    <th className="px-4 py-2 text-right">Projects</th>
                    <th className="px-4 py-2 text-right">Grant Received (₹ Cr.)</th>
                    <th className="px-4 py-2 text-right">Expenditure Incurred (₹ Cr.)</th>
                    <th className="px-4 py-2 text-right">Closing Balance (₹ Cr.)</th>
                  </tr>
                </thead>
                <tbody>
                  {byFundingSource.map((row, idx) => (
                    <tr key={row.fundingSource} className={cn('border-b border-[#F3F4F6]', idx % 2 === 1 && 'bg-[#FAFAFA]')}>
                      <td className="px-4 py-2 font-semibold text-[#111827]">{row.fundingSource}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.projects}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrencyCr(row.grantReceivedCr)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrencyCr(row.expenditureIncurredCr)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrencyCr(row.closingBalanceCr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card ref={ledgerRef}>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-[#F3F4F6] bg-[#F9FAFB] px-4 py-2 text-[11.5px] font-bold text-[#374151]">
            <span>
              UC Ledger — by Project ({filteredRows.length}{activeFilterCount > 0 ? ` of ${rows.length}` : ''})
            </span>
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
          {listQ.isLoading ? (
            <div className="p-4"><Skeleton className="h-40 w-full" /></div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
              No Funds &amp; UC entries yet. Use &ldquo;+ Add Entry&rdquo; to record one.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
              No entries match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">
                      <div>Project</div>
                      <ColumnFilterText value={colFilters.project ?? ''} onChange={(v) => setColFilter('project', v)} />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <div>Scheme(s)</div>
                      <ColumnFilterText value={colFilters.scheme ?? ''} onChange={(v) => setColFilter('scheme', v)} />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <div>Division</div>
                      <ColumnFilterSelect
                        value={colFilters.division ?? ''}
                        onChange={(v) => setColFilter('division', v)}
                        options={divisionOptions}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <div>Funding Source</div>
                      <ColumnFilterSelect
                        value={colFilters.fundingSource ?? ''}
                        onChange={(v) => setColFilter('fundingSource', v)}
                        options={FUNDING_SOURCES.map((v) => ({ value: v, label: v }))}
                      />
                    </th>
                    <th className="px-3 py-2 text-right">Opening</th>
                    <th className="px-3 py-2 text-right">Received</th>
                    <th className="px-3 py-2 text-left">
                      <div>Sanction No.</div>
                      <ColumnFilterText value={colFilters.sanctionNo ?? ''} onChange={(v) => setColFilter('sanctionNo', v)} />
                    </th>
                    <th className="px-3 py-2 text-right">Expenditure</th>
                    <th className="px-3 py-2 text-right">Closing</th>
                    <th className="px-3 py-2 text-left">UC Submitted</th>
                    <th className="px-3 py-2 text-left">
                      <div>Status</div>
                      <ColumnFilterSelect
                        value={colFilters.status ?? ''}
                        onChange={(v) => setColFilter('status', v)}
                        options={[
                          { value: 'Submitted', label: 'Submitted' },
                          { value: 'Pending', label: 'Pending' },
                          { value: 'Overdue', label: 'Overdue' },
                        ]}
                      />
                    </th>
                    <RoleGate allow={['Admin', 'MD']}>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </RoleGate>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr
                      key={row.entry.fundsUcId}
                      className={cn('border-b border-[#F3F4F6]', idx % 2 === 1 && 'bg-[#FAFAFA]')}
                    >
                      <td className="px-3 py-2 text-[#9CA3AF]">{idx + 1}</td>
                      <td className="px-3 py-2 font-semibold text-[#111827]">{row.projectName}</td>
                      <td className="px-3 py-2 text-[#374151]">{row.schemeNames.join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-[#374151]">{row.divisionName ?? '—'}</td>
                      <td className="px-3 py-2 text-[#374151]">{row.entry.fundingSource}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyCr(row.entry.openingBalanceCr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyCr(row.entry.grantReceivedCr)}</td>
                      <td className="px-3 py-2 text-[#374151]">{row.entry.sanctionNo ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyCr(row.entry.expenditureIncurredCr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyCr(row.closingBalanceCr)}</td>
                      <td className="px-3 py-2 text-[#374151]">{formatDate(row.entry.ucSubmittedDate)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold',
                            STATUS_BADGE[row.status],
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <RoleGate allow={['Admin', 'MD']}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button size="xs" variant="outline" onClick={() => { setAddOpen(false); setEditing(row.entry); }} disabled={busy}>
                              Edit
                            </Button>
                            <Button size="xs" variant="destructive" onClick={() => handleDelete(row.entry.fundsUcId)} disabled={busy}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </RoleGate>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
