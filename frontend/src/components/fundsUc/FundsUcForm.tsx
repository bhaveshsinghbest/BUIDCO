import { useState } from 'react';
import { useListProjectsQuery } from '../../app/api/projectsApi';
import { Button } from '../ui/button';
import { FormField } from '../input-sheet/FormField';
import type { FundingSource, FundsUcCreatePayload, FundsUcEntry } from '../../types/api';

interface Props {
  initial?: FundsUcEntry | null;
  onCancel: () => void;
  onSubmit: (body: FundsUcCreatePayload) => Promise<void>;
  busy: boolean;
}

const FUNDING_SOURCES: FundingSource[] = [
  'Central - EAP',
  'Central - Non-EAP',
  'Central - State Share',
  'State Funded',
];

export function FundsUcForm({ initial, onCancel, onSubmit, busy }: Props): JSX.Element {
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [fundingSource, setFundingSource] = useState<FundingSource>(initial?.fundingSource ?? 'State Funded');
  const [openingBalanceCr, setOpeningBalanceCr] = useState(String(initial?.openingBalanceCr ?? 0));
  const [grantReceivedCr, setGrantReceivedCr] = useState(String(initial?.grantReceivedCr ?? 0));
  const [expenditureIncurredCr, setExpenditureIncurredCr] = useState(String(initial?.expenditureIncurredCr ?? 0));
  const [centralSharePct, setCentralSharePct] = useState(initial?.centralSharePct != null ? String(initial.centralSharePct) : '');
  const [stateSharePct, setStateSharePct] = useState(initial?.stateSharePct != null ? String(initial.stateSharePct) : '');
  const [sanctionNo, setSanctionNo] = useState(initial?.sanctionNo ?? '');
  const [ucSubmittedDate, setUcSubmittedDate] = useState(initial?.ucSubmittedDate ?? '');
  const [remarks, setRemarks] = useState(initial?.remarks ?? '');
  const [error, setError] = useState<string | null>(null);

  const isCentralStateShare = fundingSource === 'Central - State Share';
  const projectsQ = useListProjectsQuery({ limit: 100 });

  const submit = async (): Promise<void> => {
    setError(null);
    if (!initial && !projectId) {
      setError('Project is required.');
      return;
    }
    if (isCentralStateShare && (centralSharePct.trim() === '' || stateSharePct.trim() === '')) {
      setError('Enter both Central Share % and State Share % for "Central - State Share" funding.');
      return;
    }
    if (isCentralStateShare) {
      const c = Number(centralSharePct) || 0;
      const s = Number(stateSharePct) || 0;
      if (c < 0 || c > 100 || s < 0 || s > 100) {
        setError('Central Share % and State Share % must each be between 0 and 100.');
        return;
      }
      if (c + s > 100) {
        setError(`Central Share (${c}%) + State Share (${s}%) cannot exceed 100%.`);
        return;
      }
    }
    const body: FundsUcCreatePayload = {
      projectId: initial ? initial.projectId : projectId,
      fundingSource,
      openingBalanceCr: Number(openingBalanceCr) || 0,
      grantReceivedCr: Number(grantReceivedCr) || 0,
      expenditureIncurredCr: Number(expenditureIncurredCr) || 0,
      centralSharePct: isCentralStateShare ? Number(centralSharePct) || 0 : null,
      stateSharePct: isCentralStateShare ? Number(stateSharePct) || 0 : null,
      sanctionNo: sanctionNo.trim() || null,
      ucSubmittedDate: ucSubmittedDate || null,
      remarks: remarks.trim() || null,
    };
    try {
      await onSubmit(body);
    } catch (err) {
      setError(readError(err));
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-[#111827]">
        {initial ? 'Edit Funds & UC Entry' : 'New Funds & UC Entry'}
      </h2>

      {error ? (
        <div className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B91C1C]">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <FormField
          label="Project"
          type="select"
          value={projectId}
          onChange={setProjectId}
          disabled={Boolean(initial)}
          required
          hint={initial ? 'Project cannot be changed after creation.' : ''}
          options={
            projectsQ.data?.items.map((p) => ({ value: p.projectId, label: p.projectName })) ?? []
          }
        />
        <FormField
          label="Funding Source"
          type="select"
          value={fundingSource}
          onChange={(v) => setFundingSource(v as FundingSource)}
          options={FUNDING_SOURCES as unknown as string[]}
        />
        <FormField label="Sanction No." value={sanctionNo} onChange={setSanctionNo} />
        <FormField
          label="Opening Balance (₹ Cr)"
          type="number"
          step="0.01"
          min={0}
          value={openingBalanceCr}
          onChange={setOpeningBalanceCr}
        />
        <FormField
          label="Grant Received (₹ Cr)"
          type="number"
          step="0.01"
          min={0}
          value={grantReceivedCr}
          onChange={setGrantReceivedCr}
        />
        <FormField
          label="Expenditure Incurred (₹ Cr)"
          type="number"
          step="0.01"
          min={0}
          value={expenditureIncurredCr}
          onChange={setExpenditureIncurredCr}
        />
        <FormField
          label="UC Submitted Date"
          type="date"
          value={ucSubmittedDate}
          onChange={setUcSubmittedDate}
          hint="Leave blank if the Utilization Certificate hasn't been filed yet."
        />
      </div>

      {isCentralStateShare ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 md:grid-cols-2">
          <FormField
            label="Central Share (%)"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            value={centralSharePct}
            onChange={setCentralSharePct}
          />
          <FormField
            label="State Share (%)"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            value={stateSharePct}
            onChange={setStateSharePct}
            hint="Central % + State % must not exceed 100%."
          />
        </div>
      ) : null}

      <FormField label="Remarks" type="textarea" rows={2} value={remarks} onChange={setRemarks} />

      <div className="flex items-center gap-2 border-t border-[#F3F4F6] pt-3">
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Update Entry' : 'Save Entry'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
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
  return 'Something went wrong. Please retry.';
}
