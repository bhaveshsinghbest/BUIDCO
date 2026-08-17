import { useRef, useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

export interface MultiSelectFieldProps {
  label: string;
  value: number[];
  onChange: (value: number[]) => void;
  options: Array<{ value: number; label: string }>;
  placeholder?: string;
  className?: string;
  hint?: string;
  disabled?: boolean;
  /** When provided, an "+ Add New …" row appears at the end of the
   *  dropdown (e.g. "+ Add New Scheme") that calls this instead of adding
   *  an existing option — the caller opens its own create-new dialog. */
  onAddNew?: () => void;
  /** Label for the add-new row. Defaults to "+ Add New". */
  addNewLabel?: string;
}

/**
 * Chip-style multi-select for scheme picking. Renders selected values as
 * removable chips + a dropdown of remaining options. Closes on outside click.
 */
export function MultiSelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Add…',
  className,
  hint,
  disabled = false,
  onAddNew,
  addNewLabel = '+ Add New',
}: MultiSelectFieldProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current || !e.target) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const selected = new Set(value);
  const available = options.filter((o) => !selected.has(o.value));

  const add = (v: number): void => {
    if (disabled) return;
    if (!selected.has(v)) onChange([...value, v]);
    setOpen(false);
  };
  const remove = (v: number): void => {
    if (disabled) return;
    onChange(value.filter((x) => x !== v));
  };

  return (
    <div className={cn('grid gap-1', className)}>
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#374151]">
        {label}
      </span>
      <div ref={ref} className="relative">
        <div
          className={cn(
            'flex min-h-9 flex-wrap items-center gap-1.5 rounded border border-[#D1D5DB] p-1.5',
            disabled ? 'cursor-not-allowed bg-[#F9FAFB]' : 'bg-white',
          )}
        >
          {value.map((v) => {
            const opt = options.find((o) => o.value === v);
            const chipLabel = opt?.label ?? `#${v}`;
            return (
              <span
                key={v}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  disabled
                    ? 'bg-[#F3F4F6] text-[#6B7280]'
                    : 'bg-[#EFF6FF] text-[#1D4ED8]',
                )}
              >
                {chipLabel}
                {disabled ? null : (
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    className="text-[#1D4ED8] hover:text-[#B91C1C]"
                    aria-label={`Remove ${chipLabel}`}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
          {disabled ? null : (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="ml-auto rounded px-2 py-0.5 text-[11px] font-semibold text-[#1E3A5F] hover:bg-[#F3F4F6]"
              disabled={available.length === 0 && !onAddNew}
            >
              {available.length === 0 && !onAddNew ? 'All added' : placeholder}
            </button>
          )}
        </div>
        {open && !disabled && (available.length > 0 || onAddNew) ? (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded border border-[#E5E7EB] bg-white shadow-lg">
            {available.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => add(o.value)}
                className="block w-full px-3 py-1.5 text-left text-[12.5px] text-[#111827] hover:bg-[#F3F4F6]"
              >
                {o.label}
              </button>
            ))}
            {onAddNew ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAddNew();
                }}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-[12.5px] font-semibold text-[#1D4ED8] hover:bg-[#EFF6FF]',
                  available.length > 0 && 'border-t border-[#F3F4F6]',
                )}
              >
                {addNewLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {hint ? <span className="text-[10.5px] text-[#6B7280]">{hint}</span> : null}
    </div>
  );
}
