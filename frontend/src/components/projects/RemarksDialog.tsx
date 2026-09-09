import { useState } from 'react';
import { useUpdateProjectMutation } from '../../app/api/projectsApi';
import { remarkStyleOf } from '../../lib/remarkTone';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

/**
 * The trigger for RemarksDialog — a small pill button showing a preview of
 * the current remark (or an "Add remark" prompt when empty). Shared so the
 * MD Portfolio Briefing table and the Tender Dashboard drill-down table
 * render an identical control.
 *
 * `stopRowActivation` guards against a parent row that listens for
 * click/Enter/Space to select itself (e.g. a clickable `<tr>`) — without it,
 * activating this button would also fire the row's own handler since both
 * click and keydown bubble.
 */
export function RemarksButton({
  remark, onClick, stopRowActivation = false,
}: {
  remark: string | null;
  onClick: () => void;
  stopRowActivation?: boolean;
}): JSX.Element {
  // Colour and glyph come from the shared classifier so this pill reads the
  // same in the Tender Dashboard, the MD briefing and anywhere else it lands.
  const style = remarkStyleOf(remark);
  return (
    <button
      type="button"
      onClick={(e) => { if (stopRowActivation) e.stopPropagation(); onClick(); }}
      onKeyDown={
        stopRowActivation
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }
          : undefined
      }
      title={remark ? `${style.label}: ${remark}` : undefined}
      className={cn(
        'max-w-[160px] truncate rounded border px-2 py-1 text-[11px] font-semibold transition-colors',
        remark ? style.chip : 'border-[#D1D5DB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]',
      )}
    >
      {remark ? (
        <>
          {/* Tone named on the glyph, not via an absolutely-positioned
              .sr-only span — these pills sit in horizontally-scrolling
              tables where such a span escapes the scroll container. */}
          <span role="img" aria-label={style.label}>
            {style.icon}
          </span>{' '}
          {remark}
        </>
      ) : (
        '+ Add remark'
      )}
    </button>
  );
}

interface Props {
  projectId: string;
  projectName: string;
  /** Current value of the project's remark (same field the Input Sheet's
   *  Action & Remarks / Outstanding Gap flag reads and writes). */
  initialRemark: string | null;
  onClose: () => void;
}

/**
 * Small, responsive "Remarks" editor shared by the MD Portfolio Briefing
 * projects table and the Tender Dashboard's stage drill-down table. Both
 * read/write the same `project.remark` field used by the Input Sheet's
 * Action & Remarks section, so a remark entered here shows up there too
 * (and vice versa) — this is intentionally the same underlying data, just
 * a faster entry point from two management-focused views.
 */
export function RemarksDialog({ projectId, projectName, initialRemark, onClose }: Props): JSX.Element {
  const [value, setValue] = useState(initialRemark ?? '');
  const [updateProject, updateState] = useUpdateProjectMutation();
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    setError(null);
    try {
      await updateProject({
        projectId,
        body: { remark: value.trim() === '' ? null : value },
      }).unwrap();
      onClose();
    } catch (err) {
      setError(readError(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remarks-dialog-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={updateState.isLoading ? undefined : onClose}
      />
      <div className="relative w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white shadow-2xl">
        <header className="border-b border-[#F3F4F6] px-4 py-3 sm:px-5">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">Remarks</p>
          <h3 id="remarks-dialog-title" className="mt-0.5 truncate text-[14.5px] font-bold text-[#111827]">
            {projectName}
          </h3>
        </header>

        <div className="px-4 py-4 sm:px-5">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              Remark
            </span>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={5}
              placeholder="Add a remark for this project…"
              autoFocus
              disabled={updateState.isLoading}
              className="w-full resize-y rounded-md border border-[#D1D5DB] bg-white px-3 py-2 text-[13px] text-[#111827] outline-none focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] disabled:cursor-not-allowed disabled:bg-[#F9FAFB]"
            />
          </label>
          {error ? <p className="mt-2 text-[12px] text-[#B91C1C]">{error}</p> : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#F3F4F6] px-4 py-3 sm:px-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={updateState.isLoading}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={updateState.isLoading}>
            {updateState.isLoading ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </div>
    </div>
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
  return 'Could not save remark. Please retry.';
}
