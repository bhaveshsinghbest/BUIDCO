import { api } from '../api';
import type {
  GeoPhoto,
  GeoPhotoUpdatePayload,
  GeoPhotoUrlCreatePayload,
  ItemsResponse,
  PhotoUploadConfig,
} from '../../types/api';

export const geoPhotosApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Which upload path this server offers (local storage, UploadThing, or none). */
    getPhotoUploadConfig: build.query<PhotoUploadConfig, void>({
      query: () => 'uploads/config',
    }),
    /**
     * Upload to the server's own storage (PHOTO_STORAGE=local, finding S-21).
     * The raw file is the body; the server checks its real format and size.
     */
    uploadGeoPhotoFile: build.mutation<
      GeoPhoto,
      { projectId: string; file: File; photoDate?: string }
    >({
      query: ({ projectId, file, photoDate }) => ({
        url: `projects/${projectId}/geo-photos/files`,
        method: 'POST',
        params: { fileName: file.name, ...(photoDate ? { photoDate } : {}) },
        headers: { 'Content-Type': file.type },
        body: file,
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'GeoPhoto', id: arg.projectId }],
    }),
    listGeoPhotos: build.query<ItemsResponse<GeoPhoto>, string>({
      query: (projectId) => `projects/${projectId}/geo-photos`,
      providesTags: (_res, _err, projectId) => [{ type: 'GeoPhoto', id: projectId }],
    }),
    createGeoPhotoUrl: build.mutation<
      GeoPhoto,
      { projectId: string; body: GeoPhotoUrlCreatePayload }
    >({
      query: ({ projectId, body }) => ({
        url: `projects/${projectId}/geo-photos`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'GeoPhoto', id: arg.projectId }],
    }),
    updateGeoPhoto: build.mutation<
      GeoPhoto,
      { projectId: string; photoId: number; body: GeoPhotoUpdatePayload }
    >({
      query: ({ projectId, photoId, body }) => ({
        url: `projects/${projectId}/geo-photos/${photoId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'GeoPhoto', id: arg.projectId }],
    }),
    deleteGeoPhoto: build.mutation<void, { projectId: string; photoId: number }>({
      query: ({ projectId, photoId }) => ({
        url: `projects/${projectId}/geo-photos/${photoId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: 'GeoPhoto', id: arg.projectId }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetPhotoUploadConfigQuery,
  useUploadGeoPhotoFileMutation,
  useListGeoPhotosQuery,
  useCreateGeoPhotoUrlMutation,
  useUpdateGeoPhotoMutation,
  useDeleteGeoPhotoMutation,
} = geoPhotosApi;
