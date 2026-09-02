import { api } from '../api';
import type { FundsUcCreatePayload, FundsUcEntry, FundsUcUpdatePayload, ItemsResponse } from '../../types/api';

export const fundsUcApi = api.injectEndpoints({
  endpoints: (build) => ({
    listFundsUc: build.query<ItemsResponse<FundsUcEntry>, void>({
      query: () => 'funds-uc',
      providesTags: ['FundsUc'],
    }),
    /** Single-project lookup — used by every individual project-details view
     *  (Input Sheet, Project Details, MD Portfolio) instead of fetching the
     *  entire ledger just to find one row. `null` means no entry yet — a
     *  normal state, not an error. */
    getFundsUcByProject: build.query<FundsUcEntry | null, string>({
      query: (projectId) => `funds-uc/project/${projectId}`,
      providesTags: ['FundsUc'],
    }),
    createFundsUc: build.mutation<FundsUcEntry, FundsUcCreatePayload>({
      query: (body) => ({ url: 'funds-uc', method: 'POST', body }),
      invalidatesTags: ['FundsUc'],
    }),
    updateFundsUc: build.mutation<FundsUcEntry, { fundsUcId: number; body: FundsUcUpdatePayload }>({
      query: ({ fundsUcId, body }) => ({ url: `funds-uc/${fundsUcId}`, method: 'PATCH', body }),
      invalidatesTags: ['FundsUc'],
    }),
    deleteFundsUc: build.mutation<void, number>({
      query: (fundsUcId) => ({ url: `funds-uc/${fundsUcId}`, method: 'DELETE' }),
      invalidatesTags: ['FundsUc'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListFundsUcQuery,
  useGetFundsUcByProjectQuery,
  useCreateFundsUcMutation,
  useUpdateFundsUcMutation,
  useDeleteFundsUcMutation,
} = fundsUcApi;
