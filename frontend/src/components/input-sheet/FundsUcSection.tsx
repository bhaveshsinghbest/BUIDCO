import { useEffect, useImperativeHandle, useMemo, useState, forwardRef } from 'react';
import { useCreateFundsUcMutation, useUpdateFundsUcMutation } from '../../app/api/fundsUcApi';
import { useAppSelector } from '../../app/hooks';
import { selectCurrentUser } from '../../features/auth/authSlice';
import {
  computeFundFlow,
  computeUCInfo,
  cr,
  formFromEntry,
  FUND_FIELDS,
  fundsFormsDiffer,
  payloadFromForm,
  UC_OVERDUE_DAYS,
  UC_STATUS_PALETTE,
  validateFundsForm,
  withClosingBalance,
  type FundFieldKey,
  type FundsForm,
} from '../../lib/fundsUc';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { FieldGroup, FormSectionHeader } from './FormSectionHeader';
import { FormField } from './FormField';
import type { FundsUcEntry } from '../../types/api';

/** What the Input Sheet's main Save needs from this section. */
export interface FundsUcSectionHandle {
  /** True when there are edits this section has not saved yet. */
  isDirty: () => boolean;
  /** Saves the section against `projectId`; throws a readable message on failure. */
  save: (projectId: string) => Promise<void>;
}

interface Props {
  projectId: string | null;
  /** This project's Funds & UC entry, if it has one (one per project). */
  entry: FundsUcEntry | null;
  /** True while the entry is still being fetched — the form waits for it, so
   *  nothing typed early is overwritten when it arrives. */
  loading?: boolean;
  /** The project's AA / Revised AA — the fallback for "Amount Sanctioned"
   *  in the live summary, exactly as the Funds page applies it. */
  aaAmountCr: number | null;
  revisedAaAmountCr: number | null;
  /** Creates the project first (if it doesn't exist yet) and returns its ID,
   *  so this section works before the user has explicitly saved — see
   *  InputSheetPage's `ensureProjectSaved`. */
  onEnsureProjectSaved: () => Promise<string>;
  /** Override the default section number (used by the ALL Fields tab). */
  num?: string;
}

const LOCK_TOOLTIP = 'Auto-computed: Opening + Received by BUIDCo − Paid by BUIDCo.';

/**
 * Input Sheet → "09 Funds & UC" (bhaveshTask.md Part C). The 15 Funds Flow
 * fields in five numbered stages, an auto-computed Balance with BUIDCo and
 * two live strips. Saved to the project's `project_funds_uc` row — the same
 * row the Funds Flow & UC page reads — by this section's own button or by
 * the Input Sheet's main Save. Every changed field lands in the Audit Trail.
 */
