/**
 * Funds Flow & UC — calculation engine (bhaveshTask.md Parts A–B).
 *
 * Follows public money along
 *   Sanctioning Agency (MoHUA / NMCG / State) → UDHD → BUIDCo → Contractors / Payees
 * and the reverse paper trail BUIDCo → Utilization Certificate (UC) → UDHD → Agency.
 * All amounts are ₹ Crore.
 *
 * Everything here is a pure function over a "fund project" keyed exactly as
 * the spec names the 15 fields (fundingSourceType, ucGrantReceived, …), so
 * the formulas read the same as the specification and its test cases.
 * `entryToFundProject` adapts an API entry to that shape; the Input Sheet
 * form keeps its state in the same keys.
 *
 * The two legacy keys keep their names with new meanings:
 *   ucGrantReceived       = amount RECEIVED BY BUIDCo (from UDHD / agency)
 *   ucExpenditureIncurred = amount PAID / released BY BUIDCo
 */
import type {
  FundingSource,
  FundSanctionAgency,
  FundsUcCreatePayload,
  FundsUcEntry,
  FundsUcStatus,
  UcSentTo,
} from '../types/api';

/* ───────────────────────────── T-04 · Constants ───────────────────────────── */

export const FUNDING_SOURCE_OPTIONS: readonly FundingSource[] = [
  'Central - EAP',
  'Central - Non-EAP',
  'Central - State Share',
  'State Funded',
];
export const FUND_AGENCY_OPTIONS: readonly FundSanctionAgency[] = [
  'MoHUA – Govt. of India',
  'NMCG – Govt. of India',
  'Other Central Ministry',
  'UDHD – Govt. of Bihar',
  'Other State Dept.',
];
export const UC_SENT_TO_OPTIONS: readonly UcSentTo[] = ['UDHD, Govt. of Bihar', 'NMCG', 'MoHUA / SPMG', 'Other'];
export const UC_STATUS_OPTIONS: readonly FundsUcStatus[] = ['Not Due', 'Pending', 'Submitted', 'Acknowledged', 'Overdue'];

/** One quarter plus a grace window — UCs are filed quarterly. */
export const UC_OVERDUE_DAYS = 100;

