import { useRef, useState } from 'react';
import {
  geoPhotosApi,
  useCreateGeoPhotoUrlMutation,
  useDeleteGeoPhotoMutation,
} from '../../app/api/geoPhotosApi';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { selectAccessToken } from '../../features/auth/authSlice';
import { useUploadThing } from '../../lib/uploadthing';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { FormField } from './FormField';
import { FormSectionHeader } from './FormSectionHeader';
import type { GeoPhoto } from '../../types/api';
import type { ProjectDraft } from '../../hooks/useProjectDraft';

const MAX_UPLOAD_FILES = 6;

interface Props {
  projectId: string | null;
  draft: ProjectDraft;
  setField: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
  photos: GeoPhoto[];
  /** Creates the project first (if it doesn't exist yet) and returns its ID,
   *  so photos can be attached before the user has explicitly saved — see
   *  InputSheetPage's `ensureProjectSaved`. */
  onEnsureProjectSaved: () => Promise<string>;
  /** Override the default section number (used by the ALL Fields tab). */
  num?: string;
}

export function GeoTaggingSection({
  projectId, draft, setField, photos, onEnsureProjectSaved, num = '04',
}: Props): JSX.Element {
  const dispatch = useAppDispatch();
  const accessToken = useAppSelector(selectAccessToken);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createPhoto, createState] = useCreateGeoPhotoUrlMutation();
  const [deletePhoto, deleteState] = useDeleteGeoPhotoMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing('geoPhoto', {
    headers: () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    onUploadError: (e) => setError(e.message || 'Upload failed. Please try again.'),
  });

  const busy = createState.isLoading || deleteState.isLoading || isUploading;

  const canSave = url.trim().length > 0;

  const handleFilesSelected = async (fileList: FileList | null): Promise<void> => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    try {
      const savedProjectId = projectId ?? (await onEnsureProjectSaved());
      const files = Array.from(fileList).slice(0, MAX_UPLOAD_FILES);
      await startUpload(files, { projectId: savedProjectId });
      dispatch(geoPhotosApi.util.invalidateTags([{ type: 'GeoPhoto', id: savedProjectId }]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddUrl = async (): Promise<void> => {
    if (!url.trim()) return;
    try {
      setError(null);
      const savedProjectId = projectId ?? (await onEnsureProjectSaved());
      await createPhoto({
        projectId: savedProjectId,
        body: {
          url: url.trim(),
          caption: caption.trim() || null,
          photoDate: new Date().toISOString().slice(0, 10),
        },
      }).unwrap();
      setUrl('');
      setCaption('');
    } catch (err) {
      setError(readError(err));
    }
  };

  const handleDelete = async (photoId: number): Promise<void> => {
    if (!projectId) return;
    if (!window.confirm('Delete this photo?')) return;
    try {
      setError(null);
      await deletePhoto({ projectId, photoId }).unwrap();
    } catch (err) {
      setError(readError(err));
    }
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <FormSectionHeader
          num={num}
          title="Geo-Tagging"
          sub="Reference/overview URL for the dashboard + linked site photos"
        />

        <div className="mb-4">
          <FormField
            label="Geo-Tagging URL (overview / dashboard link)"
            value={draft.geoTaggingUrl}
            onChange={(v) => setField('geoTaggingUrl', v || null)}
            placeholder="https://…"
            hint="Full URL only (https://…). Blank is allowed."
          />
        </div>

        <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-[#374151]">
            Upload photo from device
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => void handleFilesSelected(e.target.files)}
              disabled={busy}
              className="block flex-1 text-[12.5px] text-[#374151] file:mr-3 file:h-9 file:rounded file:border-0 file:bg-[#1E3A5F] file:px-3 file:text-[12.5px] file:font-medium file:text-white hover:file:bg-[#152a48] disabled:opacity-60"
            />
            {isUploading ? <span className="text-[12px] text-[#6B7280]">Uploading…</span> : null}
          </div>
          <p className="mt-2 text-[11px] text-[#6B7280]">
            JPG, PNG, or WEBP — up to 3 MB each, {MAX_UPLOAD_FILES} files per upload.
          </p>

          <div className="my-3 border-t border-[#E5E7EB]" />

          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-[#374151]">
            Add photo (by URL / link)
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_auto]">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…  or paste Maps/Drive/WhatsApp link"
              className="h-9 rounded border border-[#D1D5DB] bg-white px-3 text-[13px]"
            />
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
              className="h-9 rounded border border-[#D1D5DB] bg-white px-3 text-[13px]"
            />
            <Button size="sm" onClick={handleAddUrl} disabled={!canSave || busy}>
              + Add Link
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B91C1C]">
            {error}
          </div>
        ) : null}

        {photos.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p) => (
              <div
                key={p.photoId}
                className="overflow-hidden rounded border border-[#E5E7EB] bg-white"
              >
                <div className="relative flex h-32 items-center justify-center bg-[#F3F4F6]">
                  <img
                    src={p.url}
                    alt={p.caption ?? 'Site photo'}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.style.display = 'none';
                    }}
                  />
                </div>
                <div className="px-2.5 py-1.5">
                  <div className="truncate text-[12px] font-semibold text-[#111827]">
                    {p.caption ?? '—'}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-[#6B7280]">
                    <span>{p.photoDate ?? '—'}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[#2563EB] hover:underline"
                      >
                        Open ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.photoId)}
                        disabled={busy}
                        className="text-[#B91C1C] hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[12.5px] text-[#6B7280]">No photos yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function readError(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const e = (data as { error?: { message?: string } }).error;
      if (e?.message) return e.message;
    }
  }
  return 'Something went wrong. Please retry.';
}