export const FundsUcSection = forwardRef<FundsUcSectionHandle, Props>(function FundsUcSection(
  { projectId, entry, loading = false, aaAmountCr, revisedAaAmountCr, onEnsureProjectSaved, num = '09' },
  ref,
) {
  const role = useAppSelector(selectCurrentUser)?.role;
  // The Funds & UC API accepts writes from MD and Admin only.
  const canWrite = role === 'MD' || role === 'Admin';
  const [createFundsUc, createState] = useCreateFundsUcMutation();
  const [updateFundsUc, updateState] = useUpdateFundsUcMutation();
  const busy = createState.isLoading || updateState.isLoading;

  const saved = useMemo(() => formFromEntry(entry), [entry]);
  const [form, setForm] = useState<FundsForm>(saved);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A fresh entry from the server (after a save, or another project) resets the form.
  useEffect(() => {
    setForm(saved);
    setShowErrors(false);
  }, [saved]);

  const errors = validateFundsForm(form);
  const dirty = fundsFormsDiffer(form, saved);

  /** T-13: the balance follows Opening / Received / Paid as they are typed. */
  const setField = (key: keyof FundsForm, value: string): void => {
    setNotice(null);
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      return key === 'ucOpeningBalance' || key === 'ucGrantReceived' || key === 'ucExpenditureIncurred' ? withClosingBalance(next) : next;
    });
  };

  const persist = async (targetProjectId: string): Promise<void> => {
    const body = payloadFromForm(form);
    if (entry) await updateFundsUc({ fundsUcId: entry.fundsUcId, body }).unwrap();
    else await createFundsUc({ projectId: targetProjectId, ...body }).unwrap();
  };

  useImperativeHandle(ref, () => ({
    isDirty: () => canWrite && !loading && fundsFormsDiffer(form, saved),
    save: async (targetProjectId: string) => {
      if (Object.keys(validateFundsForm(form)).length > 0) {
        setShowErrors(true);
        throw new Error('Funds & UC was not saved — fix the highlighted fields in section 09.');
      }
      try {
        await persist(targetProjectId);
        setError(null);
        setNotice('Funds & UC details saved.');
      } catch (err) {
        throw new Error(`Funds & UC was not saved: ${readError(err)}`);
      }
    },
  }));

  const handleSave = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    try {
      const target = projectId ?? (await onEnsureProjectSaved());
      await persist(target);
      setNotice('Funds & UC details saved.');
    } catch (err) {
      setError(readError(err));
    }
  };

  const fieldError = (key: keyof FundsForm): JSX.Element | null =>
    showErrors && errors[key] ? (
      <span role="alert" className="text-[10.5px] font-semibold text-[#B91C1C]">
        {errors[key]}
      </span>
    ) : null;

  const field = (key: FundFieldKey, extra: { hint?: string } = {}): JSX.Element => {
    const def = FUND_FIELDS[key];
    const type = def.type === 'number' ? 'number' : def.type;
    return (
      <FormField
        key={key}
        label={def.label}
        type={type}
        value={form[key]}
        onChange={(v) => setField(key, v)}
        disabled={!canWrite}
        required={key === 'fundingSourceType'}
        // Top-aligned, so a neighbour's hint text does not push this input down.
        className="content-start"
        {...(def.options ? { options: def.options } : {})}
        {...(def.type === 'number' ? { step: '0.01', min: 0 } : {})}
        {...(extra.hint ? { hint: extra.hint } : {})}
        suffix={fieldError(key)}
      />
    );
  };

  // Live strips (T-14, T-15) use the same engine as the Funds page.
  const asProject = { ...form, aaAmount: aaAmountCr ?? '', revisedAAAmount: revisedAaAmountCr ?? '' };
  const ff = computeFundFlow(asProject);
  const ucInfo = form.ucSubmissionDate ? computeUCInfo(asProject) : null;
  const pal = ucInfo ? UC_STATUS_PALETTE[ucInfo.status] : null;
  const isSplit = form.fundingSourceType === 'Central - State Share';
  const grid = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3';

  return (
    <Card data-testid="funds-uc-section">
      <CardContent className="px-4 pb-5 pt-5 sm:px-6">
        <FormSectionHeader
          num={num}
          title="Funds Flow & Utilization Certificate (UC)"
          sub="— follow the money: Sanction → Released to UDHD → Received by BUIDCo → Paid → UC sent back"
          right={
            dirty && canWrite ? (
              <span className="whitespace-nowrap text-[11px] font-bold text-[#B45309]">Unsaved changes</span>
            ) : null
          }
        />

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading funds data">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {!canWrite ? (
              <div role="note" className="mb-3 flex items-start gap-2 rounded border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#92400E]">
                <span aria-hidden className="text-[13px]">🔒</span>
                <p>Read-only — only MD and Admin roles can change Funds &amp; UC figures.</p>
              </div>
            ) : null}
            {error ? (
              <div role="alert" className="mb-3 rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B91C1C]">
                {error}
              </div>
            ) : null}
            {showErrors && Object.keys(errors).length > 0 ? (
              <div role="alert" className="mb-3 rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B91C1C]">
                Fix the highlighted fields before saving.
              </div>
            ) : null}
            {notice && !error ? (
              <div role="status" className="mb-3 rounded border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-[12.5px] text-[#15803D]">
                {notice}
              </div>
            ) : null}

            <FieldGroup label="① Sanction (by Central / State agency)">
              <div className={grid}>
                {field('fundingSourceType')}
                {field('fundSanctionAgency')}
                {field('fundSanctionedAmount', { hint: 'Blank = the project’s Sanctioned Cost (Revised AA, else AA) is used.' })}
                {field('ucSanctionNo')}
                {field('ucSanctionDate')}
              </div>
              {isSplit ? (
                <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 md:grid-cols-2">
                  <FormField
                    label="Central Share (%)"
                    type="number"
                    value={form.centralSharePct}
                    onChange={(v) => setField('centralSharePct', v)}
                    min={0}
                    max={100}
                    required
                    className="content-start"
                    disabled={!canWrite}
                    hint="Split of the combined Central - State Share between the Centre…"
                    suffix={fieldError('centralSharePct')}
                  />
                  <FormField
                    label="State Share (%)"
                    type="number"
                    value={form.stateSharePct}
                    onChange={(v) => setField('stateSharePct', v)}
                    min={0}
                    max={100}
                    required
                    className="content-start"
                    disabled={!canWrite}
                    hint="…and the State. The two must not add up to more than 100%."
                    suffix={fieldError('stateSharePct')}
                  />
                </div>
              ) : null}
            </FieldGroup>

            <FieldGroup label="② Released by Sanctioning Agency → UDHD">
              <div className={grid}>
                {field('fundReleasedToUDHD', { hint: 'Blank = assumed equal to the amount received by BUIDCo.' })}
              </div>
            </FieldGroup>

            <FieldGroup label="③ Released by UDHD → BUIDCo">
              <div className={grid}>
                {field('ucOpeningBalance', { hint: 'Balance brought forward at the start of the UC period.' })}
                {field('ucGrantReceived')}
              </div>
            </FieldGroup>

            <FieldGroup label="④ Payment released by BUIDCo">
              <div className={grid}>
                {field('ucExpenditureIncurred')}
                <div className="grid gap-1" title={LOCK_TOOLTIP}>
                  <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#374151]">
                    {FUND_FIELDS.ucClosingBalance.label}
                    <span
                      aria-label={LOCK_TOOLTIP}
                      title={LOCK_TOOLTIP}
                      className="rounded-[5px] border border-[#FDE68A] bg-[#FEF3C7] px-[5px] text-[10px] font-bold normal-case leading-[1.5] text-[#B45309]"
                    >
                      🔒
                    </span>
                  </span>
                  <input
                    type="text"
                    readOnly
                    aria-readonly="true"
                    aria-label={FUND_FIELDS.ucClosingBalance.label}
                    value={form.ucClosingBalance}
                    placeholder="0"
                    data-testid="funds-closing-balance"
                    className="h-9 w-full cursor-not-allowed rounded border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-3 py-1.5 text-[13px] text-[#6B7280]"
                  />
                </div>
              </div>
            </FieldGroup>

            <FieldGroup label="⑤ Utilization Certificate (UC) — BUIDCo → Department">
              <div className={grid}>
                {field('ucSubmissionDate')}
                {field('ucSentTo')}
                {field('ucAmountCertified')}
                {field('ucStatus', { hint: 'Leave blank to use Submitted / Overdue from the UC date.' })}
              </div>
            </FieldGroup>

            <FieldGroup label="Remarks">{field('ucRemarks')}</FieldGroup>

            <div
              className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 rounded-lg border border-[#BFDBFE] bg-[#F0F6FF] px-4 py-2.5 text-[12px] text-[#111827]"
              data-testid="funds-summary-strip"
              aria-live="polite"
            >
              <span>
                ⏳ Yet to be released by agency: <strong>{cr(ff.yetToRelease)} Cr.</strong>
              </span>
              <span>
                🏛️ Lying with UDHD: <strong>{cr(ff.withUDHD)} Cr.</strong>
              </span>
              <span>
                💰 Available with BUIDCo: <strong>{cr(ff.balance)} Cr.</strong>
              </span>
              <span>
                🧾 Spent, not covered by UC: <strong>{cr(ff.ucUncovered)} Cr.</strong>
              </span>
            </div>

            {ucInfo && pal ? (
              <div
                className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg px-4 py-3 text-[12px] text-[#111827]"
                style={{ background: pal.bg, border: `1px solid ${pal.dot}` }}
                data-testid="funds-uc-strip"
              >
                <span>
                  📄 UC Status: <strong style={{ color: pal.text }}>{ucInfo.status}</strong>
                </span>
                <span>
                  📅 Last Submitted: <strong>{ucInfo.submitted ? ucInfo.submitted.toLocaleDateString('en-IN') : '—'}</strong>
                </span>
                <span>
                  ⏱ Days Since Submission: <strong>{ucInfo.daysSince}</strong>{' '}
                  {ucInfo.daysSince !== null && ucInfo.daysSince > UC_OVERDUE_DAYS ? (
                    <span className="text-[#B91C1C]">(overdue — quarterly filing expected within {UC_OVERDUE_DAYS} days)</span>
                  ) : null}
                </span>
                <span>
                  💰 Balance with BUIDCo: <strong>{cr(form.ucClosingBalance)} Cr.</strong>
                </span>
              </div>
            ) : null}

            {canWrite ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#F3F4F6] pt-3">
                <Button onClick={handleSave} disabled={busy || (!dirty && Boolean(entry))}>
                  {busy ? 'Saving…' : 'Save Funds & UC'}
                </Button>
                <span className="text-[11px] text-[#6B7280]">The Input Sheet’s main Save also saves this section.</span>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
});

function readError(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const e = (data as { error?: { message?: string } }).error;
      if (e?.message) return e.message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please retry.';
}
