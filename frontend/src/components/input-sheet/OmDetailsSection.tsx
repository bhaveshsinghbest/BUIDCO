import { useMemo } from 'react';
import { Card, CardContent } from '../ui/card';
import { FieldGroup, FormSectionHeader } from './FormSectionHeader';
import { FormField } from './FormField';
import { NumberField } from './NumberField';
import type { ProjectDraft } from '../../hooks/useProjectDraft';
import type { OmStatusOverride } from '../../types/api';

interface Props {
  draft: ProjectDraft;
  setField: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
  /** Override the default section number (used by the ALL Fields tab). */
  num?: string;
}

const OM_STATUSES: OmStatusOverride[] = [
  'Not Started',
  'Ongoing',
  'Expiring Soon',
  'Expired',
  'Handed Over to ULB',
];

interface OmInfo {
  start: Date;
  end: Date;
  totalDays: number;
  elapsedDays: number;
  daysLeft: number;
  pctElapsed: number;
  autoStatus: OmStatusOverride;
}

/** Reference JSX `computeOMInfo` — kept unchanged so live preview matches. */
function computeOmInfo(draft: ProjectDraft): OmInfo | null {
  if (!draft.omApplicable || !draft.omStartDate) return null;
  const start = new Date(draft.omStartDate);
  start.setHours(0, 0, 0, 0);
  if (Number.isNaN(start.getTime())) return null;

  const months = draft.omPeriodMonths ?? 0;
  const end = draft.omEndDate ? new Date(draft.omEndDate) : new Date(start);
  if (!draft.omEndDate) end.setMonth(end.getMonth() + months);
  end.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const elapsedDays = Math.max(0, Math.round((today.getTime() - start.getTime()) / 86_400_000));
  const daysLeft = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  const pctElapsed = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

  let autoStatus: OmStatusOverride;
  if (today < start) autoStatus = 'Not Started';
  else if (daysLeft < 0) autoStatus = 'Expired';
  else if (daysLeft <= 30) autoStatus = 'Expiring Soon';
  else autoStatus = 'Ongoing';

  return { start, end, totalDays, elapsedDays, daysLeft, pctElapsed, autoStatus };
}

const STATUS_PAL: Record<OmStatusOverride, { bg: string; text: string; dot: string }> = {
  'Not Started': { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
  Ongoing: { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  'Expiring Soon': { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  Expired: { bg: '#FEF2F2', text: '#B91C1C', dot: '#EF4444' },
  'Handed Over to ULB': { bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
};

export function OmDetailsSection({ draft, setField, num = '06' }: Props): JSX.Element {
  const isCompleted = draft.status === 'Completed';
  const omInfo = useMemo(() => computeOmInfo(draft), [draft]);
  const effectiveStatus: OmStatusOverride | null =
    draft.omStatusOverride ?? omInfo?.autoStatus ?? null;

  return (
    <Card>
      <CardContent className="pt-4">
        <FormSectionHeader
          num={num}
          title="O&M (Operations & Maintenance)"
          sub="Applicable only to Completed projects — pre-fill anyway; alerts fire once status is Completed"
        />

        {!isCompleted ? (
          <div className="mb-4 rounded border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[12px] text-[#1D4ED8]">
            💡 This project&rsquo;s status isn&rsquo;t <strong>Completed</strong> yet. You can pre-fill O&M
            details now; the O&M tracker and alerts pick them up once status is set to Completed
            in Section 02.
          </div>
        ) : null}

        <FieldGroup label="O&M Applicability & Period">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField
              label="O&M Applicable"
              type="select"
              value={draft.omApplicable ? 'Yes' : 'No'}
              onChange={(v) => setField('omApplicable', v === 'Yes')}
              options={['No', 'Yes']}
            />
            <FormField
              label="O&M Start Date"
              type="date"
              value={draft.omStartDate}
              onChange={(v) => setField('omStartDate', v || null)}
            />
            <NumberField
              label="Total O&M Period"
              suffix="months"
              value={draft.omPeriodMonths}
              onChange={(v) => setField('omPeriodMonths', v)}
            />
            <FormField
              label="O&M End Date (auto, override-able)"
              type="date"
              value={draft.omEndDate ?? (omInfo ? omInfo.end.toISOString().slice(0, 10) : '')}
              onChange={(v) => setField('omEndDate', v || null)}
            />
            <FormField
              label="O&M Agency / Contractor"
              value={draft.omAgency}
              onChange={(v) => setField('omAgency', v || null)}
            />
            <FormField
              label="O&M Status (Manual Override)"
              type="select"
              value={draft.omStatusOverride ?? ''}
              onChange={(v) => setField('omStatusOverride', (v as OmStatusOverride) || null)}
              options={OM_STATUSES as unknown as string[]}
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Remarks">
          <FormField
            label="O&M Remarks"
            type="textarea"
            rows={3}
            value={draft.omRemarks}
            onChange={(v) => setField('omRemarks', v || null)}
          />
        </FieldGroup>

        {omInfo && effectiveStatus ? (
          <div
            className="flex flex-wrap items-center gap-4 rounded border px-3 py-2 text-[12px]"
            style={{
              backgroundColor: STATUS_PAL[effectiveStatus].bg,
              borderColor: STATUS_PAL[effectiveStatus].dot,
              color: STATUS_PAL[effectiveStatus].text,
            }}
          >
            <span>
              🔧 O&M Status: <strong>{effectiveStatus}</strong>
            </span>
            <span>
              📅 Period:{' '}
              <strong>
                {omInfo.start.toLocaleDateString('en-IN')} →{' '}
                {omInfo.end.toLocaleDateString('en-IN')}
              </strong>
            </span>
            <span>
              ⏱ Elapsed:{' '}
              <strong>
                {omInfo.elapsedDays} of {omInfo.totalDays} days ({omInfo.pctElapsed}%)
              </strong>
            </span>
            <span>
              {omInfo.daysLeft >= 0
                ? `⏳ Remaining: ${omInfo.daysLeft} days`
                : `⚠ Expired ${Math.abs(omInfo.daysLeft)} days ago`}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
