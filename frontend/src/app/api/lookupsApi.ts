import { api } from '../api';
import type { Lookups } from '../../types/api';

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

    /** "Add New Scheme" — same reasoning as createSector above. */
    createScheme: build.mutation<{ schemeId: number; schemeName: string }, string>({
      query: (name) => ({ url: 'lookups/schemes', method: 'POST', body: { name } }),
      invalidatesTags: ['Lookups', 'Kpis'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetLookupsQuery, useCreateSectorMutation, useCreateSchemeMutation } = lookupsApi;
