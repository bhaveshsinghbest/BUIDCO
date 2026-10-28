import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useListCosEotRecordsQuery } from '../app/api/kpisApi';
import { useGetLookupsQuery } from '../app/api/lookupsApi';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { ColumnFilterText, ColumnFilterSelect, textMatches, selectMatches, minMatches } from '../components/ui/ColumnFilter';
import { ColumnsButton, ExportButton, useColumnVisibility, type ToolbarColumn } from '../components/ui/TableToolbar';
import { useTableExport, type ExportColumn, type ExportFormat } from '../lib/tableExport';
import { cn } from '../lib/utils';
import { formatCurrencyCr, formatDate } from '../lib/formatters';
import { CosEotDetailDialog } from '../components/cosEot/CosEotDetailDialog';
import type { CosCategory, CosEotRecord } from '../types/api';

const CATEGORIES: CosCategory[] = [
  'SCOPE ADDITION',
  'SCOPE DELETION',
  'DESIGN CHANGE',
  'QUANTITY VARIATION',
  'OTHERS',
];

const PAGE_SIZE = 25;

interface ColFilters {
  project: string;
  sectorId: string;
  districtId: string;
  cosNumber: string;
  category: string;
  minAmount: string;
  minVariation: string;
  eotNumber: string;
  minEotDays: string;
}
const EMPTY_FILTERS: ColFilters = {
  project: '', sectorId: '', districtId: '', cosNumber: '', category: '',
  minAmount: '', minVariation: '', eotNumber: '', minEotDays: '',
};

// Task 8 — Customizable Fields / Download.
const COS_COLUMNS: ToolbarColumn[] = [
  { key: 'sno', label: '#' },
  { key: 'project', label: 'Project' },
  { key: 'sector', label: 'Sector' },
  { key: 'district', label: 'District' },
  { key: 'cosNumber', label: 'CoS #' },
  { key: 'cosDate', label: 'CoS Date' },
  { key: 'category', label: 'Category' },
  { key: 'amount', label: 'Amount' },
  { key: 'variation', label: 'Variation' },
  { key: 'eotNumber', label: 'EoT #' },
  { key: 'eotDays', label: 'EoT Days' },
  { key: 'revisedEnd', label: 'Revised End' },
];
const COS_STORAGE_KEY = 'buidco.cosEot.columns.v1';

interface CosExportRow {
  sno: number;
  project: string;
  sector: string;
  district: string;
  cosNumber: string;
  cosDate: string;
  category: string;
  amount: string;
  variation: string;
  eotNumber: string;
  eotDays: string;
  revisedEnd: string;
}
const COS_EXPORT_COLUMNS: ExportColumn<CosExportRow>[] = [
  { key: 'sno', label: '#', align: 'right', exportValue: (r) => r.sno },
  { key: 'project', label: 'Project', exportValue: (r) => r.project },
  { key: 'sector', label: 'Sector', exportValue: (r) => r.sector },
  { key: 'district', label: 'District', exportValue: (r) => r.district },
  { key: 'cosNumber', label: 'CoS #', exportValue: (r) => r.cosNumber },
  { key: 'cosDate', label: 'CoS Date', exportValue: (r) => r.cosDate },
  { key: 'category', label: 'Category', exportValue: (r) => r.category },
  { key: 'amount', label: 'Amount', align: 'right', exportValue: (r) => r.amount },
  { key: 'variation', label: 'Variation', align: 'right', exportValue: (r) => r.variation },
  { key: 'eotNumber', label: 'EoT #', exportValue: (r) => r.eotNumber },
  { key: 'eotDays', label: 'EoT Days', align: 'right', exportValue: (r) => r.eotDays },
  { key: 'revisedEnd', label: 'Revised End', exportValue: (r) => r.revisedEnd },
];

