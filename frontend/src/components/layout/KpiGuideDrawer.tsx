import { useEffect } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface KpiEntry {
  label: string;
  formula: string;
  source: string;
  why?: string;
}

interface KpiGroup {
  title: string;
  intro: string;
  kpis: KpiEntry[];
}

const KPI_SECTIONS: KpiGroup[] = [
  {
    title: '1 · Overview KPIs',
    intro: 'Top-of-dashboard tiles on /overview.',
    kpis: [
      {
        label: 'Total Projects',
        formula: 'COUNT(project)',
        source: '/api/kpis/overview → total',
      },
      {
        label: 'Completed / In Progress / Delayed / On Hold / Not Started',
        formula: "COUNT WHERE project.status = 'Completed'|'In Progress'|…",
        source: '/api/kpis/overview',
      },
      {
        label: 'Total AA Amount (₹ Cr)',
        formula: 'SUM(project.aa_amount_cr)',
        source: '/api/kpis/overview → totalAaCr',
      },
      {
        label: 'Total Agreement Amount',
        formula: 'SUM(project.agreement_amount_cr)',
        source: '/api/kpis/overview → totalAgreementCr',
      },
      {
        label: 'Total Financial Progress',
        formula: 'SUM(project.financial_progress_cr)',
        source: '/api/kpis/overview → totalFinancialCr',
      },
      {
        label: 'Financial Utilisation %',
        formula: '(SUM(financial_progress_cr) / SUM(aa_amount_cr)) × 100',
        source: '/api/kpis/overview → financialUtilisationPct',
        why: 'Reference JSX shows this as the yellow utilisation bar on the AA card.',
      },
    ],
  },
  {
    title: '2 · Physical vs Scheduled Progress',
    intro: 'Milestone-weighted physical % takes precedence over manually entered value.',
    kpis: [
      {
        label: 'Effective Physical % (per project)',
        formula: 'v_project_effective_physical.physical_progress_pct',
        source: 'DB view — falls back to project.physical_progress_pct when no milestones',
        why: "Enables the 'Milestone-weighted' vs 'Manual entry' badge on Project Detail.",
      },
      {
        label: 'Avg Physical %',
        formula: 'AVG(effective_physical_pct) across all projects',
        source: '/api/kpis/schedule-vs-actual → avgActualPct',
      },
      {
        label: 'Avg Scheduled %',
        formula: 'AVG(project.scheduled_progress_pct) — nulls excluded',
        source: '/api/kpis/schedule-vs-actual → avgScheduledPctEffective',
      },
      {
        label: 'On-schedule / Behind schedule pill',
        formula: 'avgActualPct >= avgScheduledPct',
        source: 'ScheduleVsActualCard (computed client-side)',
      },
    ],
  },
  {
    title: '3 · Stage Buckets',
    intro: 'Groups projects by Project Stage (Section 01 in Input Sheet). Every project falls in exactly one bucket.',
    kpis: [
      {
        label: 'Stage counts + AA totals',
        formula: 'GROUP BY project.project_stage_v2 → count, SUM(aa_amount_cr)',
        source: '/api/kpis/stage-buckets',
        why: 'Populates the stage strip on /overview and the workflow tabs in the reference JSX.',
      },
      {
        label: 'Work Type Mix',
        formula: 'COUNT WHERE work_type = X',
        source: '/api/kpis/work-type-counts',
      },
    ],
  },
  {
    title: '4 · Financial Securities',
    intro: 'Aggregate PBG / EMD / mobilisation / retention exposure.',
    kpis: [
      {
        label: 'Total Mob Advance / Advance Outstanding / Retention / PBG / EMD',
        formula: 'SUM of each corresponding project column',
        source: '/api/kpis/financial-securities',
      },
      {
        label: 'PBG Expired count',
        formula: 'COUNT WHERE pbg_expiry_date < CURRENT_DATE',
        source: '/api/kpis/financial-securities → pbgExpiredCount',
      },
      {
        label: 'PBG Expiry Alerts',
        formula: 'WHERE pbg_expiry_date BETWEEN today AND today + 30 days',
        source: '/api/kpis/pbg-expiry-alerts',
        why: 'Drives the red banner at the top of /overview.',
      },
      {
        label: 'Insurance Expiry Alerts',
        formula: 'WHERE insurance_expiry_date BETWEEN today AND today + 30 days',
        source: '/api/kpis/insurance-expiry-alerts',
      },
    ],
  },
  {
    title: '5 · O&M',
    intro: "Computed per project via compute_om_info() — matches reference JSX.",
    kpis: [
      {
        label: 'O&M Status',
        formula:
          "today < start → Not Started · daysLeft < 0 → Expired · daysLeft ≤ 30 → Expiring Soon · else Ongoing · manual override wins",
        source: '/api/kpis/om-status, /api/kpis/om-expiry-alerts',
      },
      {
        label: 'Elapsed / Remaining / % elapsed',
        formula: '(today − start) vs (end − start), clamped 0–100',
        source: 'OmDetailsSection live preview + Project Detail card',
      },
    ],
  },
  {
    title: '6 · Delay',
    intro: 'Computed per project — Planned vs Revised end date vs today.',
    kpis: [
      {
        label: 'Total delay days',
        formula: 'MAX(0, today − planned_end_date)',
        source: '/api/kpis/delay-status',
      },
      {
        label: 'Covered by EoT',
        formula: 'MIN(total_delay, revised_end_date − planned_end_date)',
        source: '/api/kpis/delay-status → coveredByEotDays',
      },
      {
        label: 'Uncovered delay',
        formula: 'MAX(0, today − revised_end_date)',
        source: '/api/kpis/delay-status → uncoveredDelayDays',
        why: '> 0 → project flagged red in Reference JSX.',
      },
    ],
  },
  {
    title: '7 · Governance & Outstanding',
    intro: 'Sourced from CoS/EoT rows, management actions, and free-text remarks.',
    kpis: [
      {
        label: 'Outstanding Gaps',
        formula: 'project WHERE remark IS NOT NULL AND remark != ""',
        source: '/api/kpis/outstanding-gaps',
      },
      {
        label: 'Management Actions Summary',
        formula: 'GROUP BY project_id → COUNT open/closed action items',
        source: '/api/kpis/management-action-summary',
      },
      {
        label: 'CoS / EoT records',
        formula: 'cos_eot_item rows joined with parent project',
        source: '/api/kpis/cos-eot-records',
      },
    ],
  },
];

