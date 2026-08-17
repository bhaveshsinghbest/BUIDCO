/**
 * Reusable "⚙ Columns" (Customizable Fields) + "⬇ Download" corner controls
 * (Task 8), styled to match the pattern already shipped on the Projects
 * table (components/projects/ProjectsTable.tsx) so every table gets the
 * same look without duplicating that page's JSX.
 */
import { useRef, useState } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { ExportFormat } from '../../lib/tableExport';
import { Button } from './button';

export interface ToolbarColumn {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

export function useColumnVisibility(
  storageKey: string,
  columns: ToolbarColumn[],
): {
  visibility: Record<string, boolean>;
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
  showAll: () => void;
  hideAll: () => void;
} {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      /* localStorage unavailable */
    }
    const defaults: Record<string, boolean> = {};
    for (const c of columns) defaults[c.key] = c.defaultVisible !== false;
    return defaults;
  });

  const persist = (next: Record<string, boolean>): void => {
    setVisibility(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* localStorage unavailable */
    }
  };

  return {
    visibility,
    isVisible: (key: string) => visibility[key] !== false,
    toggle: (key: string) => persist({ ...visibility, [key]: !(visibility[key] !== false) }),
    showAll: () => {
      const next: Record<string, boolean> = {};
      for (const c of columns) next[c.key] = true;
      persist(next);
    },
    hideAll: () => {
      const next: Record<string, boolean> = {};
      for (const c of columns) next[c.key] = false;
      persist(next);
    },
  };
}

export function ColumnsButton({
  columns,
  visibility,
  onToggle,
  onShowAll,
  onHideAll,
  label = 'Columns',
  panelTitle = 'Column visibility',
}: {
  columns: ToolbarColumn[];
  visibility: Record<string, boolean>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  /** Button text, e.g. "Customize Fields" for the Overview dashboard. Defaults to "Columns" for table use. */
  label?: string;
  /** Popover header, e.g. "Field visibility". Defaults to "Column visibility". */
  panelTitle?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));
  const visibleCount = columns.filter((c) => visibility[c.key] !== false).length;

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen((p) => !p)} aria-expanded={open}>
        ⚙ {label} ({visibleCount}/{columns.length})
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-[#374151]">
            {panelTitle}
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" onClick={onShowAll}>
                Show all
              </Button>
              <Button variant="ghost" size="xs" onClick={onHideAll}>
                Hide all
              </Button>
            </div>
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {columns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-xs text-[#374151]">
                <input
                  type="checkbox"
                  checked={visibility[c.key] !== false}
                  onChange={() => onToggle(c.key)}
                  className="h-3.5 w-3.5"
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ExportButton({
  onExport,
  exporting,
}: {
  onExport: (format: ExportFormat) => void;
  exporting: ExportFormat | null;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));
  const label =
    exporting === 'excel' ? 'Excel' : exporting === 'pdf' ? 'PDF' : exporting === 'pptx' ? 'PowerPoint' : '';

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        disabled={exporting !== null}
      >
        {exporting ? `Exporting ${label}…` : '⬇ Download'}
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-[#E5E7EB] bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onExport('excel');
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-[#374151] hover:bg-[#F3F4F6]"
          >
            Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onExport('pdf');
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-[#374151] hover:bg-[#F3F4F6]"
          >
            PDF (.pdf)
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onExport('pptx');
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-[#374151] hover:bg-[#F3F4F6]"
          >
            PowerPoint (.pptx)
          </button>
        </div>
      ) : null}
    </div>
  );
}
