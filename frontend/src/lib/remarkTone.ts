/**
 * Colour coding for project remarks / Outstanding Gap (bhaveshTask.md Task 4).
 *
 * One classifier, used by every table that shows a remark, so the same text
 * never renders in two different colours depending on where you're standing.
 *
 * The vocabulary below was derived from the remarks actually on record, not
 * invented — all 50 projects currently carry one, and they fall into a small
 * number of recurring shapes:
 *
 *   "No outstanding issues reported."                        → clear
 *   "Escalated to Revenue Department (Land Acquisition)…"     → attention
 *   "Bid evaluation for Package 6 pending committee sign-off" → process
 *   "…blocking resumption of work."                          → critical
 *   "Land encroachment at 3 sites blocking handover…"         → critical
 *
 * Order of evaluation matters and is deliberate: critical wins over
 * everything (a blocked project is blocked no matter what else the sentence
 * says), then an explicit all-clear, then escalation//delay, and only then
 * the routine in-process wording. Anything with no recognisable signal stays
 * neutral rather than being forced into a colour it hasn't earned — a
 * misleading green is worse than an honest grey.
 */

export type RemarkTone = 'critical' | 'attention' | 'process' | 'clear' | 'neutral';

export interface RemarkToneStyle {
  /** Tailwind classes for a bordered chip/badge. */
  chip: string;
  /** Tailwind text colour for plain inline text. */
  text: string;
  /** Leading glyph conveying the same thing as the colour, for anyone who
   *  can't distinguish these hues — colour is never the only signal. */
  icon: string;
  /** Screen-reader / tooltip prefix. */
  label: string;
}

/** Matched in this order; first hit wins. */
const RULES: ReadonlyArray<{ tone: RemarkTone; pattern: RegExp }> = [
  {
    tone: 'critical',
    pattern:
      /\b(block(?:ing|ed)?|halt(?:ed)?|stall(?:ed)?|stopped|encroach\w*|critical|urgent|despite reminders?|not submitted|major delay|dispute|arbitration|terminat\w*|show cause|no progress)\b/i,
  },
  {
    tone: 'clear',
    pattern:
      /\b(no outstanding|no issues?|no pending|none reported|completed|resolved|closed|satisfactory|on track|nil)\b/i,
  },
  {
    tone: 'attention',
    pattern:
      /\b(escalat\w*|land acquisition|utility shifting|clearance pending|awaiting|delay(?:ed|s)?|shortfall|slow progress|non-?compliance|reminder)\b/i,
  },
  {
    tone: 'process',
    pattern:
      /\b(pending|under process|in progress|under review|bid evaluation|evaluation|tender\w*|sign-?off|submitted|scheduled|ongoing|proposed)\b/i,
  },
];

/** Classify a remark's meaning. Empty/absent remarks are `neutral`. */
export function remarkToneOf(remark: string | null | undefined): RemarkTone {
  if (!remark || remark.trim() === '') return 'neutral';
  for (const rule of RULES) {
    if (rule.pattern.test(remark)) return rule.tone;
  }
  return 'neutral';
}

/**
 * Palette. Every pairing is a dark foreground on a pale tint of the same hue,
 * which keeps small text legible — the point is to make the remark easier to
 * triage, not harder to read.
 */
const STYLES: Record<RemarkTone, RemarkToneStyle> = {
  critical: {
    chip: 'border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2]',
    text: 'text-[#B91C1C]',
    icon: '⛔',
    label: 'Critical',
  },
  attention: {
    chip: 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7]',
    text: 'text-[#92400E]',
    icon: '⚠',
    label: 'Needs attention',
  },
  process: {
    chip: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]',
    text: 'text-[#1D4ED8]',
    icon: 'ℹ',
    label: 'In process',
  },
  clear: {
    chip: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857] hover:bg-[#D1FAE5]',
    text: 'text-[#047857]',
    icon: '✓',
    label: 'No open issue',
  },
  neutral: {
    chip: 'border-[#D1D5DB] bg-[#F9FAFB] text-[#374151] hover:bg-[#F3F4F6]',
    text: 'text-[#374151]',
    icon: '•',
    label: 'Recorded',
  },
};

export function remarkStyleOf(remark: string | null | undefined): RemarkToneStyle {
  return STYLES[remarkToneOf(remark)];
}

export function styleForTone(tone: RemarkTone): RemarkToneStyle {
  return STYLES[tone];
}