export function KpiGuideDrawer({ open, onClose }: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="KPI guide"
    >
      <button
        type="button"
        aria-label="Close KPI guide"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative flex h-full w-full max-w-2xl flex-col border-l border-[#E5E7EB] bg-white shadow-2xl',
        )}
      >
        <header className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#1E3A5F] px-5 py-3 text-white">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#93C5FD]">
              Reference
            </div>
            <h2 className="text-[15px] font-bold">KPI Guide — How every metric is computed</h2>
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>
            × Close
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 rounded border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[12px] text-[#1D4ED8]">
            💡 If a KPI shows unexpected values, verify the underlying <code>project</code> or
            child-table columns using the source endpoint listed with each metric.
          </p>
          {KPI_SECTIONS.map((section) => (
            <section key={section.title} className="mb-6">
              <h3 className="text-sm font-bold text-[#111827]">{section.title}</h3>
              <p className="mt-0.5 text-[12px] text-[#6B7280]">{section.intro}</p>
              <ul className="mt-2 space-y-2">
                {section.kpis.map((k) => (
                  <li
                    key={k.label}
                    className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-2.5 text-[12.5px]"
                  >
                    <div className="font-semibold text-[#111827]">{k.label}</div>
                    <div className="mt-1 text-[11.5px]">
                      <span className="font-bold text-[#374151]">Formula: </span>
                      <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#7C3AED]">
                        {k.formula}
                      </code>
                    </div>
                    <div className="mt-0.5 text-[11.5px]">
                      <span className="font-bold text-[#374151]">Source: </span>
                      <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#1D4ED8]">
                        {k.source}
                      </code>
                    </div>
                    {k.why ? (
                      <p className="mt-1 text-[11px] italic text-[#6B7280]">↳ {k.why}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
