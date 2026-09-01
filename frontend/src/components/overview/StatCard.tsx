import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const toneStyles: Record<Tone, { border: string; value: string; icon: string; hoverRing: string }> = {
  brand: {
    border: 'border-l-4 border-l-[#1E3A5F]',
    value: 'text-[#1E3A5F]',
    icon: 'bg-[#EFF6FF] text-[#1E3A5F]',
    hoverRing: 'hover:ring-2 hover:ring-[#1E3A5F]/20',
  },
  success: {
    border: 'border-l-4 border-l-[#15803D]',
    value: 'text-[#15803D]',
    icon: 'bg-[#DCFCE7] text-[#15803D]',
    hoverRing: 'hover:ring-2 hover:ring-[#15803D]/20',
  },
  info: {
    border: 'border-l-4 border-l-[#1D4ED8]',
    value: 'text-[#1D4ED8]',
    icon: 'bg-[#DBEAFE] text-[#1D4ED8]',
    hoverRing: 'hover:ring-2 hover:ring-[#1D4ED8]/20',
  },
  warning: {
    border: 'border-l-4 border-l-[#B45309]',
    value: 'text-[#B45309]',
    icon: 'bg-[#FEF3C7] text-[#B45309]',
    hoverRing: 'hover:ring-2 hover:ring-[#B45309]/20',
  },
  danger: {
    border: 'border-l-4 border-l-[#B91C1C]',
    value: 'text-[#B91C1C]',
    icon: 'bg-[#FEE2E2] text-[#B91C1C]',
    hoverRing: 'hover:ring-2 hover:ring-[#B91C1C]/20',
  },
  neutral: {
    border: 'border-l-4 border-l-[#6B7280]',
    value: 'text-[#374151]',
    icon: 'bg-[#F3F4F6] text-[#374151]',
    hoverRing: 'hover:ring-2 hover:ring-[#374151]/20',
  },
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  to?: string;
  /** Alternative to `to` for cards that act on the current page (scroll to
   *  a section, apply a filter) instead of navigating to a different route. */
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  to,
  onClick,
  disabled,
  ariaLabel,
}: StatCardProps): JSX.Element {
  const styles = toneStyles[tone];
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7280]">
          {label}
        </span>
        {icon ? (
          <span
            className={cn(
              'grid h-8 w-8 place-items-center rounded-full text-base transition-transform group-hover:scale-110',
              styles.icon,
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums leading-none', styles.value)}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-[#6B7280]">{hint}</div> : null}
    </>
  );

  const interactive = (Boolean(to) || Boolean(onClick)) && !disabled;
  const containerClass = cn(
    'group block w-full rounded-lg border border-[#E5E7EB] bg-white p-3 text-left shadow-sm transition-all',
    styles.border,
    interactive ? cn('cursor-pointer hover:-translate-y-0.5 hover:shadow-md', styles.hoverRing) : '',
    disabled ? 'opacity-70' : '',
  );

  if (to && !disabled) {
    return (
      <NavLink to={to} className={containerClass} aria-label={ariaLabel ?? label}>
        {body}
      </NavLink>
    );
  }
  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} className={containerClass} aria-label={ariaLabel ?? label}>
        {body}
      </button>
    );
  }
  return <div className={containerClass}>{body}</div>;
}
