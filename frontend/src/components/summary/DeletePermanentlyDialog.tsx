import { useEffect, useRef } from 'react';
import { Button } from '../ui/button';

/**
 * Confirmation gate for permanently deleting a Scheme or Sector
 * (bhaveshTask.md Task 3).
 *
 * The wording is the task's, verbatim, because the consequence is genuinely
 * irreversible and the user needs to read that it takes projects with it —
 * not just the scheme or sector they clicked on.
 *
 * Cancel is the default focus and Escape cancels, so the destructive path
 * always takes a deliberate action rather than a stray Enter.
 */
export function DeletePermanentlyDialog({
  kind,
  name,
  impactNote,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  kind: 'Scheme' | 'Sector';
  name: string;
  /** Optional plain-language note about what will actually be removed. */
  impactNote?: string | undefined;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-permanently-title"
    >
      {/* Named "Close" rather than "Cancel" so it doesn't collide with the
          footer's Cancel button — two controls sharing an accessible name in
          one dialog is ambiguous for screen readers and for tests alike. */}
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <div className="relative w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white shadow-2xl">
        <header className="border-b border-[#F3F4F6] px-5 py-4">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#B91C1C]">
            Permanent deletion
          </p>
          <h3 id="delete-permanently-title" className="mt-1 text-[16px] font-bold text-[#111827]">
            Do you want to delete this permanently?
          </h3>
        </header>

        <div className="space-y-3 px-5 py-4">
          <p className="text-[13px] leading-relaxed text-[#374151]">
            This action will also delete all projects associated with this {kind} and cannot be
            undone.
          </p>
          <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#B91C1C]">
              {kind}
            </div>
            <div className="mt-0.5 text-[13.5px] font-semibold text-[#111827]">{name}</div>
            {impactNote ? (
              <div className="mt-1.5 text-[11.5px] text-[#7F1D1D]">{impactNote}</div>
            ) : null}
          </div>
          {error ? <p className="text-[12px] text-[#B91C1C]">{error}</p> : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#F3F4F6] px-5 py-3">
          <Button ref={cancelRef} variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete Permanently'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
