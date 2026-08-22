import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

/**
 * Universal Search (bhaveshTask.md) — top-right of the dashboard, beside
 * the profile button. Searches the Projects register (name, project ID, or
 * NIT number) via the same `?search=` param ProjectsFilterBar already reads
 * server-side (project_name/project_id/nit_number ILIKE) — reuses existing
 * capability instead of standing up a new cross-entity search endpoint.
 */
interface Props {
  className?: string;
  /** Called after a search navigates away — used to close the mobile drawer,
   *  same pattern as UtilityNavCluster's onNavigate. */
  onNavigate?: () => void;
}

export function UniversalSearchBar({ className = '', onNavigate }: Props): JSX.Element {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  const runSearch = (): void => {
    const q = value.trim();
    navigate(q ? `/projects?search=${encodeURIComponent(q)}` : '/projects');
    onNavigate?.();
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        runSearch();
      }}
      className={`relative ${className}`}
    >
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search projects by name, ID, or NIT number…"
        aria-label="Universal search — projects by name, ID, or NIT number"
        className="h-9 w-full rounded-lg border border-[#D1D5DB] bg-[#F9FAFB] pl-9 pr-3 text-[13px] text-[#111827] transition-colors placeholder:text-[#9CA3AF] focus-visible:border-[#1D4ED8] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/20"
      />
    </form>
  );
}
