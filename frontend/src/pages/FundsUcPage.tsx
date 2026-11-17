/**
 * Funds Flow & UC Tracker (bhaveshTask.md Parts D–F).
 *
 * Complete breakup from the sanctioning agency to the payment released by
 * BUIDCo — Overall / Scheme-wise / Project-wise — and whether the
 * Utilization Certificate (UC) has gone back to the department.
 *
 * Data comes from GET /api/funds-uc, which the API scopes to the PD's own
 * division (T-02), so every total, chart and table here is scoped too.
 * Figures are entered in the Input Sheet → "09 Funds & UC".
 */
import { useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useListFundsUcQuery } from '../app/api/fundsUcApi';
import { useGetLookupsQuery } from '../app/api/lookupsApi';
import { useListProjectsQuery } from '../app/api/projectsApi';
import { FundsBlock } from '../components/fundsUc/FundsBlock';
import { GroupTable, ProjectFundTable } from '../components/fundsUc/FundTables';
import { FundCard, FundCardHeader, FundEmptyState, StageLegend, UcStatusPill } from '../components/fundsUc/fundsUi';
import { UcPanel } from '../components/fundsUc/UcPanel';
import { ProjectProfileModal } from '../components/projects/ProjectProfileModal';
import { Skeleton } from '../components/ui/skeleton';
import {
  agencyOf,
  aggregateFlow,
  cr,
  entryToFundProject,
  fmtD,
  FUND_COLORS,
  groupFundRows,
  isFundTracked,
  isUcNotSent,
  makeDemoFundProjects,
  sharePercentsOf,
  toFundRows,
  type FundGroup,
  type FundProject,
  type FundRow,
} from '../lib/fundsUc';
import type { FundingSource } from '../types/api';

type View = 'overall' | 'scheme' | 'project';

const VIEWS: Array<[View, string]> = [
  ['overall', '📊 Overall'],
  ['scheme', '🗂️ Scheme-wise'],
  ['project', '🏗️ Project-wise'],
];

function ChainChip({ children, color }: { children: string; color: string }): JSX.Element {
  return (
    <span className="rounded-full px-3 py-[5px] text-[11.5px] font-bold text-white" style={{ background: color }}>
      {children}
    </span>
  );
}

const Arrow = (): JSX.Element => (
  <span className="text-[#9CA3AF]" aria-hidden>
    →
  </span>
);

