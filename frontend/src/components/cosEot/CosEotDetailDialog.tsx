import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useUpdateCosEotMutation } from '../../app/api/cosEotApi';
import { useAppSelector } from '../../app/hooks';
import { selectCurrentUser } from '../../features/auth/authSlice';
import { formatCurrencyCr, formatDate } from '../../lib/formatters';
import { Button } from '../ui/button';
import type { CosCategory, CosEotRecord, CosEotUpsertPayload } from '../../types/api';

const CATEGORIES: CosCategory[] = [
  'SCOPE ADDITION',
  'SCOPE DELETION',
  'DESIGN CHANGE',
  'QUANTITY VARIATION',
  'OTHERS',
];

interface Props {
  record: CosEotRecord;
  onClose: () => void;
}

/** Editable form state — every field a string so the inputs stay controlled
 *  and an emptied field is distinguishable from a zero. */
interface Draft {
  cosNumber: string;
  cosDate: string;
  category: string;
  cosAmountCr: string;
  variationPct: string;
  eotNumber: string;
  eotDaysGranted: string;
  originalEndDate: string;
  newEndDate: string;
  revisedDate: string;
  timeLinked: boolean;
}

function toDraft(r: CosEotRecord): Draft {
  return {
    cosNumber: r.cosNumber ?? '',
    cosDate: r.cosDate ?? '',
    category: r.category ?? '',
    cosAmountCr: r.cosAmountCr === null ? '' : String(r.cosAmountCr),
    variationPct: r.variationPct === null ? '' : String(r.variationPct),
    eotNumber: r.eotNumber ?? '',
    eotDaysGranted: r.eotDaysGranted === null ? '' : String(r.eotDaysGranted),
    originalEndDate: r.originalEndDate ?? '',
    newEndDate: r.newEndDate ?? '',
    revisedDate: r.revisedDate ?? '',
    timeLinked: r.timeLinked ?? false,
  };
}

/** Empty string → null, so clearing a field actually clears it server-side
 *  rather than writing an empty string the API would reject. */
const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());
const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/**
 * Details for one CoS/EoT record, opened from the CoS # cell.
 *
 * Read-only by default. Users who may update projects get an Edit control
 * in the header; everyone else sees the same details without it, rather
 * than a disabled button that invites a pointless click. The server
 * enforces the same rule (requireProjectUpdate on the PATCH route), so
 * hiding the control is a convenience, not the access control itself.
 */
