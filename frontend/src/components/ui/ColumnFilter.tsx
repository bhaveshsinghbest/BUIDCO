import { cn } from '../../lib/utils';

/**
 * Per-column filter controls embedded directly in a `<th>`, below the
 * column label. Used across every "Table Column Filter" table (Sectors,
 * Schemes, Divisions, Management Action, CoS/EoT, O&M) so each column
 * narrows the table's rows independently, in place of a single shared
 * "Filter" popover button.
 *
 * `stopPropagation` on click/keydown keeps typing/selecting from also
 * triggering a parent `<tr>`'s onClick (several of these tables have
 * clickable rows that open a profile/modal).
 */
export function ColumnFilterText({
  value,
  onChange,
  placeholder = 'Filter…',
  align = 'left',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  align?: 'left' | 'right';
}): JSX.Element {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className={cn(
        'mt-1 h-6 w-full min-w-[64px] rounded border border-[#D1D5DB] bg-white px-1.5',
        'text-[10.5px] font-normal normal-case tracking-normal text-[#111827]',
        'placeholder:text-[#9CA3AF] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1E3A5F]',
        align === 'right' && 'text-right',
      )}
    />
  );
}

export function ColumnFilterSelect({
  value,
  onChange,
  options,
  allLabel = 'All',
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  allLabel?: string;
}): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="mt-1 h-6 w-full min-w-[74px] rounded border border-[#D1D5DB] bg-white px-1 text-[10.5px] font-normal normal-case tracking-normal text-[#111827] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1E3A5F]"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Case-insensitive substring match; empty filter always passes. */
export function textMatches(filterValue: string, cellValue: string | null | undefined): boolean {
  const term = filterValue.trim().toLowerCase();
  if (!term) return true;
  return (cellValue ?? '').toLowerCase().includes(term);
}

/** Exact match against a select-style filter; empty filter always passes. */
export function selectMatches(filterValue: string, cellValue: string | null | undefined): boolean {
  if (!filterValue) return true;
  return cellValue === filterValue;
}

/** "≥ N" numeric filter; empty or non-numeric filter always passes. */
export function minMatches(filterValue: string, cellValue: number | null | undefined): boolean {
  const term = filterValue.trim();
  if (!term) return true;
  const min = Number(term);
  if (!Number.isFinite(min)) return true;
  return (cellValue ?? 0) >= min;
}
