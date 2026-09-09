import { useRef, useState } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { DELAY_WINDOWS, type DelayWindowKey } from '../../lib/projectDelay';
import { cn } from '../../lib/utils';

/**
 * "Delayed Projects" filter (bhaveshTask.md Task 9) — shared by the Projects
 * table and the Tender Dashboard drill-in so both offer the same options and
 * the same behaviour.
 *
 * Closes on outside click and on Escape (Task 5), and exposes a Clear entry
 * so the filter can always be reset without hunting for a "none" option.
 */
export function DelayFilterDropdown({
  value,
  onChange,
  className,
}: {
  value: DelayWindowKey | '';
  onChange: (v: DelayWindowKey | '') => void;
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const selected = DELAY_WINDOWS.find((w) => w.key === value);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Filter by how far a project is behind schedule"
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A5F]/30',
          selected
            ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
            : 'border-[#D1D5DB] bg-white text-[#6B7280] hover:text-[#374151]',
        )}
      >
        {selected ? `Delayed: ${selected.label}` : 'Delayed Projects'}
        <span aria-hidden className={cn('text-[8px] transition-transform', open && 'rotate-180')}>
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-52 rounded-md border border-[#E5E7EB] bg-white p-1 shadow-lg"
        >
          {DELAY_WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              role="menuitemradio"
              aria-checked={value === w.key}
              onClick={() => {
                onChange(w.key);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] transition-colors',
                value === w.key
                  ? 'bg-[#EFF6FF] font-semibold text-[#1D4ED8]'
                  : 'text-[#374151] hover:bg-[#F3F4F6]',
              )}
            >
              {w.label}
              {value === w.key ? <span aria-hidden>✓</span> : null}
            </button>
          ))}
          <div className="my-1 border-t border-[#F3F4F6]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            disabled={!value}
            className={cn(
              'w-full rounded px-2 py-1.5 text-left text-[12px] transition-colors',
              value
                ? 'text-[#B91C1C] hover:bg-[#FEF2F2]'
                : 'cursor-not-allowed text-[#D1D5DB]',
            )}
          >
            Clear filter
          </button>
        </div>
      ) : null}
    </div>
  );
}