export function FundsUcPage(): JSX.Element {
  const listQ = useListFundsUcQuery();
  const { data: lookups } = useGetLookupsQuery();

  const [view, setView] = useState<View>('overall');
  const [selScheme, setSelScheme] = useState<string | null>(null);
  const [selProjId, setSelProjId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('All');
  const [ucNotSentOnly, setUcNotSentOnly] = useState(false);
  const [useDemo, setUseDemo] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const topRef = useRef<HTMLElement>(null);

  const real = useMemo(() => (listQ.data?.items ?? []).map(entryToFundProject).filter(isFundTracked), [listQ.data]);
  // Sample numbers only ever stand in for an empty tracker (T-18).
  const demoOn = useDemo && real.length === 0;
  const demoBaseQ = useListProjectsQuery({ limit: 7 }, { skip: !demoOn });

  const schemeNameById = useMemo(() => new Map((lookups?.schemes ?? []).map((s) => [s.schemeId, s.schemeName])), [lookups]);
  const source = useMemo<FundProject[]>(() => {
    if (!demoOn) return real;
    const base: FundProject[] = (demoBaseQ.data?.items ?? []).map((p) => ({
      id: p.projectId,
      projectName: p.projectName,
      sector: p.schemes.map((id) => schemeNameById.get(id) ?? `#${id}`),
      aaAmount: p.aaAmountCr ?? '',
      revisedAAAmount: p.revisedAaAmountCr ?? '',
    }));
    return makeDemoFundProjects(base);
  }, [demoOn, real, demoBaseQ.data, schemeNameById]);

  const rows = useMemo(() => toFundRows(source), [source]);
  const overall = useMemo(() => aggregateFlow(rows), [rows]);
  const schemeGroups = useMemo(() => groupFundRows(rows, (r) => r.scheme), [rows]);
  const agencyGroups = useMemo(() => groupFundRows(rows, (r) => agencyOf(r.p)), [rows]);
  const totalGroup: FundGroup = { name: 'TOTAL', rows, agg: overall };

  /** A project click anywhere on the page opens it in Project-wise (T-27). */
  const pickProject = (p: FundProject): void => {
    setSelProjId(p.id);
    setView('project');
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const selProject = rows.find((r) => r.p.id === selProjId) ?? null;
  const selSchemeGroup = schemeGroups.find((g) => g.name === selScheme) ?? null;

  const projectRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(({ p, scheme, ...r }) => {
        if (q && !(p.projectName || '').toLowerCase().includes(q)) return false;
        if (schemeFilter !== 'All' && scheme !== schemeFilter) return false;
        if (ucNotSentOnly && !isUcNotSent(r)) return false;
        return true;
      })
      .sort((a, b) => b.f.sanctioned - a.f.sanctioned);
  }, [rows, search, schemeFilter, ucNotSentOnly]);

  const loading = listQ.isLoading || (demoOn && demoBaseQ.isLoading);

  return (
    <article ref={topRef} className="mx-auto flex max-w-[1400px] scroll-mt-28 flex-col gap-[18px] text-[#111827]" data-testid="funds-uc-page">
      <header>
        <h1 className="text-[18px] font-extrabold text-[#111827]">Funds Flow &amp; UC Tracker</h1>
        <p className="mt-0.5 text-[12.5px] text-[#6B7280]">
          Complete breakup from the sanctioning agency to the payment released by BUIDCo — and whether the Utilization Certificate (UC) has gone
          back to the department.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2" aria-label="Flow of funds">
          <ChainChip color={FUND_COLORS.sanction}>Sanctioning Agency (MoHUA / NMCG / State)</ChainChip>
          <Arrow />
          <ChainChip color={FUND_COLORS.udhd}>UDHD</ChainChip>
          <Arrow />
          <ChainChip color={FUND_COLORS.buidco}>BUIDCo</ChainChip>
          <Arrow />
          <ChainChip color={FUND_COLORS.paid}>Contractors / Payees</ChainChip>
          <span className="ml-2 text-[11.5px] text-[#6B7280]">UC travels back: BUIDCo → UDHD → Agency</span>
        </div>
      </header>

      {listQ.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-[12.5px] text-[#B91C1C]">
          <span>Could not load the funds data.</span>
          <button type="button" onClick={() => void listQ.refetch()} className="rounded-md border border-[#B91C1C] bg-white px-3 py-1 font-semibold">
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading funds data">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 w-full rounded-[10px]" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-[10px]" />
        </div>
      ) : (
        <>
          {rows.length === 0 ? (
            <FundCard className="p-7" testId="funds-empty">
              <FundEmptyState
                icon="💰"
                heading="No funds data recorded yet"
                message="Open a project's Input Sheet → section “09 Funds & UC” and fill the five stages: Sanction → Released to UDHD → Received by BUIDCo → Paid → UC."
              />
              {!demoOn ? (
                <div className="mt-3.5 text-center">
                  <button
                    type="button"
                    onClick={() => setUseDemo(true)}
                    className="rounded-lg border border-[#2563EB] bg-[#EFF6FF] px-[18px] py-[9px] font-bold text-[#1D4ED8] hover:bg-[#DBEAFE]"
                  >
                    Preview this screen with sample numbers
                  </button>
                </div>
              ) : null}
            </FundCard>
          ) : null}

          {demoOn ? (
            <div
              role="status"
              className="flex items-center justify-between gap-2.5 rounded-lg border border-[#F59E0B] bg-[#FEF3C7] px-3.5 py-[9px] text-[12px] text-[#92400E]"
            >
              <span>
                <b>SAMPLE DATA</b> — illustrative numbers only, not real BUIDCo figures. They vanish as soon as you enter real data.
              </span>
              <button type="button" onClick={() => setUseDemo(false)} className="shrink-0 rounded-md border border-[#D97706] bg-white px-3 py-1 text-[11.5px]">
                Hide
              </button>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Funds view">
                {VIEWS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => setView(id)}
                    className="rounded-full border px-[18px] py-2 text-[12.5px] font-bold transition-colors"
                    style={
                      view === id
                        ? { background: '#1E3A5F', borderColor: '#1E3A5F', color: 'white' }
                        : { background: 'white', borderColor: '#D1D5DB', color: '#374151' }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view === 'overall' ? (
                <>
                  <FundsBlock
                    rows={rows}
                    title="Flow of Funds — Overall"
                    sub={`${overall.n} project(s) with funds data · all amounts ₹ Cr. · band thickness = amount`}
                    onPick={pickProject}
                  />
                  <FundCard testId="by-agency">
                    <FundCardHeader icon="🏛️" title="By Sanctioning Agency" sub="Who sanctioned, how much has been released, and where it now sits" />
                    <GroupTable groups={agencyGroups} labelHead="Sanctioning Agency" total={totalGroup} />
                  </FundCard>
                  <UcPanel rows={rows} onPick={pickProject} />
                </>
              ) : null}

              {view === 'scheme' ? (
                <SchemeView
                  schemeGroups={schemeGroups}
                  selScheme={selScheme}
                  selGroup={selSchemeGroup}
                  onSelectScheme={setSelScheme}
                  totalGroup={totalGroup}
                  onPick={pickProject}
                />
              ) : null}

              {view === 'project' ? (
                <>
                  {selProject ? (
                    <SelectedProject
                      row={selProject}
                      onOpenProfile={() => setProfileId(selProject.p.id)}
                      onClear={() => setSelProjId(null)}
                    />
                  ) : null}
                  <FundCard testId="project-wise">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-[18px] py-3.5">
                      <h2 className="text-[13.5px] font-bold">
                        Project-wise Fund Position{' '}
                        {!selProject ? <span className="text-[12px] font-normal text-[#6B7280]">— click a project for its flow diagram</span> : null}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label="Filter by scheme"
                          value={schemeFilter}
                          onChange={(e) => setSchemeFilter(e.target.value)}
                          className="rounded-[7px] border border-[#D1D5DB] bg-white px-2.5 py-1.5 text-[12.5px]"
                        >
                          <option value="All">All schemes</option>
                          {schemeGroups.map((g) => (
                            <option key={g.name} value={g.name}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#374151]">
                          <input type="checkbox" checked={ucNotSentOnly} onChange={(e) => setUcNotSentOnly(e.target.checked)} />
                          UC not sent only
                        </label>
                        <input
                          type="search"
                          aria-label="Search project"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search project…"
                          className="min-w-0 rounded-[7px] border border-[#D1D5DB] px-3 py-[7px] text-[12.5px] sm:min-w-[180px]"
                        />
                      </div>
                    </div>
                    <ProjectFundTable rows={projectRows} onPick={pickProject} selectedId={selProjId} />
                    <div className="flex flex-wrap justify-between gap-2 px-3.5 py-2.5">
                      <StageLegend />
                      <span className="text-[11px] text-[#B45309]">* Released-to-UDHD not entered; assumed = received by BUIDCo</span>
                    </div>
                  </FundCard>
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <ProjectProfileModal projectId={profileId} onClose={() => setProfileId(null)} />
    </article>
  );
}

/* ─────────────────────────── T-24 · Scheme-wise ─────────────────────────── */

function SchemeView({
  schemeGroups,
  selScheme,
  selGroup,
  onSelectScheme,
  totalGroup,
  onPick,
}: {
  schemeGroups: FundGroup[];
  selScheme: string | null;
  selGroup: FundGroup | null;
  onSelectScheme: (name: string | null) => void;
  totalGroup: FundGroup;
  onPick: (p: FundProject) => void;
}): JSX.Element {
  const chartData = schemeGroups.map((g) => ({
    name: g.name,
    Sanctioned: +g.agg.sanctioned.toFixed(2),
    'Released to UDHD': +g.agg.relUDHD.toFixed(2),
    'Received by BUIDCo': +g.agg.received.toFixed(2),
    'Paid by BUIDCo': +g.agg.paid.toFixed(2),
  }));
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a scheme">
        {[null, ...schemeGroups.map((g) => g.name)].map((n) => {
          const active = (selGroup ? selScheme : null) === n;
          return (
            <button
              key={n ?? '__all'}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectScheme(n)}
              className="rounded-full border px-[13px] py-[5px] text-[12px] font-semibold"
              style={active ? { background: '#2563EB', borderColor: '#2563EB', color: 'white' } : { background: 'white', borderColor: '#D1D5DB', color: '#374151' }}
            >
              {n ?? 'All schemes'}
            </button>
          );
        })}
      </div>

      {!selGroup ? (
        <>
          <FundCard testId="scheme-chart">
            <FundCardHeader icon="📶" title="Scheme-wise Fund Position" sub="Sanctioned → Released to UDHD → Received by BUIDCo → Paid (₹ Cr.)" />
            <div className="h-[320px] px-2 py-3.5 sm:px-[18px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₹${v} Cr.`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Sanctioned" fill={FUND_COLORS.sanction} />
                  <Bar dataKey="Released to UDHD" fill={FUND_COLORS.udhd} />
                  <Bar dataKey="Received by BUIDCo" fill={FUND_COLORS.buidco} />
                  <Bar dataKey="Paid by BUIDCo" fill={FUND_COLORS.paid} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </FundCard>
          <FundCard testId="scheme-breakup">
            <FundCardHeader icon="🗂️" title="Scheme-wise Breakup" sub="Click a scheme to see its flow diagram, UC status and projects" />
            <GroupTable groups={schemeGroups} labelHead="Scheme" total={totalGroup} onPick={onSelectScheme} />
            <p className="px-3.5 pb-3 text-[11px] text-[#9CA3AF]">
              A project tagged to several schemes is counted once, under its first-listed scheme, so scheme totals add up to the Overall total.
            </p>
          </FundCard>
        </>
      ) : (
        <>
          {/* Keyed by scheme: switching schemes closes any open breakup. */}
          <FundsBlock key={selGroup.name} rows={selGroup.rows} title={`Flow of Funds — ${selGroup.name}`} sub={`${selGroup.agg.n} project(s) · ₹ Cr.`} onPick={onPick} />
          <UcPanel rows={selGroup.rows} onPick={onPick} />
          <FundCard testId="scheme-projects">
            <FundCardHeader icon="🏗️" title={`Projects under ${selGroup.name}`} sub="Click a project for its own flow diagram" />
            <ProjectFundTable rows={[...selGroup.rows].sort((a, b) => b.f.sanctioned - a.f.sanctioned)} onPick={onPick} />
          </FundCard>
        </>
      )}
    </>
  );
}

/* ─────────────────────── T-25 · One selected project ─────────────────────── */

function SelectedProject({ row, onOpenProfile, onClear }: { row: FundRow; onOpenProfile: () => void; onClear: () => void }): JSX.Element {
  const { p, f, scheme } = row;
  const fundingSource = p.fundingSourceType ? (String(p.fundingSourceType) as FundingSource) : null;
  const shares = fundingSource
    ? sharePercentsOf({ fundingSource, centralSharePct: p.centralSharePct ?? null, stateSharePct: p.stateSharePct ?? null })
    : null;
  const label = 'text-[10.5px] font-bold text-[#6B7280]';
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5" data-testid="selected-project">
        <h2 className="text-[15px] font-extrabold text-[#111827]">
          {p.projectName}{' '}
          <span className="text-[12px] font-medium text-[#6B7280]">
            · {scheme}
            {p.fundSanctionAgency ? ` · ${String(p.fundSanctionAgency)}` : ''}
          </span>
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenProfile}
            className="rounded-[7px] border border-[#2563EB] bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1D4ED8]"
          >
            Open project profile →
          </button>
          <button type="button" onClick={onClear} className="rounded-[7px] border border-[#D1D5DB] bg-white px-3.5 py-1.5 text-[12px] hover:bg-[#F9FAFB]">
            Clear
          </button>
        </div>
      </div>

      <FundsBlock key={p.id} rows={[row]} title="Flow of Funds — this project" sub="₹ Cr. · band thickness = amount" />

      <FundCard className="px-[18px] py-3.5" testId="project-uc-status">
        <h3 className="mb-2 text-[13px] font-bold">UC status for this project</h3>
        <div className="grid grid-cols-2 gap-3 text-[12.5px] md:grid-cols-4">
          <div>
            <div className={label}>UC SENT TO DEPT.?</div>
            <div className="font-extrabold" style={{ color: f.ucSent ? '#15803D' : '#B91C1C' }}>
              {f.ucSent ? `✅ Yes — ${fmtD(p.ucSubmissionDate)}` : '❌ Not sent'}
            </div>
            <div className="text-[11px] text-[#6B7280]">
              {p.ucSentTo ? String(p.ucSentTo) : ''}
              {f.ucDays !== null ? `${p.ucSentTo ? ' · ' : ''}${f.ucDays} days ago` : ''}
            </div>
          </div>
          <div>
            <div className={label}>STATUS</div>
            <UcStatusPill status={f.ucStatus} />
          </div>
          <div>
            <div className={label}>COVERED BY UC</div>
            <div className="font-extrabold">{cr(Math.min(f.ucCertified, f.paid))} Cr.</div>
          </div>
          <div>
            <div className={label}>SPENT, NOT COVERED</div>
            <div className="font-extrabold" style={{ color: f.ucUncovered > 0.005 ? '#B91C1C' : '#15803D' }}>
              {cr(f.ucUncovered)} Cr.
            </div>
          </div>
          {p.ucSanctionNo || p.ucSanctionDate ? (
            <div className="col-span-full text-[12px] text-[#4B5563]">
              Sanction ref: <b>{p.ucSanctionNo ? String(p.ucSanctionNo) : '—'}</b> dated {fmtD(p.ucSanctionDate)}
            </div>
          ) : null}
          {fundingSource ? (
            <div className="col-span-full text-[12px] text-[#4B5563]">
              Funding source: <b>{fundingSource}</b>
              {shares && shares.centralPct !== null && shares.statePct !== null
                ? ` · Central ${shares.centralPct}% / State ${shares.statePct}%`
                : ''}
            </div>
          ) : null}
          {p.ucRemarks ? <div className="col-span-full whitespace-pre-wrap text-[12px] text-[#4B5563]">Remarks: {String(p.ucRemarks)}</div> : null}
        </div>
      </FundCard>
    </>
  );
}
