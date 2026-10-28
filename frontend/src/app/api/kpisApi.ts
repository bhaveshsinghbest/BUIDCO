import { api } from '../api';
import type {
  CosEotRecord,
  DelayStatusRow,
  DistrictSummaryRow,
  FinancialSecurities,
  ItemsResponse,
  MgmtActionSummaryRow,
  OffsetPage,
  OmStatusRow,
  OutstandingGapRow,
  OverviewKpis,
  InsuranceExpiryAlert,
  PbgExpiryAlert,
  ScheduleVsActual,
  DivisionSummaryRow,
  RegionSummaryRow,
  SchemeChartRow,
  SchemeKpiSummaryRow,
  SchemeSummaryRow,
  SectorSummaryRow,
  StageBucket,
  StatusDonutRow,
  WorkTypeCounts,
} from '../../types/api';

export const kpisApi = api.injectEndpoints({
  endpoints: (build) => ({
    getOverviewKpis: build.query<OverviewKpis, void>({
      query: () => 'kpis/overview',
      providesTags: ['Kpis'],
    }),
    getScheduleVsActual: build.query<ScheduleVsActual, void>({
      query: () => 'kpis/schedule-vs-actual',
      providesTags: ['Kpis'],
    }),
    getStageBuckets: build.query<ItemsResponse<StageBucket>, void>({
      query: () => 'kpis/stage-buckets',
      providesTags: ['Kpis'],
    }),
    getWorkTypeCounts: build.query<WorkTypeCounts, void>({
      query: () => 'kpis/work-type-counts',
      providesTags: ['Kpis'],
    }),
    getFinancialSecurities: build.query<FinancialSecurities, void>({
      query: () => 'kpis/financial-securities',
      providesTags: ['Kpis'],
    }),
    getPbgExpiryAlerts: build.query<ItemsResponse<PbgExpiryAlert>, void>({
      query: () => 'kpis/pbg-expiry-alerts',
      providesTags: ['Kpis'],
    }),
    getInsuranceExpiryAlerts: build.query<ItemsResponse<InsuranceExpiryAlert>, void>({
      query: () => 'kpis/insurance-expiry-alerts',
      providesTags: ['Kpis'],
    }),
    getOmStatus: build.query<ItemsResponse<OmStatusRow>, void>({
      query: () => 'kpis/om-status',
      providesTags: ['Kpis'],
    }),
    getOmExpiryAlerts: build.query<ItemsResponse<OmStatusRow>, void>({
      query: () => 'kpis/om-expiry-alerts',
      providesTags: ['Kpis'],
    }),
    getSchemeChart: build.query<ItemsResponse<SchemeChartRow>, void>({
      query: () => 'kpis/scheme-chart',
      providesTags: ['Kpis'],
    }),
    getStatusDonut: build.query<ItemsResponse<StatusDonutRow>, void>({
      query: () => 'kpis/status-donut',
      providesTags: ['Kpis'],
    }),
    getSchemeSummary: build.query<ItemsResponse<SchemeSummaryRow>, void>({
      query: () => 'kpis/scheme-summary',
      providesTags: ['Kpis'],
    }),
    getSchemeKpiSummary: build.query<ItemsResponse<SchemeKpiSummaryRow>, void>({
      query: () => 'kpis/scheme-kpi-summary',
      providesTags: ['Kpis'],
    }),
    getSectorSummary: build.query<ItemsResponse<SectorSummaryRow>, void>({
      query: () => 'kpis/sector-summary',
      providesTags: ['Kpis'],
    }),
    getDistrictSummary: build.query<ItemsResponse<DistrictSummaryRow>, void>({
      query: () => 'kpis/district-summary',
      providesTags: ['Kpis'],
    }),
    getDivisionSummary: build.query<ItemsResponse<DivisionSummaryRow>, void>({
      query: () => 'kpis/division-summary',
      providesTags: ['Kpis'],
    }),
    getRegionSummary: build.query<ItemsResponse<RegionSummaryRow>, void>({
      query: () => 'kpis/region-summary',
      providesTags: ['Kpis'],
    }),
    getDelayStatus: build.query<ItemsResponse<DelayStatusRow>, void>({
      query: () => 'kpis/delay-status',
      providesTags: ['Kpis'],
    }),
    getOutstandingGaps: build.query<ItemsResponse<OutstandingGapRow>, void>({
      query: () => 'kpis/outstanding-gaps',
      providesTags: ['Kpis'],
    }),
    getMgmtActionSummary: build.query<ItemsResponse<MgmtActionSummaryRow>, void>({
      query: () => 'kpis/management-action-summary',
      providesTags: ['Kpis'],
    }),
    listCosEotRecords: build.query<OffsetPage<CosEotRecord>, { limit?: number; offset?: number }>({
      query: (args) => ({ url: 'kpis/cos-eot-records', params: args }),
      providesTags: ['Kpis', 'CosEot'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetOverviewKpisQuery,
  useGetScheduleVsActualQuery,
  useGetStageBucketsQuery,
  useGetWorkTypeCountsQuery,
  useGetFinancialSecuritiesQuery,
  useGetInsuranceExpiryAlertsQuery,
  useGetPbgExpiryAlertsQuery,
  useGetOmStatusQuery,
  useGetOmExpiryAlertsQuery,
  useGetSchemeChartQuery,
  useGetStatusDonutQuery,
  useGetSchemeSummaryQuery,
  useGetSchemeKpiSummaryQuery,
  useGetSectorSummaryQuery,
  useGetDistrictSummaryQuery,
  useGetDivisionSummaryQuery,
  useGetRegionSummaryQuery,
  useGetDelayStatusQuery,
  useGetOutstandingGapsQuery,
  useGetMgmtActionSummaryQuery,
  useListCosEotRecordsQuery,
} = kpisApi;
