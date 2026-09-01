import { api } from '../api';
import type { FundsUcCreatePayload, FundsUcEntry, FundsUcUpdatePayload, ItemsResponse } from '../../types/api';

export const fundsUcApi = api.injectEndpoints({
  endpoints: (build) => ({
    listFundsUc: build.query<ItemsResponse<FundsUcEntry>, void>({
      query: () => 'funds-uc',
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
  useCreateFundsUcMutation,
  useUpdateFundsUcMutation,
  useDeleteFundsUcMutation,
} = fundsUcApi;