export function CosEotPage(): JSX.Element {
  const [offset, setOffset] = useState(0);
  // Task 5 — the CoS/EoT record whose detail dialog is open, if any.
  // Task 5 — which CoS/EoT record has its detail dialog open. Held as an id,
  // not the row object: after an edit saves, the list refetches and a
  // snapshot would keep showing the pre-edit values. Resolving the id
  // against the live query result means the dialog shows what was saved.
  const [selectedCosId, setSelectedCosId] = useState<number | null>(null);
  const { data, isLoading, isFetching } = useListCosEotRecordsQuery({
    limit: PAGE_SIZE,
    offset,
  });
  const lookups = useGetLookupsQuery();

  // Task 5 — Table Column Filter (replaces the old category chips, then the
  // popover Filter button) — each column narrows the table independently.
  const [colFilters, setColFilters] = useState<ColFilters>(EMPTY_FILTERS);
  const setCol = <K extends keyof ColFilters>(key: K, value: string): void =>
    setColFilters((prev) => ({ ...prev, [key]: value }));
  const activeFilterCount = Object.values(colFilters).filter((v) => v.trim() !== '').length;

  const districtsById = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of lookups.data?.districts ?? []) map.set(d.districtId, d.districtName);
    return map;
  }, [lookups.data]);
  const sectorsById = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of lookups.data?.sectors ?? []) map.set(s.sectorId, s.sectorName);
    return map;
  }, [lookups.data]);

  const filteredItems = useMemo(() => {
    const raw = data?.items ?? [];
    return raw.filter((r) =>
      textMatches(colFilters.project, r.projectName) &&
      selectMatches(colFilters.sectorId, r.sectorId === null ? '' : String(r.sectorId)) &&
      selectMatches(colFilters.districtId, r.districtId === null ? '' : String(r.districtId)) &&
      textMatches(colFilters.cosNumber, r.cosNumber) &&
      selectMatches(colFilters.category, r.category) &&
      minMatches(colFilters.minAmount, r.cosAmountCr) &&
      minMatches(colFilters.minVariation, r.variationPct) &&
      textMatches(colFilters.eotNumber, r.eotNumber) &&
      minMatches(colFilters.minEotDays, r.eotDaysGranted),
    );
  }, [data, colFilters]);

  /** The open record, resolved fresh from the current page of results. */
  const selectedRecord = useMemo<CosEotRecord | null>(
    () => (data?.items ?? []).find((r) => r.cosId === selectedCosId) ?? null,
    [data, selectedCosId],
  );

  const totals = useMemo(() => {
    const raw = data?.items ?? [];
    return {
      pageCount: raw.length,
      totalAmount: raw.reduce((s, r) => s + (r.cosAmountCr ?? 0), 0),
      totalEotDays: raw.reduce((s, r) => s + (r.eotDaysGranted ?? 0), 0),
    };
  }, [data]);

  const { visibility, isVisible, toggle, showAll, hideAll } = useColumnVisibility(COS_STORAGE_KEY, COS_COLUMNS);
  const { exporting, error: exportError, run } = useTableExport<CosExportRow>();

  const runExport = (format: ExportFormat): void => {
    const exportRows: CosExportRow[] = filteredItems.map((r, i) => ({
      sno: offset + i + 1,
      project: r.projectName ?? r.projectId,
      sector: r.sectorId ? sectorsById.get(r.sectorId) ?? `#${r.sectorId}` : '—',
      district: r.districtId ? districtsById.get(r.districtId) ?? `#${r.districtId}` : '—',
      cosNumber: r.cosNumber ?? '—',
      cosDate: formatDate(r.cosDate),
      category: r.category ?? '—',
      amount: formatCurrencyCr(r.cosAmountCr),
      variation: r.variationPct !== null ? `${r.variationPct}%` : '—',
      eotNumber: r.eotNumber ?? '—',
      eotDays: `${r.eotDaysGranted ?? 0} d`,
      revisedEnd: formatDate(r.revisedDate ?? r.newEndDate),
    }));
    void run(
      format,
      COS_EXPORT_COLUMNS.filter((c) => isVisible(c.key)),
      exportRows,
      { title: 'BUIDCO - CoS / EoT Records', sheetName: 'CoS-EoT', fileNamePrefix: 'CoS_EoT' },
    );
  };

  return (
    <article className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-[#111827]">Change of Scope / Extension of Time</h1>
        <p className="text-[12.5px] text-[#6B7280]">
          All CoS/EoT records across every project. Add/edit rows from a project&apos;s Input Sheet →
          Section 04.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Metric label="Records on page" value={String(totals.pageCount)} tone="brand" />
        <Metric label="Total CoS value" value={formatCurrencyCr(totals.totalAmount)} tone="info" />
        <Metric label="Total EoT days" value={`${totals.totalEotDays} d`} tone="warn" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {activeFilterCount > 0 ? (
          <>
            <span className="text-[11.5px] text-[#6B7280]">
              {filteredItems.length} of {data?.items.length ?? 0} on this page match {activeFilterCount} column filter{activeFilterCount === 1 ? '' : 's'}.
            </span>
            <button
              type="button"
              onClick={() => setColFilters(EMPTY_FILTERS)}
              className="text-[11.5px] font-semibold text-[#B91C1C] hover:underline"
            >
              Clear column filters
            </button>
          </>
        ) : null}
        {exportError ? <span className="text-[11.5px] text-[#B91C1C]">{exportError}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <ColumnsButton
            columns={COS_COLUMNS}
            visibility={visibility}
            onToggle={toggle}
            onShowAll={showAll}
            onHideAll={hideAll}
          />
          <ExportButton onExport={runExport} exporting={exporting} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
              No CoS/EoT records match the current filter.
            </div>
          ) : (
            // Task 4 — vertical scrolling happens inside this box rather than
            // the page, which is what gives the header something to stick to.
            // overflow-auto (not overflow-x-auto) keeps the horizontal scroll.
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[1080px] border-collapse text-[12.5px]">
                <thead>
                  {/* Opaque background so rows pass cleanly underneath, and an
                      inset shadow because border-collapse drops a sticky
                      cell's own border. align-top keeps the column filters
                      lined up with their headings. */}
                  <tr className="bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280] [&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:bg-[#F9FAFB] [&>th]:shadow-[inset_0_-1px_0_#E5E7EB]">
                    {isVisible('sno') ? <th className="px-3 py-2 text-left align-top">#</th> : null}
                    {isVisible('project') ? (
                      <th className="px-3 py-2 text-left align-top">
                        <div>Project</div>
                        <ColumnFilterText value={colFilters.project} onChange={(v) => setCol('project', v)} />
                      </th>
                    ) : null}
                    {isVisible('sector') ? (
                      <th className="px-3 py-2 text-left align-top">
                        <div>Sector</div>
                        <ColumnFilterSelect
                          value={colFilters.sectorId}
                          onChange={(v) => setCol('sectorId', v)}
                          options={(lookups.data?.sectors ?? []).map((s) => ({ value: String(s.sectorId), label: s.sectorName }))}
                        />
                      </th>
                    ) : null}
                    {isVisible('district') ? (
                      <th className="px-3 py-2 text-left align-top">
                        <div>District</div>
                        <ColumnFilterSelect
                          value={colFilters.districtId}
                          onChange={(v) => setCol('districtId', v)}
                          options={(lookups.data?.districts ?? []).map((d) => ({ value: String(d.districtId), label: d.districtName }))}
                        />
                      </th>
                    ) : null}
                    {isVisible('cosNumber') ? (
                      <th className="px-3 py-2 text-left align-top">
                        <div>CoS #</div>
                        <ColumnFilterText value={colFilters.cosNumber} onChange={(v) => setCol('cosNumber', v)} />
                      </th>
                    ) : null}
                    {isVisible('cosDate') ? <th className="px-3 py-2 text-left align-top">CoS Date</th> : null}
                    {isVisible('category') ? (
                      <th className="px-3 py-2 text-left align-top">
                        <div>Category</div>
                        <ColumnFilterSelect
                          value={colFilters.category}
                          onChange={(v) => setCol('category', v)}
                          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                        />
                      </th>
                    ) : null}
                    {isVisible('amount') ? (
                      <th className="px-3 py-2 text-right align-top">
                        <div>Amount</div>
                        <ColumnFilterText value={colFilters.minAmount} onChange={(v) => setCol('minAmount', v)} placeholder="≥ Cr" align="right" />
                      </th>
                    ) : null}
                    {isVisible('variation') ? (
                      <th className="px-3 py-2 text-right align-top">
                        <div>Variation</div>
                        <ColumnFilterText value={colFilters.minVariation} onChange={(v) => setCol('minVariation', v)} placeholder="≥ %" align="right" />
                      </th>
                    ) : null}
                    {isVisible('eotNumber') ? (
                      <th className="px-3 py-2 text-left align-top">
                        <div>EoT #</div>
                        <ColumnFilterText value={colFilters.eotNumber} onChange={(v) => setCol('eotNumber', v)} />
                      </th>
                    ) : null}
                    {isVisible('eotDays') ? (
                      <th className="px-3 py-2 text-right align-top">
                        <div>EoT Days</div>
                        <ColumnFilterText value={colFilters.minEotDays} onChange={(v) => setCol('minEotDays', v)} placeholder="≥" align="right" />
                      </th>
                    ) : null}
                    {isVisible('revisedEnd') ? <th className="px-3 py-2 text-left align-top">Revised End</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((r, idx) => (
                    <tr
                      key={r.cosId}
                      className={cn(
                        'border-b border-[#F3F4F6] hover:bg-[#F9FAFB]',
                        idx % 2 === 1 && 'bg-[#FAFAFA]',
                      )}
                    >
                      {isVisible('sno') ? <td className="px-3 py-2 text-[#9CA3AF]">{offset + idx + 1}</td> : null}
                      {isVisible('project') ? (
                        <td className="px-3 py-2">
                          <NavLink
                            to={`/projects/${r.projectId}`}
                            className="font-semibold text-[#1D4ED8] hover:underline"
                          >
                            {r.projectName ?? r.projectId}
                          </NavLink>
                        </td>
                      ) : null}
                      {isVisible('sector') ? (
                        <td className="px-3 py-2 text-[#374151]">
                          {r.sectorId ? sectorsById.get(r.sectorId) ?? `#${r.sectorId}` : '—'}
                        </td>
                      ) : null}
                      {isVisible('district') ? (
                        <td className="px-3 py-2 text-[#374151]">
                          {r.districtId ? districtsById.get(r.districtId) ?? `#${r.districtId}` : '—'}
                        </td>
                      ) : null}
                      {isVisible('cosNumber') ? (
                        <td className="px-3 py-2 font-semibold text-[#7C3AED]">
                          {/* Task 5 — opens the detail dialog. A button, not a
                              styled span, so it is reachable by keyboard and
                              announced as actionable. */}
                          <button
                            type="button"
                            onClick={() => setSelectedCosId(r.cosId)}
                            title="View CoS / EoT details"
                            className="rounded underline decoration-dotted underline-offset-2 transition-colors hover:text-[#5B21B6] hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
                          >
                            {r.cosNumber ?? `CoS #${r.cosId}`}
                          </button>
                        </td>
                      ) : null}
                      {isVisible('cosDate') ? <td className="px-3 py-2 text-[#374151]">{formatDate(r.cosDate)}</td> : null}
                      {isVisible('category') ? <td className="px-3 py-2 text-[#374151]">{r.category ?? '—'}</td> : null}
                      {isVisible('amount') ? (
                        <td className="px-3 py-2 text-right tabular-nums text-[#1E3A5F]">
                          {formatCurrencyCr(r.cosAmountCr)}
                        </td>
                      ) : null}
                      {isVisible('variation') ? (
                        <td
                          className={cn(
                            'px-3 py-2 text-right tabular-nums font-semibold',
                            (r.variationPct ?? 0) > 0 ? 'text-[#059669]' : 'text-[#6B7280]',
                          )}
                        >
                          {r.variationPct !== null ? `${r.variationPct}%` : '—'}
                        </td>
                      ) : null}
                      {isVisible('eotNumber') ? <td className="px-3 py-2 text-[#374151]">{r.eotNumber ?? '—'}</td> : null}
                      {isVisible('eotDays') ? (
                        <td className="px-3 py-2 text-right tabular-nums text-[#2563EB]">
                          {r.eotDaysGranted ?? 0} d
                        </td>
                      ) : null}
                      {isVisible('revisedEnd') ? (
                        <td className="px-3 py-2 text-[#374151]">
                          {formatDate(r.revisedDate ?? r.newEndDate)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-[#F3F4F6] bg-[#F9FAFB] px-4 py-2 text-[11.5px] text-[#6B7280]">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setOffset(0)}
              disabled={offset === 0 || isFetching}
            >
              ⏮ First page
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || isFetching}
            >
              ← Prev
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => data?.nextOffset !== null && setOffset(data?.nextOffset ?? offset)}
              disabled={data?.nextOffset === null || isFetching}
            >
              Next →
            </Button>
            <span className="ml-2 tabular-nums">
              Offset {offset} · {data?.items.length ?? 0} shown
              {isFetching ? ' · loading…' : ''}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Task 5 — detail dialog for the clicked CoS #. Mounted at the page
          level so it overlays the whole table rather than a single row. */}
      {selectedRecord ? (
        <CosEotDetailDialog
          record={selectedRecord}
          onClose={() => setSelectedCosId(null)}
        />
      ) : null}
    </article>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'info' | 'warn';
}): JSX.Element {
  const palette: Record<typeof tone, string> = {
    brand: 'border-t-[#1E3A5F] text-[#1E3A5F]',
    info: 'border-t-[#1D4ED8] text-[#1D4ED8]',
    warn: 'border-t-[#B45309] text-[#B45309]',
  };
  return (
    <div
      className={cn(
        'rounded border-t-4 border-x border-b border-[#E5E7EB] bg-white px-3 py-2 shadow-sm',
        palette[tone],
      )}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">{label}</div>
      <div className={cn('text-xl font-extrabold tabular-nums', palette[tone].split(' ').pop())}>
        {value}
      </div>
    </div>
  );
}