export function CosEotDetailDialog({ record, onClose }: Props): JSX.Element {
  const currentUser = useAppSelector(selectCurrentUser);
  const canEdit = currentUser?.role === 'MD' || Boolean(currentUser?.canUpdateProjects);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(record));
  const [error, setError] = useState<string | null>(null);
  const [updateCosEot, updateState] = useUpdateCosEotMutation();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Re-seed if the underlying record changes beneath an open dialog (a
  // refetch, or another tab saving) while we are not mid-edit.
  useEffect(() => {
    if (!editing) setDraft(toDraft(record));
  }, [record, editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !updateState.isLoading) {
        if (editing) setEditing(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, onClose, updateState.isLoading]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /** Returns an error message, or null when the draft is acceptable. */
  function validate(d: Draft): string | null {
    if (d.cosAmountCr.trim() !== '' && !Number.isFinite(Number(d.cosAmountCr))) {
      return 'CoS Amount must be a number.';
    }
    if (d.variationPct.trim() !== '') {
      const v = Number(d.variationPct);
      if (!Number.isFinite(v)) return 'Variation % must be a number.';
      if (v < -100 || v > 1000) return 'Variation % looks out of range (-100 to 1000).';
    }
    if (d.eotDaysGranted.trim() !== '') {
      const v = Number(d.eotDaysGranted);
      if (!Number.isInteger(v)) return 'EoT Days must be a whole number.';
      if (v < 0) return 'EoT Days cannot be negative.';
    }
    if (d.originalEndDate && d.newEndDate && d.newEndDate < d.originalEndDate) {
      return 'New End Date cannot be earlier than the Original End Date.';
    }
    return null;
  }

  const handleSave = async (): Promise<void> => {
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const body: CosEotUpsertPayload = {
      cosNumber: orNull(draft.cosNumber),
      cosDate: orNull(draft.cosDate),
      category: (orNull(draft.category) as CosCategory | null),
      cosAmountCr: numOrNull(draft.cosAmountCr),
      variationPct: numOrNull(draft.variationPct),
      eotNumber: orNull(draft.eotNumber),
      eotDaysGranted: numOrNull(draft.eotDaysGranted),
      timeLinked: draft.timeLinked,
      originalEndDate: orNull(draft.originalEndDate),
      newEndDate: orNull(draft.newEndDate),
      revisedDate: orNull(draft.revisedDate),
    };
    try {
      await updateCosEot({ projectId: record.projectId, cosId: record.cosId, body }).unwrap();
      setEditing(false);
    } catch (err) {
      setError(readError(err));
    }
  };

  const handleCancel = (): void => {
    setDraft(toDraft(record));
    setError(null);
    setEditing(false);
  };

  const busy = updateState.isLoading;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-3 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cos-detail-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />

      <div className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-[#F3F4F6] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">
              CoS / EoT Record
            </p>
            <h3 id="cos-detail-title" className="mt-0.5 truncate text-[14.5px] font-bold text-[#111827]">
              {record.cosNumber ?? `CoS #${record.cosId}`}
            </h3>
            {record.projectName ? (
              <NavLink
                to={`/projects/${record.projectId}`}
                className="mt-0.5 block truncate text-[11.5px] font-semibold text-[#1D4ED8] hover:underline"
                title="Open project details"
              >
                {record.projectName}
              </NavLink>
            ) : null}
          </div>

          {/* Edit lives top-right, per spec. Hidden entirely when the user
              cannot update — the API would refuse anyway. */}
          {canEdit && !editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              ✎ Edit
            </Button>
          ) : null}
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={busy ? undefined : onClose}
            disabled={busy}
            className="rounded px-2 py-1 text-[16px] leading-none text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] disabled:cursor-not-allowed"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {editing ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="CoS #">
                <TextInput value={draft.cosNumber} onChange={(v) => set('cosNumber', v)} disabled={busy} />
              </Field>
              <Field label="CoS Date">
                <TextInput type="date" value={draft.cosDate} onChange={(v) => set('cosDate', v)} disabled={busy} />
              </Field>
              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(e) => set('category', e.target.value)}
                  disabled={busy}
                  className={inputClass}
                >
                  <option value="">— Select —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="CoS Amount (₹ Cr.)">
                <TextInput type="number" step="0.01" value={draft.cosAmountCr} onChange={(v) => set('cosAmountCr', v)} disabled={busy} />
              </Field>
              <Field label="Variation %">
                <TextInput type="number" step="0.01" value={draft.variationPct} onChange={(v) => set('variationPct', v)} disabled={busy} />
              </Field>
              <Field label="EoT #">
                <TextInput value={draft.eotNumber} onChange={(v) => set('eotNumber', v)} disabled={busy} />
              </Field>
              <Field label="EoT Days Granted">
                <TextInput type="number" value={draft.eotDaysGranted} onChange={(v) => set('eotDaysGranted', v)} disabled={busy} />
              </Field>
              <Field label="Original End Date">
                <TextInput type="date" value={draft.originalEndDate} onChange={(v) => set('originalEndDate', v)} disabled={busy} />
              </Field>
              <Field label="New End Date">
                <TextInput type="date" value={draft.newEndDate} onChange={(v) => set('newEndDate', v)} disabled={busy} />
              </Field>
              <Field label="Revised Date">
                <TextInput type="date" value={draft.revisedDate} onChange={(v) => set('revisedDate', v)} disabled={busy} />
              </Field>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.timeLinked}
                  onChange={(e) => set('timeLinked', e.target.checked)}
                  disabled={busy}
                  className="h-3.5 w-3.5"
                />
                <span className="text-[12px] font-medium text-[#374151]">
                  Time linked (this CoS also moves the completion date)
                </span>
              </label>
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
              <ReadRow label="CoS #" value={record.cosNumber ?? '—'} />
              <ReadRow label="CoS Date" value={formatDate(record.cosDate)} />
              <ReadRow label="Category" value={record.category ?? '—'} />
              <ReadRow label="CoS Amount" value={formatCurrencyCr(record.cosAmountCr)} />
              <ReadRow
                label="Variation %"
                value={record.variationPct !== null ? `${record.variationPct}%` : '—'}
              />
              <ReadRow label="EoT #" value={record.eotNumber ?? '—'} />
              <ReadRow
                label="EoT Days Granted"
                value={record.eotDaysGranted !== null ? `${record.eotDaysGranted} d` : '—'}
              />
              <ReadRow label="Time Linked" value={record.timeLinked ? 'Yes' : 'No'} />
              <ReadRow label="Original End Date" value={formatDate(record.originalEndDate)} />
              <ReadRow label="New End Date" value={formatDate(record.newEndDate)} />
              <ReadRow label="Revised Date" value={formatDate(record.revisedDate)} />
            </dl>
          )}

          {error ? (
            <p className="mt-3 rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#F3F4F6] px-4 py-3 sm:px-5">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

const inputClass =
  'h-8 w-full rounded border border-[#D1D5DB] bg-white px-2.5 text-[12.5px] text-[#111827] outline-none focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] disabled:cursor-not-allowed disabled:bg-[#F9FAFB]';

function TextInput({
  value,
  onChange,
  type = 'text',
  step,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <input
      type={type}
      value={value}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
        {label}
      </span>
      {children}
    </label>
  );
}

function ReadRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</dt>
      <dd className="mt-0.5 break-words text-[12.5px] font-medium text-[#111827]">{value}</dd>
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
  return 'Could not save the changes. Please try again.';
}
