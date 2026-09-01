/**
 * Root RTK Query slice. All endpoint groups (auth, kpis, projects, …)
 * inject into this via `api.injectEndpoints`. One reducer path, one set
 * of tag types, one cache — clean invalidation across domains.
 */

import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export const TAG_TYPES = [
  'Auth',
  'Lookups',
  'Kpis',
  'Project',
  'ProjectList',
  'PhysicalHistory',
  'MilestoneHistory',
  'CosEot',
  'MgmtAction',
  'Milestone',
  'MonthlyProgress',
  'Mom',
  'MomAction',
  'PreMonsoon',
  'FundsUc',
  'GeoPhoto',
  'User',
  'Audit',
] as const;
export type TagType = (typeof TAG_TYPES)[number];

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [...TAG_TYPES],
  keepUnusedDataFor: 60,
  refetchOnMountOrArgChange: false,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
