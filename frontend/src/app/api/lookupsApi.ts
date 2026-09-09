import { api } from '../api';
import type { Lookups } from '../../types/api';

/** What a permanent delete actually removed — see lookupsService. */
export interface DeleteImpact {
  projectsDeleted: number;
  /** Kept, but detached: they belong to another scheme too. */
  projectsUnlinked: number;
}

export const lookupsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getLookups: build.query<Lookups, void>({
      query: () => 'lookups',
      providesTags: ['Lookups'],
      keepUnusedDataFor: 3600,
    }),

    /**
     * "Add New Sector" — Sectors page button and the Input Sheet's Sector
     * dropdown. Invalidates 'Kpis' too so the Sectors page's summary-card
     * grid (kpis/sector-summary) picks up the new sector immediately, not
     * just dropdowns/selects that read straight off 'Lookups'.
     */
    createSector: build.mutation<{ sectorId: number; sectorName: string }, string>({
      query: (name) => ({ url: 'lookups/sectors', method: 'POST', body: { name } }),
      invalidatesTags: ['Lookups', 'Kpis'],
    }),

    /**
     * Permanent deletion (Task 3). Invalidates far more broadly than the
     * create mutations: removing a sector/scheme also removes projects, so
     * every count, chart and list in the app can change. Anything narrower
     * would leave stale totals on screen after the delete.
     */
    deleteSector: build.mutation<DeleteImpact, number>({
      query: (sectorId) => ({ url: `lookups/sectors/${sectorId}`, method: 'DELETE' }),
      invalidatesTags: ['Lookups', 'Kpis', 'Project', 'ProjectList', 'Audit'],
    }),

    deleteScheme: build.mutation<DeleteImpact, number>({
      query: (schemeId) => ({ url: `lookups/schemes/${schemeId}`, method: 'DELETE' }),
      invalidatesTags: ['Lookups', 'Kpis', 'Project', 'ProjectList', 'Audit'],
    }),

    /** "Add New Scheme" — same reasoning as createSector above. */
    createScheme: build.mutation<{ schemeId: number; schemeName: string }, string>({
      query: (name) => ({ url: 'lookups/schemes', method: 'POST', body: { name } }),
      invalidatesTags: ['Lookups', 'Kpis'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetLookupsQuery,
  useCreateSectorMutation,
  useCreateSchemeMutation,
  useDeleteSectorMutation,
  useDeleteSchemeMutation,
} = lookupsApi;