export const UC_STATUS_PALETTE: Record<FundsUcStatus, { bg: string; text: string; dot: string }> = {
  'Not Due': { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
  Pending: { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  Submitted: { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  Acknowledged: { bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
  Overdue: { bg: '#FEF2F2', text: '#B91C1C', dot: '#EF4444' },
};

export const FUND_COLORS = {
  sanction: '#1E3A5F',
  udhd: '#4F46E5',
  buidco: '#2563EB',
  opening: '#94A3B8',
  paid: '#0F766E',
  yet: '#F59E0B',
  lyingUDHD: '#7C3AED',
  balance: '#0891B2',
} as const;

/* ─────────────────────────── T-03 · The 15 fields ─────────────────────────── */

export const FUND_FIELD_KEYS = [
  'fundingSourceType',
  'fundSanctionAgency',
  'fundSanctionedAmount',
  'ucSanctionNo',
  'ucSanctionDate',
  'fundReleasedToUDHD',
  'ucOpeningBalance',
  'ucGrantReceived',
  'ucExpenditureIncurred',
  'ucClosingBalance',
  'ucAmountCertified',
  'ucSentTo',
  'ucSubmissionDate',
  'ucStatus',
  'ucRemarks',
] as const;
export type FundFieldKey = (typeof FUND_FIELD_KEYS)[number];

export type FundFieldType = 'select' | 'number' | 'text' | 'date' | 'textarea';

export const FUND_FIELDS: Record<FundFieldKey, { label: string; type: FundFieldType; options?: readonly string[] }> = {
  fundingSourceType: { label: 'Funding Source', type: 'select', options: FUNDING_SOURCE_OPTIONS },
  fundSanctionAgency: { label: 'Sanctioning Agency', type: 'select', options: FUND_AGENCY_OPTIONS },
  fundSanctionedAmount: { label: 'Amount Sanctioned by Agency (₹ Cr.)', type: 'number' },
  ucSanctionNo: { label: 'Sanction No. / Letter Ref.', type: 'text' },
  ucSanctionDate: { label: 'Sanction Date', type: 'date' },
  fundReleasedToUDHD: { label: 'Released by Agency to UDHD (₹ Cr.)', type: 'number' },
  ucOpeningBalance: { label: 'UC Opening Balance (₹ Cr.)', type: 'number' },
  ucGrantReceived: { label: 'Received by BUIDCo (₹ Cr.)', type: 'number' },
  ucExpenditureIncurred: { label: 'Paid / Released by BUIDCo (₹ Cr.)', type: 'number' },
  ucClosingBalance: { label: 'Balance with BUIDCo (₹ Cr.) — auto', type: 'number' },
  ucAmountCertified: { label: 'Amount Covered by Submitted UC (₹ Cr.)', type: 'number' },
  ucSentTo: { label: 'UC Sent To (Department)', type: 'select', options: UC_SENT_TO_OPTIONS },
  ucSubmissionDate: { label: 'UC Submission Date', type: 'date' },
  ucStatus: { label: 'UC Status (Manual Override)', type: 'select', options: UC_STATUS_OPTIONS },
  ucRemarks: { label: 'UC / Funds Remarks', type: 'textarea' },
};

/** Order of the "Funds & Utilization Certificate (UC)" group on the project detail view. */
export const FUND_DETAIL_KEYS: readonly FundFieldKey[] = [
  'fundingSourceType',
  'fundSanctionAgency',
  'fundSanctionedAmount',
  'fundReleasedToUDHD',
  'ucOpeningBalance',
  'ucGrantReceived',
  'ucSanctionNo',
  'ucSanctionDate',
  'ucExpenditureIncurred',
  'ucClosingBalance',
  'ucAmountCertified',
  'ucSentTo',
  'ucSubmissionDate',
  'ucStatus',
  'ucRemarks',
];

type Raw = string | number | null | undefined;

/** What the calculations read: the spec's keys plus the AA fallback. */
export interface FundInput extends Partial<Record<FundFieldKey, Raw>> {
  aaAmount?: Raw;
  revisedAAAmount?: Raw;
}

/** A project as the tracker sees it — the spec's keys, values as entered. */
export interface FundProject extends FundInput {
  id: string;
  projectName: string;
  /** The project's scheme tags (the spec's `p.sector`). */
  sector?: readonly string[];
  schemeCategory?: string | null;
  /** Central / State split, kept from the existing Funding Source section. */
  centralSharePct?: number | null;
  stateSharePct?: number | null;
}

/* ─────────────────────── T-05 · Formatters and helpers ─────────────────────── */

/** `parseFloat(v) || 0` — text such as "AMRUT 2.0 Under Tender" becomes 0. */
export const toNum = (v: Raw): number => parseFloat(String(v ?? '')) || 0;

/** ₹ amount in Indian grouping with 2 decimals; "Cr." is added by the UI. 216.8 → "₹216.80". */
export const cr = (v: Raw): string =>
  `₹${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const pctOf = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);

/**
 * A YYYY-MM-DD value as a local calendar date (midnight). `new Date("2023-05-10")`
 * would read it as UTC midnight, which is the previous day west of Greenwich.
 */
export function parseCalendarDate(value: Raw): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** en-IN short date, e.g. "10/5/2023"; "—" when empty. */
export const fmtD = (d: Raw): string => {
  const date = parseCalendarDate(d);
  return date ? date.toLocaleDateString('en-IN') : '—';
};

/** YYYY-MM-DD for a local date. */
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The scheme a project is counted under: its first scheme tag, else its
 * scheme category, else "Unassigned". Counting each project once keeps
 * scheme totals adding up to the overall total.
 */
export const primaryScheme = (p: Pick<FundProject, 'sector' | 'schemeCategory'>): string =>
  Array.isArray(p.sector) && p.sector.length > 0 ? p.sector[0]! : p.schemeCategory || 'Unassigned';

/** Only projects with some funds data appear on the Funds page. */
export const isFundTracked = (p: FundProject): boolean =>
  Boolean(
    p.fundingSourceType ||
      p.fundSanctionedAmount ||
      p.fundReleasedToUDHD ||
      p.ucOpeningBalance ||
      p.ucGrantReceived ||
      p.ucExpenditureIncurred ||
      p.ucSubmissionDate,
  );

/* ──────────────────────────── T-06 · T-07 · T-08 ──────────────────────────── */

/** Sanctioned Cost: Revised AA if it is > 0, otherwise the AA amount. */
export function getSanctionedCost(p: Pick<FundProject, 'aaAmount' | 'revisedAAAmount'> | null | undefined): number {
  if (!p) return 0;
  const revised = parseFloat(String(p.revisedAAAmount ?? ''));
  if (!Number.isNaN(revised) && revised > 0) return revised;
  const aa = parseFloat(String(p.aaAmount ?? ''));
  return Number.isNaN(aa) ? 0 : aa;
}

/** GFR 12-A ledger arithmetic: Opening + Received − Spent, to 2 decimals. */
export const computeUCClosingBalance = (p: FundInput): number =>
  +(toNum(p.ucOpeningBalance) + toNum(p.ucGrantReceived) - toNum(p.ucExpenditureIncurred)).toFixed(2);

export interface UcInfo {
  submitted: Date | null;
  daysSince: number | null;
  autoStatus: FundsUcStatus;
  status: FundsUcStatus;
}

const asStatus = (v: Raw): FundsUcStatus | null =>
  typeof v === 'string' && (UC_STATUS_OPTIONS as readonly string[]).includes(v) ? (v as FundsUcStatus) : null;

/**
 * UC status and ageing. A manual status always wins (e.g. "Acknowledged"
 * suppresses "Overdue"); otherwise a UC older than 100 days is Overdue.
 * Null when there is neither a submission date nor a manual status.
 */
export function computeUCInfo(p: FundInput | null | undefined, today: Date = new Date()): UcInfo | null {
  if (!p) return null;
  const manual = asStatus(p.ucStatus);
  if (!p.ucSubmissionDate) {
    if (!manual) return null;
    return { submitted: null, daysSince: null, autoStatus: 'Not Due', status: manual };
  }
  const submitted = parseCalendarDate(p.ucSubmissionDate);
  if (!submitted) return null;
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  const daysSince = Math.max(0, Math.round((now.getTime() - submitted.getTime()) / 86_400_000));
  const autoStatus: FundsUcStatus = daysSince > UC_OVERDUE_DAYS ? 'Overdue' : 'Submitted';
  return { submitted, daysSince, autoStatus, status: manual ?? autoStatus };
}

/* ──────────────────────────── T-09 · Fund flow ──────────────────────────── */

export interface FundFlow {
  sanctioned: number;
  sanctionedAssumed: boolean;
  relUDHD: number;
  relAssumed: boolean;
  received: number;
  opening: number;
  paid: number;
  yetToRelease: number;
  withUDHD: number;
  balance: number;
  ucCertified: number;
  ucUncovered: number;
  ucSent: boolean;
  ucDays: number | null;
  ucStatus: FundsUcStatus;
}

/** Per-project fund position at every stage of the chain (₹ Cr.). */
export function computeFundFlow(p: FundInput | null | undefined, today: Date = new Date()): FundFlow {
  const q = p ?? {};
  const sanctionedEntered = toNum(q.fundSanctionedAmount) > 0;
  const sanctioned = sanctionedEntered ? toNum(q.fundSanctionedAmount) : getSanctionedCost(q);
  const received = toNum(q.ucGrantReceived);
  const opening = toNum(q.ucOpeningBalance);
  const paid = toNum(q.ucExpenditureIncurred);
  // 0 counts as entered; only a blank means "not entered".
  const relEntered =
    q.fundReleasedToUDHD !== undefined && q.fundReleasedToUDHD !== null && String(q.fundReleasedToUDHD).trim() !== '';
  // Not entered → assume nothing is parked at UDHD (= what BUIDCo received).
  const relUDHD = relEntered ? toNum(q.fundReleasedToUDHD) : received;
  const info = computeUCInfo(q, today);
  const ucCertified = toNum(q.ucAmountCertified);
  return {
    sanctioned,
    sanctionedAssumed: !sanctionedEntered,
    relUDHD,
    relAssumed: !relEntered && received > 0,
    received,
    opening,
    paid,
    yetToRelease: Math.max(sanctioned - relUDHD, 0),
    withUDHD: Math.max(relUDHD - received, 0),
    balance: +(opening + received - paid).toFixed(2),
    ucCertified,
    ucUncovered: Math.max(paid - ucCertified, 0),
    ucSent: Boolean(q.ucSubmissionDate),
    ucDays: info ? info.daysSince : null,
    ucStatus: info ? info.status : received > 0 || paid > 0 ? 'Pending' : 'Not Due',
  };
}

/* ──────────────────────────── T-10 · Aggregation ──────────────────────────── */

export interface FundRow {
  p: FundProject;
  f: FundFlow;
  scheme: string;
}

export interface FundTotals {
  n: number;
  sanctioned: number;
  relUDHD: number;
  received: number;
  opening: number;
  paid: number;
  balance: number;
  withUDHD: number;
  yetToRelease: number;
  relAssumed: number;
  sanctionedAssumed: number;
}

/**
 * Sums per-project figures. Gaps are the sum of each project's clamped gap,
 * not recomputed from the totals — so "Yet to be released" can be non-zero
 * even when total Released exceeds total Sanctioned.
 */
export function aggregateFlow(rows: readonly Pick<FundRow, 'f'>[]): FundTotals {
  return rows.reduce<FundTotals>(
    (a, { f }) => {
      a.n += 1;
      a.sanctioned += f.sanctioned;
      a.relUDHD += f.relUDHD;
      a.received += f.received;
      a.opening += f.opening;
      a.paid += f.paid;
      a.balance += f.balance;
      a.withUDHD += f.withUDHD;
      a.yetToRelease += f.yetToRelease;
      if (f.relAssumed) a.relAssumed += 1;
      if (f.sanctionedAssumed) a.sanctionedAssumed += 1;
      return a;
    },
    { n: 0, sanctioned: 0, relUDHD: 0, received: 0, opening: 0, paid: 0, balance: 0, withUDHD: 0, yetToRelease: 0, relAssumed: 0, sanctionedAssumed: 0 },
  );
}

export function toFundRows(projects: readonly FundProject[], today: Date = new Date()): FundRow[] {
  return projects.map((p) => ({ p, f: computeFundFlow(p, today), scheme: primaryScheme(p) }));
}

export interface FundGroup {
  name: string;
  rows: FundRow[];
  agg: FundTotals;
}

export const agencyOf = (p: FundProject): string => (p.fundSanctionAgency ? String(p.fundSanctionAgency) : 'Not specified');

/** Rows grouped by `keyOf`, largest sanctioned first. */
export function groupFundRows(rows: readonly FundRow[], keyOf: (r: FundRow) => string): FundGroup[] {
  const names = [...new Set(rows.map(keyOf))];
  return names
    .map((name) => {
      const rs = rows.filter((r) => keyOf(r) === name);
      return { name, rows: rs, agg: aggregateFlow(rs) };
    })
    .sort((a, b) => b.agg.sanctioned - a.agg.sanctioned);
}

/* ───────────────────── Stage composition & breakup meta ───────────────────── */

export interface StageSegment {
  k: string;
  v: number;
  c: string;
  l: string;
}

/** Where each rupee sits right now, in chain order; a negative balance counts as 0. */
export const stageSegments = (f: Pick<FundFlow, 'paid' | 'balance' | 'withUDHD' | 'yetToRelease'>): StageSegment[] => [
  { k: 'paid', v: f.paid, c: FUND_COLORS.paid, l: 'Paid by BUIDCo' },
  { k: 'bal', v: Math.max(f.balance, 0), c: FUND_COLORS.balance, l: 'Balance with BUIDCo' },
  { k: 'udhd', v: f.withUDHD, c: FUND_COLORS.lyingUDHD, l: 'Lying with UDHD' },
  { k: 'yet', v: f.yetToRelease, c: FUND_COLORS.yet, l: 'Yet to be released by agency' },
];

export type StageKey = 'sanctioned' | 'relUDHD' | 'received' | 'opening' | 'paid' | 'yet' | 'withUDHD' | 'balance';

export interface StageMeta {
  label: string;
  color: string;
  formula: string;
  val: (f: FundFlow) => number;
  cols: Array<[string, (f: FundFlow) => number]>;
}

export const STAGE_META: Record<StageKey, StageMeta> = {
  sanctioned: {
    label: 'Sanctioned by Agency',
    color: FUND_COLORS.sanction,
    formula: "Amount Sanctioned by the agency (if not entered, the project's Sanctioned Cost / AA is used)",
    val: (f) => f.sanctioned,
    cols: [],
  },
  relUDHD: {
    label: 'Released by Agency to UDHD',
    color: FUND_COLORS.udhd,
    formula: 'Amount released by the sanctioning agency to UDHD (if not entered, assumed = Received by BUIDCo)',
    val: (f) => f.relUDHD,
    cols: [['Sanctioned', (f) => f.sanctioned]],
  },
  received: {
    label: 'Received by BUIDCo',
    color: FUND_COLORS.buidco,
    formula: 'Amount received by BUIDCo from UDHD / agency',
    val: (f) => f.received,
    cols: [['Released to UDHD', (f) => f.relUDHD]],
  },
  opening: {
    label: 'Opening Balance b/f with BUIDCo',
    color: FUND_COLORS.opening,
    formula: 'Balance brought forward with BUIDCo at the start of the UC period',
    val: (f) => f.opening,
    cols: [],
  },
  paid: {
    label: 'Paid / Released by BUIDCo',
    color: FUND_COLORS.paid,
    formula: 'Payments released by BUIDCo to contractors / payees',
    val: (f) => f.paid,
    cols: [['Available (Opening + Received)', (f) => f.opening + f.received]],
  },
  yet: {
    label: 'Yet to be released by Agency',
    color: FUND_COLORS.yet,
    formula: 'Sanctioned − Released to UDHD',
    val: (f) => f.yetToRelease,
    cols: [
      ['Sanctioned', (f) => f.sanctioned],
      ['Released to UDHD', (f) => f.relUDHD],
    ],
  },
  withUDHD: {
    label: 'Lying with UDHD',
    color: FUND_COLORS.lyingUDHD,
    formula: 'Released to UDHD − Received by BUIDCo',
    val: (f) => f.withUDHD,
    cols: [
      ['Released to UDHD', (f) => f.relUDHD],
      ['Received by BUIDCo', (f) => f.received],
    ],
  },
  balance: {
    label: 'Available with BUIDCo',
    color: FUND_COLORS.balance,
    formula: 'Opening + Received by BUIDCo − Paid by BUIDCo',
    val: (f) => f.balance,
    cols: [
      ['Opening', (f) => f.opening],
      ['Received', (f) => f.received],
      ['Paid', (f) => f.paid],
    ],
  },
};

/** Rows contributing to a stage (|value| > 0.004), largest first, with their total. */
export function breakupItems(stage: StageKey, rows: readonly FundRow[]): { items: Array<FundRow & { v: number }>; total: number } {
  const m = STAGE_META[stage];
  const items = rows
    .map((r) => ({ ...r, v: m.val(r.f) }))
    .filter((r) => Math.abs(r.v) > 0.004)
    .sort((a, b) => b.v - a.v);
  return { items, total: items.reduce((s, r) => s + r.v, 0) };
}

/** Sums `items` by a key, largest first. */
export function sumBy<T extends { v: number }>(items: readonly T[], keyOf: (r: T) => string): Array<[string, number]> {
  const o = new Map<string, number>();
  for (const r of items) o.set(keyOf(r), (o.get(keyOf(r)) ?? 0) + r.v);
  return [...o.entries()].sort((a, b) => b[1] - a[1]);
}

/* ─────────────────────────── T-26 · UC tracker ─────────────────────────── */

/** UC applies once BUIDCo has received or paid funds, or a UC has been sent. */
export const isUcRelevant = ({ f }: Pick<FundRow, 'f'>): boolean => f.paid > 0 || f.received > 0 || f.ucSent;
/** Funds used but no UC on record. */
export const isUcNotSent = ({ f }: Pick<FundRow, 'f'>): boolean => !f.ucSent && (f.paid > 0 || f.received > 0);

export interface UcSummary {
  relevant: FundRow[];
  sent: number;
  notSent: number;
  overdue: number;
  paid: number;
  covered: number;
  uncovered: number;
  statusCounts: Array<{ name: FundsUcStatus; value: number; color: string }>;
  sentTo: Array<[string, number]>;
  watch: FundRow[];
}

export function summariseUc(rows: readonly FundRow[]): UcSummary {
  const relevant = rows.filter(isUcRelevant);
  const paid = relevant.reduce((s, { f }) => s + f.paid, 0);
  const covered = relevant.reduce((s, { f }) => s + Math.min(f.ucCertified, f.paid), 0);
  const sentTo = new Map<string, number>();
  for (const { p, f } of relevant) {
    if (!f.ucSent) continue;
    const k = p.ucSentTo ? String(p.ucSentTo) : 'Not specified';
    sentTo.set(k, (sentTo.get(k) ?? 0) + 1);
  }
  return {
    relevant,
    sent: relevant.filter(({ f }) => f.ucSent).length,
    notSent: relevant.filter(isUcNotSent).length,
    overdue: relevant.filter(({ f }) => f.ucStatus === 'Overdue').length,
    paid,
    covered,
    uncovered: Math.max(paid - covered, 0),
    statusCounts: UC_STATUS_OPTIONS.map((name) => ({
      name,
      value: relevant.filter(({ f }) => f.ucStatus === name).length,
      color: UC_STATUS_PALETTE[name].dot,
    })).filter((d) => d.value > 0),
    sentTo: [...sentTo.entries()],
    watch: relevant
      .filter(({ f }) => !f.ucSent || f.ucUncovered > 0.005 || f.ucStatus === 'Overdue')
      .sort((a, b) => b.f.ucUncovered - a.f.ucUncovered),
  };
}

/* ───────────────────────── T-18 · Demo-data mode ───────────────────────── */

const DEMO_SETS: Array<Partial<Record<FundFieldKey, string>> & { agoDays?: number }> = [
  { fundSanctionAgency: 'NMCG – Govt. of India', fundingSourceType: 'Central - Non-EAP', fundSanctionedAmount: '120', fundReleasedToUDHD: '90', ucOpeningBalance: '5', ucGrantReceived: '70', ucExpenditureIncurred: '62', ucAmountCertified: '50', agoDays: 40, ucSentTo: 'UDHD, Govt. of Bihar' },
  { fundSanctionAgency: 'NMCG – Govt. of India', fundingSourceType: 'Central - Non-EAP', fundSanctionedAmount: '85', fundReleasedToUDHD: '85', ucOpeningBalance: '0', ucGrantReceived: '60', ucExpenditureIncurred: '58', ucAmountCertified: '58', agoDays: 15, ucSentTo: 'UDHD, Govt. of Bihar', ucStatus: 'Acknowledged' },
  { fundSanctionAgency: 'MoHUA – Govt. of India', fundingSourceType: 'Central - State Share', fundSanctionedAmount: '200', fundReleasedToUDHD: '120', ucOpeningBalance: '10', ucGrantReceived: '80', ucExpenditureIncurred: '75', ucAmountCertified: '40', agoDays: 140, ucSentTo: 'UDHD, Govt. of Bihar' },
  { fundSanctionAgency: 'MoHUA – Govt. of India', fundingSourceType: 'Central - EAP', fundSanctionedAmount: '150', fundReleasedToUDHD: '100', ucOpeningBalance: '0', ucGrantReceived: '55', ucExpenditureIncurred: '48' },
  { fundSanctionAgency: 'UDHD – Govt. of Bihar', fundingSourceType: 'State Funded', fundSanctionedAmount: '60', fundReleasedToUDHD: '60', ucOpeningBalance: '0', ucGrantReceived: '45', ucExpenditureIncurred: '30', ucAmountCertified: '30', agoDays: 60, ucSentTo: 'UDHD, Govt. of Bihar' },
  { fundSanctionAgency: 'UDHD – Govt. of Bihar', fundingSourceType: 'State Funded', fundSanctionedAmount: '40', ucOpeningBalance: '2', ucGrantReceived: '25', ucExpenditureIncurred: '20' },
  { fundSanctionAgency: 'MoHUA – Govt. of India', fundingSourceType: 'Central - Non-EAP', fundSanctionedAmount: '95', fundReleasedToUDHD: '40', ucOpeningBalance: '0', ucGrantReceived: '0', ucExpenditureIncurred: '0' },
];

/**
 * Illustrative numbers so the screen can be previewed before real data is
 * keyed in: the first 7 projects with the 7 sample sets overlaid, UC dates
 * relative to today.
 */
export function makeDemoFundProjects(projects: readonly FundProject[], today: Date = new Date()): FundProject[] {
  const ago = (days: number): string => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return isoDate(d);
  };
  return projects.slice(0, DEMO_SETS.length).map((p, i) => {
    const { agoDays, ...set } = DEMO_SETS[i]!;
    const d: FundProject = { ...p, ...set, ...(agoDays !== undefined ? { ucSubmissionDate: ago(agoDays) } : {}) };
    d.ucClosingBalance = computeUCClosingBalance(d);
    return d;
  });
}

/* ─────────────────────── API ↔ spec-key adapters ─────────────────────── */

/** An API entry in the spec's keys. A blank Released-to-UDHD stays blank
 *  ("not entered"); a stored 0 stays 0 ("entered"). */
export function entryToFundProject(entry: FundsUcEntry): FundProject {
  return {
    id: entry.projectId,
    projectName: entry.project?.projectName ?? entry.projectId,
    sector: entry.project?.schemeNames ?? [],
    schemeCategory: null,
    aaAmount: entry.project?.aaAmountCr ?? '',
    revisedAAAmount: entry.project?.revisedAaAmountCr ?? '',
    fundingSourceType: entry.fundingSource,
    fundSanctionAgency: entry.fundSanctionAgency ?? '',
    fundSanctionedAmount: entry.fundSanctionedAmountCr ?? '',
    ucSanctionNo: entry.sanctionNo ?? '',
    ucSanctionDate: entry.sanctionDate ?? '',
    fundReleasedToUDHD: entry.fundReleasedToUdhdCr ?? '',
    ucOpeningBalance: entry.openingBalanceCr,
    ucGrantReceived: entry.grantReceivedCr,
    ucExpenditureIncurred: entry.expenditureIncurredCr,
    ucClosingBalance: entry.closingBalanceCr,
    ucAmountCertified: entry.ucAmountCertifiedCr ?? '',
    ucSentTo: entry.ucSentTo ?? '',
    ucSubmissionDate: entry.ucSubmittedDate ?? '',
    ucStatus: entry.ucStatusOverride ?? '',
    ucRemarks: entry.remarks ?? '',
    centralSharePct: entry.centralSharePct,
    stateSharePct: entry.stateSharePct,
  };
}

/** The Input Sheet form's state: every field a string, "" when empty. */
export type FundsForm = Record<FundFieldKey, string> & { centralSharePct: string; stateSharePct: string };

export function emptyFundsForm(): FundsForm {
  const form = Object.fromEntries(FUND_FIELD_KEYS.map((k) => [k, ''])) as Record<FundFieldKey, string>;
  return { ...form, centralSharePct: '', stateSharePct: '' };
}

const numText = (v: number | null | undefined, blankZero = false): string =>
  v === null || v === undefined || (blankZero && v === 0) ? '' : String(v);

/** Form state for an entry. The three ledger columns are NOT NULL in the
 *  database, so a stored 0 there shows blank, like a never-filled field. */
export function formFromEntry(entry: FundsUcEntry | null): FundsForm {
  if (!entry) return emptyFundsForm();
  const form: FundsForm = {
    fundingSourceType: entry.fundingSource,
    fundSanctionAgency: entry.fundSanctionAgency ?? '',
    fundSanctionedAmount: numText(entry.fundSanctionedAmountCr),
    ucSanctionNo: entry.sanctionNo ?? '',
    ucSanctionDate: entry.sanctionDate ?? '',
    fundReleasedToUDHD: numText(entry.fundReleasedToUdhdCr),
    ucOpeningBalance: numText(entry.openingBalanceCr, true),
    ucGrantReceived: numText(entry.grantReceivedCr, true),
    ucExpenditureIncurred: numText(entry.expenditureIncurredCr, true),
    ucClosingBalance: '',
    ucAmountCertified: numText(entry.ucAmountCertifiedCr),
    ucSentTo: entry.ucSentTo ?? '',
    ucSubmissionDate: entry.ucSubmittedDate ?? '',
    ucStatus: entry.ucStatusOverride ?? '',
    ucRemarks: entry.remarks ?? '',
    centralSharePct: numText(entry.centralSharePct),
    stateSharePct: numText(entry.stateSharePct),
  };
  return withClosingBalance(form);
}

/** T-13: the auto balance, stored as "" when it works out to 0. */
export function withClosingBalance(form: FundsForm): FundsForm {
  const bal = computeUCClosingBalance(form);
  return { ...form, ucClosingBalance: bal === 0 ? '' : String(bal) };
}

export const FUND_NUMBER_KEYS: readonly FundFieldKey[] = FUND_FIELD_KEYS.filter(
  (k) => FUND_FIELDS[k].type === 'number' && k !== 'ucClosingBalance',
);

const MAX_CR = 999_999;

/** Field-level problems with the form, keyed by field. Empty when it can be saved. */
export function validateFundsForm(form: FundsForm): Partial<Record<keyof FundsForm, string>> {
  const errors: Partial<Record<keyof FundsForm, string>> = {};
  if (!form.fundingSourceType) errors.fundingSourceType = 'Select a Funding Source to save this section.';
  for (const k of FUND_NUMBER_KEYS) {
    const raw = form[k].trim();
    if (raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) errors[k] = 'Enter a number.';
    else if (n < 0) errors[k] = 'Cannot be negative.';
    else if (n > MAX_CR) errors[k] = `Must be at most ${MAX_CR.toLocaleString('en-IN')}.`;
  }
  if (form.fundingSourceType === 'Central - State Share') {
    const c = form.centralSharePct.trim();
    const s = form.stateSharePct.trim();
    const cn = Number(c);
    const sn = Number(s);
    if (c === '' || !Number.isFinite(cn) || cn < 0 || cn > 100) errors.centralSharePct = 'Enter a % between 0 and 100.';
    if (s === '' || !Number.isFinite(sn) || sn < 0 || sn > 100) errors.stateSharePct = 'Enter a % between 0 and 100.';
    if (!errors.centralSharePct && !errors.stateSharePct && cn + sn > 100) {
      errors.stateSharePct = `Central (${cn}%) + State (${sn}%) cannot exceed 100%.`;
    }
  }
  return errors;
}

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const textOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/** API payload for a valid form (see validateFundsForm). */
export function payloadFromForm(form: FundsForm): Omit<FundsUcCreatePayload, 'projectId'> {
  const isSplit = form.fundingSourceType === 'Central - State Share';
  return {
    fundingSource: form.fundingSourceType as FundingSource,
    fundSanctionAgency: (textOrNull(form.fundSanctionAgency) as FundSanctionAgency | null) ?? null,
    fundSanctionedAmountCr: numOrNull(form.fundSanctionedAmount),
    sanctionNo: textOrNull(form.ucSanctionNo),
    sanctionDate: textOrNull(form.ucSanctionDate),
    centralSharePct: isSplit ? numOrNull(form.centralSharePct) : null,
    stateSharePct: isSplit ? numOrNull(form.stateSharePct) : null,
    fundReleasedToUdhdCr: numOrNull(form.fundReleasedToUDHD),
    openingBalanceCr: numOrNull(form.ucOpeningBalance) ?? 0,
    grantReceivedCr: numOrNull(form.ucGrantReceived) ?? 0,
    expenditureIncurredCr: numOrNull(form.ucExpenditureIncurred) ?? 0,
    ucAmountCertifiedCr: numOrNull(form.ucAmountCertified),
    ucSentTo: (textOrNull(form.ucSentTo) as UcSentTo | null) ?? null,
    ucSubmittedDate: textOrNull(form.ucSubmissionDate),
    ucStatusOverride: (textOrNull(form.ucStatus) as FundsUcStatus | null) ?? null,
    remarks: textOrNull(form.ucRemarks),
  };
}

/** True when two forms would save differently. */
export function fundsFormsDiffer(a: FundsForm, b: FundsForm): boolean {
  return (Object.keys(a) as Array<keyof FundsForm>).some(
    (k) => k !== 'ucClosingBalance' && a[k].trim() !== b[k].trim(),
  );
}

/* ───────────────────── Existing: Central / State share ───────────────────── */

/**
 * Central / State share split for a Funds & UC entry, as percentages.
 *
 * Only "Central - State Share" funding carries a stored split; for the other
 * sources the split is implied by the source itself (centrally funded = 100%
 * central, State Funded = 100% state). Returns null for a stored split that
 * was never recorded, so a legacy row reads as "unknown" rather than 0%.
 */
export function sharePercentsOf(entry: {
  fundingSource: FundingSource;
  centralSharePct: number | null;
  stateSharePct: number | null;
}): { centralPct: number | null; statePct: number | null } {
  switch (entry.fundingSource) {
    case 'Central - State Share':
      return { centralPct: entry.centralSharePct, statePct: entry.stateSharePct };
    case 'Central - EAP':
    case 'Central - Non-EAP':
      return { centralPct: 100, statePct: 0 };
    case 'State Funded':
      return { centralPct: 0, statePct: 100 };
    default:
      return { centralPct: entry.centralSharePct, statePct: entry.stateSharePct };
  }
}
