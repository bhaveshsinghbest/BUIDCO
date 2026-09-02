import { useEffect, useState } from 'react';
import { useCreateFundsUcMutation, useUpdateFundsUcMutation } from '../../app/api/fundsUcApi';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { FormSectionHeader } from './FormSectionHeader';
import { FormField } from './FormField';
import { NumberField } from './NumberField';
import type { FundingSource, FundsUcEntry } from '../../types/api';

interface Props {
  projectId: string | null;
  /** This project's existing Funds & UC entry, if any (looked up by the
   *  parent from the full Funds & UC list — one entry per project). */
  entry: FundsUcEntry | null;
  /** Creates the project first (if it doesn't exist yet) and returns its ID,
   *  so this section works before the user has explicitly saved — see
   *  InputSheetPage's `ensureProjectSaved`. */
  onEnsureProjectSaved: () => Promise<string>;
  /** Override the default section number (used by the ALL Fields tab). */
  num?: string;
}

const FUNDING_SOURCES: FundingSource[] = [
  'Central - EAP',
  'Central - Non-EAP',
  'Central - State Share',
  'State Funded',
];

/**
 * Funding Source + share amounts (bhaveshTask.md). Writes directly to the
 * same `project_funds_uc` row the Funds & UC section reads — so whatever is
 * saved here shows up immediately in "By Funding Source" and the "UC Ledger"
 * table there. Sanction No. / UC Submitted Date stay editable only from the
 * Funds & UC page itself (its Edit form) to keep this section focused on
 * exactly what's asked here: the funding source and its share amounts.
 */
export function FundingSourceSection({ projectId, entry, onEnsureProjectSaved, num = '09' }: Props): JSX.Element {
  const [createFundsUc, createState] = useCreateFundsUcMutation();
  const [updateFundsUc, updateState] = useUpdateFundsUcMutation();
  const busy = createState.isLoading || updateState.isLoading;

  const [fundingSource, setFundingSource] = useState<FundingSource | ''>(entry?.fundingSource ?? '');
  const [openingBalanceCr, setOpeningBalanceCr] = useState<number | null>(entry?.openingBalanceCr ?? null);
  const [grantReceivedCr, setGrantReceivedCr] = useState<number | null>(entry?.grantReceivedCr ?? null);
  const [expenditureIncurredCr, setExpenditureIncurredCr] = useState<number | null>(
    entry?.expenditureIncurredCr ?? null,
  );
  const [centralSharePct, setCentralSharePct] = useState<number | null>(entry?.centralSharePct ?? null);
  const [stateSharePct, setStateSharePct] = useState<number | null>(entry?.stateSharePct ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isCentralStateShare = fundingSource === 'Central - State Share';

  useEffect(() => {
    setFundingSource(entry?.fundingSource ?? '');
    setOpeningBalanceCr(entry?.openingBalanceCr ?? null);
    setGrantReceivedCr(entry?.grantReceivedCr ?? null);
    setExpenditureIncurredCr(entry?.expenditureIncurredCr ?? null);
    setCentralSharePct(entry?.centralSharePct ?? null);
    setStateSharePct(entry?.stateSharePct ?? null);
  }, [entry]);

  const handleSave = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    if (!fundingSource) {
      setError('Select a Funding Source first.');
      return;
    }
    if (
      (openingBalanceCr ?? 0) < 0 ||
      (grantReceivedCr ?? 0) < 0 ||
      (expenditureIncurredCr ?? 0) < 0
    ) {
      setError('Share amounts cannot be negative.');
      return;
    }
    if (isCentralStateShare && (centralSharePct === null || stateSharePct === null)) {
      setError('Enter both Central Share % and State Share % for "Central - State Share" funding.');
      return;
    }
    if (isCentralStateShare && ((centralSharePct ?? 0) < 0 || (centralSharePct ?? 0) > 100 || (stateSharePct ?? 0) < 0 || (stateSharePct ?? 0) > 100)) {
      setError('Central Share % and State Share % must each be between 0 and 100.');
      return;
    }
    if (isCentralStateShare && (centralSharePct ?? 0) + (stateSharePct ?? 0) > 100) {
      setError(`Central Share (${centralSharePct}%) + State Share (${stateSharePct}%) cannot exceed 100%.`);
      return;
    }
    const body = {
      fundingSource,
      openingBalanceCr: openingBalanceCr ?? 0,
      grantReceivedCr: grantReceivedCr ?? 0,
      expenditureIncurredCr: expenditureIncurredCr ?? 0,
      centralSharePct: isCentralStateShare ? centralSharePct : null,
      stateSharePct: isCentralStateShare ? stateSharePct : null,
    };
    try {
      if (entry) {
        await updateFundsUc({ fundsUcId: entry.fundsUcId, body }).unwrap();
      } else {
        const savedProjectId = projectId ?? (await onEnsureProjectSaved());
        await createFundsUc({ projectId: savedProjectId, ...body }).unwrap();
      }
      setSaved(true);
    } catch (err) {
      setError(readError(err));
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <FormSectionHeader
          num={num}
          title="Funding Source of the Project"
          sub="Feeds the Funds & UC section's By Funding Source summary and UC Ledger directly."
        />

        {error ? (
          <div className="mb-3 rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B91C1C]">
            {error}
          </div>
        ) : null}
        {saved && !error ? (
          <div className="mb-3 rounded border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-[12.5px] text-[#15803D]">
            Funding details saved.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField
            label="Funding Source of the Project"
            type="select"
            value={fundingSource}
            onChange={(v) => setFundingSource(v as FundingSource | '')}
            options={FUNDING_SOURCES as unknown as string[]}
          />
        </div>

        {fundingSource ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <NumberField
              label={`Opening Balance — ${fundingSource} (₹ Cr)`}
              value={openingBalanceCr}
              onChange={setOpeningBalanceCr}
              min={0}
            />
            <NumberField
              label={`Grant Received — ${fundingSource} (₹ Cr)`}
              value={grantReceivedCr}
              onChange={setGrantReceivedCr}
              min={0}
            />
            <NumberField
              label={`Expenditure Incurred — ${fundingSource} (₹ Cr)`}
              value={expenditureIncurredCr}
              onChange={setExpenditureIncurredCr}
              min={0}
            />
          </div>
        ) : (
          <p className="mt-2 text-[11.5px] text-[#6B7280]">
            Select a funding source to enter its share amounts.
          </p>
        )}

        {isCentralStateShare ? (
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 md:grid-cols-2">
            <NumberField
              label="Central Share (%)"
              value={centralSharePct}
              onChange={setCentralSharePct}
              min={0}
              max={100}
              required
              hint="Split of the combined Central - State Share between the Centre…"
            />
            <NumberField
              label="State Share (%)"
              value={stateSharePct}
              onChange={setStateSharePct}
              min={0}
              max={100}
              required
              hint="…and the State. The two must not add up to more than 100%."
            />
          </div>
        ) : null}

        <div className="mt-4 border-t border-[#F3F4F6] pt-3">
          <Button onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save Funding Details'}
          </Button>
        </div>
      </CardContent>
    </Card>
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
  return 'Something went wrong. Please retry.';
}
