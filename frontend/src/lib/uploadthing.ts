import { generateReactHelpers } from '@uploadthing/react';
import type { FileRouter } from 'uploadthing/types';
import { env } from '../env';

/**
 * The frontend and backend are separate deployable apps (no shared types
 * package), so this can't import `BuidcoFileRouter` from
 * backend/src/lib/uploadRouter.ts directly. Using the bare `FileRouter`
 * constraint here keeps `useUploadThing('geoPhoto', ...)` callable without
 * fighting UploadThing's branded `Uploader` type — the real route config
 * (JPG/PNG/WEBP, ≤3 MB, ≤6 files) is enforced server-side regardless.
 */
export const { useUploadThing } = generateReactHelpers<FileRouter>({
  url: `${env.VITE_API_BASE_URL}/uploads`,
});
