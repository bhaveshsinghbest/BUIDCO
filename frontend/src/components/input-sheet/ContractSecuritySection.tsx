import { Card, CardContent } from '../ui/card';
import { FieldGroup, FormSectionHeader } from './FormSectionHeader';
import { FormField } from './FormField';
import { NumberField } from './NumberField';
import type { ProjectDraft } from '../../hooks/useProjectDraft';

interface Props {
  draft: ProjectDraft;
  setField: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
  /**
   * Fixed Input section — locked to MD/Admin. PD/Viewer see the fields for
   * context but can't mutate any of them.
   */
  readOnly?: boolean;
  /** Override the default section number (used by the ALL Fields tab). */
  num?: string;
}

export function ContractSecuritySection({ draft, setField, readOnly = false, num = '02' }: Props): JSX.Element {
  // Task 7 — surfaced inline rather than only on save, and mirrors the
  // CHECK constraint the migration added, so the form never submits a
  // combination the database would reject.
  const insuranceDateError =
    draft.insuranceStartDate &&
    draft.insuranceExpiryDate &&
    draft.insuranceExpiryDate < draft.insuranceStartDate
      ? 'Expiry date cannot be before the start date.'
      : null;

  const contractValue = draft.contractValueCr ?? 0;
  const paidToDate = draft.totalPaymentsCr ?? 0;
  const balance = contractValue - paidToDate;

  return (
    <Card>
      <CardContent className="pt-4">
        <FormSectionHeader
          num={num}
          title="Contract & Financial Security"
          sub="Agreement, PBG, EMD, payments & retention (all in ₹ Cr)"
        />
        {readOnly ? (
          <div
            role="note"
            className="mb-3 flex items-start gap-2 rounded border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#92400E]"
          >
            <span aria-hidden className="text-[13px]">🔒</span>
            <div>
              <p className="font-semibold">Read-only — Fixed Input section</p>
              <p className="mt-0.5 text-[11.5px] text-[#78350F]/80">
                Only MD and Admin roles can change Basic Info or Contract &amp; Security
                fields. Ask an Admin if a change is needed here.
              </p>
            </div>
          </div>
        ) : null}

        <FieldGroup label="Agreement Details">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField
              label="Agreement Number"
              value={draft.agreementNumber}
              onChange={(v) => setField('agreementNumber', v || null)}
              disabled={readOnly}
            />
            <FormField
              label="Agreement Date"
              type="date"
              value={draft.agreementDate}
              onChange={(v) => setField('agreementDate', v || null)}
              disabled={readOnly}
            />
            <FormField
              label="Appointed Date"
              type="date"
              value={draft.appointedDate}
              onChange={(v) => setField('appointedDate', v || null)}
              disabled={readOnly}
            />
            <NumberField
              label="Contract Value"
              suffix="₹ Cr"
              value={draft.contractValueCr}
              onChange={(v) => setField('contractValueCr', v)}
              disabled={readOnly}
            />
            <NumberField
              label="Mobilization Advance Issued"
              suffix="₹ Cr"
              value={draft.mobAdvanceIssuedCr}
              onChange={(v) => setField('mobAdvanceIssuedCr', v)}
              disabled={readOnly}
            />
            <NumberField
              label="Mob. Advance Recovered"
              suffix="₹ Cr"
              value={draft.mobAdvanceRecoveredCr}
              onChange={(v) => setField('mobAdvanceRecoveredCr', v)}
              disabled={readOnly}
            />
            <NumberField
              label="Advance Outstanding"
              suffix="₹ Cr"
              value={draft.advanceOutstandingCr}
              onChange={(v) => setField('advanceOutstandingCr', v)}
              disabled={readOnly}
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Performance Bank Guarantee (PBG)">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField
              label="PBG Number"
              value={draft.pbgNumber}
              onChange={(v) => setField('pbgNumber', v || null)}
              disabled={readOnly}
            />
            <NumberField
              label="PBG Amount"
              suffix="₹ Cr"
              value={draft.pbgAmountCr}
              onChange={(v) => setField('pbgAmountCr', v)}
              disabled={readOnly}
            />
            <FormField
              label="PBG Expiry Date"
              type="date"
              value={draft.pbgExpiryDate}
              onChange={(v) => setField('pbgExpiryDate', v || null)}
              disabled={readOnly}
            />
            <FormField
              label="PBG Issuing Bank"
              value={draft.pbgIssuingBank}
              onChange={(v) => setField('pbgIssuingBank', v || null)}
              className="md:col-span-3"
              disabled={readOnly}
            />
          </div>
        </FieldGroup>

        {/* Task 7 — insurance sits directly below PBG and mirrors its layout:
            same 3-column grid, same field components, same readOnly gating.
            Every field is optional, matching the nullable columns. */}
        <FieldGroup label="Insurance">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField
              label="Insurance Policy Number"
              value={draft.insurancePolicyNo}
              onChange={(v) => setField('insurancePolicyNo', v || null)}
              disabled={readOnly}
            />
            <NumberField
              label="Insured Amount"
              suffix="₹ Cr"
              value={draft.insuredAmountCr}
              onChange={(v) => setField('insuredAmountCr', v)}
              disabled={readOnly}
            />
            <FormField
              label="Insurance Start Date"
              type="date"
              value={draft.insuranceStartDate}
              onChange={(v) => setField('insuranceStartDate', v || null)}
              disabled={readOnly}
            />
            <FormField
              label="Insurance Expiry Date"
              type="date"
              value={draft.insuranceExpiryDate}
              onChange={(v) => setField('insuranceExpiryDate', v || null)}
              disabled={readOnly}
              {...(insuranceDateError ? { hint: insuranceDateError } : {})}
            />
            <FormField
              label="Insurer"
              value={draft.insurer}
              onChange={(v) => setField('insurer', v || null)}
              className="md:col-span-2"
              disabled={readOnly}
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Earnest Money Deposit (EMD)">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <NumberField
              label="EMD Amount"
              suffix="₹ Cr"
              value={draft.emdAmountCr}
              onChange={(v) => setField('emdAmountCr', v)}
              disabled={readOnly}
            />
            <FormField
              label="EMD Reference Number"
              value={draft.emdRefNumber}
              onChange={(v) => setField('emdRefNumber', v || null)}
              disabled={readOnly}
            />
            <FormField
              label="EMD Date"
              type="date"
              value={draft.emdDate}
              onChange={(v) => setField('emdDate', v || null)}
              disabled={readOnly}
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Payments to Contractor">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <NumberField
              label="Total Payments Made"
              suffix="₹ Cr"
              value={draft.totalPaymentsCr}
              onChange={(v) => setField('totalPaymentsCr', v)}
              disabled={readOnly}
            />
            <FormField
              label="Last Payment Date"
              type="date"
              value={draft.lastPaymentDate}
              onChange={(v) => setField('lastPaymentDate', v || null)}
              disabled={readOnly}
            />
            <FormField
              label="Last RA Bill No."
              value={draft.lastRaBillNo}
              onChange={(v) => setField('lastRaBillNo', v || null)}
              disabled={readOnly}
            />
            <NumberField
              label="Retention Money Held"
              suffix="₹ Cr"
              value={draft.retentionMoneyHeldCr}
              onChange={(v) => setField('retentionMoneyHeldCr', v)}
              disabled={readOnly}
            />
          </div>
        </FieldGroup>

        {contractValue > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-4 rounded border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-[12px]">
            <span>
              📄 Contract Value: <strong>₹ {contractValue.toFixed(2)} Cr</strong>
            </span>
            <span>
              ✅ Paid to date: <strong className="text-[#15803D]">₹ {paidToDate.toFixed(2)} Cr</strong>
            </span>
            <span>
              ⏳ Balance: <strong className="text-[#B45309]">₹ {balance.toFixed(2)} Cr</strong>
            </span>
            <span>
              🔒 PBG: <strong>₹ {(draft.pbgAmountCr ?? 0).toFixed(2)} Cr</strong>
            </span>
            <span>
              🔑 EMD: <strong>₹ {(draft.emdAmountCr ?? 0).toFixed(2)} Cr</strong>
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
