/**
 * Shared "Add New Sector" / "Add New Scheme" dialog — both are a single
 * Name field (that's all sector/scheme have in the database), reused from
 * three entry points: the Sectors/Schemes pages' top-right button, and the
 * Input Sheet's Sector/Scheme dropdowns' "+ Add New …" option.
 */
import { useState } from 'react';
import { Button } from './button';

export interface AddLookupItemDialogProps {
  /** e.g. "Add New Sector" */
  title: string;
  /** e.g. "Sector Name" */
  fieldLabel: string;
  /** e.g. "e.g. Water Supply" */
  placeholder?: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
  /** Called with the created item after a successful save (e.g. to
   *  auto-select it in the field the user was just editing). */
  onCreated?: (result: unknown) => void;
}

export function AddLookupItemDialog({
  title,
  fieldLabel,
  placeholder,
  onSubmit,
  onClose,
  onCreated,
}: AddLookupItemDialogProps): JSX.Element {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() !== '';

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const result = await onSubmit(name.trim());
      onCreated?.(result);
      onClose();
    } catch (err) {
      setError(readError(err));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-lookup-item-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white shadow-2xl">
        <header className="border-b border-[#F3F4F6] px-5 py-3.5">
          <h3 id="add-lookup-item-title" className="text-[14.5px] font-bold text-[#111827]">
            {title}
          </h3>
        </header>

        <div className="space-y-3 px-5 py-4">
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
              {fieldLabel} <span className="text-[#B91C1C]">*</span>
            </span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
              placeholder={placeholder}
              disabled={saving}
              className="h-9 w-full rounded border border-[#D1D5DB] bg-white px-2.5 text-[13px] text-[#111827] disabled:cursor-not-allowed disabled:bg-[#F9FAFB]"
            />
          </label>
          {error ? <p className="text-[12px] text-[#B91C1C]">{error}</p> : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#F3F4F6] px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!canSubmit || saving}>
            {saving ? 'Saving…' : 'Save'}
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
  return 'Could not save. Please retry.';
}
