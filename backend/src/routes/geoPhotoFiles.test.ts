/**
 * S-21 — photo upload to this server's own storage and signed-link access,
 * end to end over HTTP, with the database layer mocked and a temporary
 * directory standing in for PHOTO_STORAGE_DIR.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const photoDir = vi.hoisted(() => {
  const base = process.env.TEMP ?? process.env.TMPDIR ?? '/tmp';
  const dir = `${base.replace(/[\\/]+$/, '')}/buidco-photo-test-${process.pid}-${Date.now()}`;
  process.env.PHOTO_STORAGE = 'local';
  process.env.PHOTO_STORAGE_DIR = dir;
  return dir;
});

vi.mock('../services/authService.js', () => ({
  getUserById: vi.fn(),
  isSessionActive: vi.fn(async () => true),
  isDemoLoginBlocked: vi.fn(() => false),
}));

vi.mock('../services/geoPhotosService.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/geoPhotosService.js')>()),
  createGeoPhotoFile: vi.fn(),
  getGeoPhotoFileTarget: vi.fn(),
}));

import { createApp } from '../app.js';
import { signAccessToken } from '../lib/tokens.js';
import * as authService from '../services/authService.js';
import * as geoPhotos from '../services/geoPhotosService.js';

const app = createApp();
const PROJECT = '22222222-2222-4222-8222-222222222222';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest-of-a-png-file'),
]);

const viewer = {
  userId: 42,
  username: 'site_viewer',
  fullName: 'Site Viewer',
  role: 'Viewer' as const,
  canCreateProjects: false,
  canUpdateProjects: false,
  canDeleteProjects: false,
  canViewProjects: true,
};

function bearer(): string {
  const { token } = signAccessToken({ sub: '42', role: 'Viewer', name: 'x', sid: 'test-session' });
  return `Bearer ${token}`;
}

let stored: { ref: string } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.isSessionActive).mockResolvedValue(true);
  vi.mocked(authService.isDemoLoginBlocked).mockReturnValue(false);
  vi.mocked(authService.getUserById).mockResolvedValue(viewer);
  vi.mocked(geoPhotos.createGeoPhotoFile).mockImplementation(async (projectId, input) => {
    stored = { ref: input.ref };
    return {
      photoId: 7,
      projectId,
      url: input.ref,
      caption: input.caption,
      photoDate: input.photoDate,
      sourceType: 'file',
      fileName: input.fileName,
    };
  });
  vi.mocked(geoPhotos.getGeoPhotoFileTarget).mockImplementation(async () =>
    stored ? { url: stored.ref, divisionId: 1 } : null,
  );
});

afterAll(() => {
  rmSync(photoDir, { recursive: true, force: true });
});

function upload(body: Buffer | string, type: string): request.Test {
  return request(app)
    .post(`/api/projects/${PROJECT}/geo-photos/files?fileName=site.png`)
    .set('Authorization', bearer())
    .set('Content-Type', type)
    .send(body);
}

describe('local photo storage (S-21)', () => {
  it('reports the active storage to the client', async () => {
    const res = await request(app).get('/api/uploads/config').set('Authorization', bearer()).expect(200);
    expect(res.body).toEqual({
      storage: 'local',
      maxBytes: 3 * 1024 * 1024,
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
  });

  it('stores a real image under a generated name and answers with a signed link', async () => {
    const res = await upload(PNG, 'image/png').expect(201);
    expect(res.body.url).toMatch(/^\/api\/photo-files\/7\?u=42&exp=\d+&sig=/);
    expect(stored?.ref).toMatch(/^local:[0-9a-f-]{36}\.png$/);
    expect(vi.mocked(geoPhotos.createGeoPhotoFile).mock.calls[0]?.[1].fileName).toBe('site.png');
    expect(readdirSync(photoDir)).toHaveLength(1);

    // The signed link serves exactly those bytes, as an image.
    const file = await request(app).get(res.body.url).buffer(true).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toMatch(/^private, max-age=\d+$/);
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);
  });

  it('refuses a tampered link, a link without a signature, and a link for a disabled account', async () => {
    const res = await upload(PNG, 'image/png').expect(201);
    const url: string = res.body.url;
    await request(app).get(url.replace(/sig=.{4}/, 'sig=AAAA')).expect(404);
    await request(app).get(url.replace(/&sig=.*$/, '')).expect(404);
    await request(app).get(url.replace('u=42', 'u=43')).expect(404);

    vi.mocked(authService.getUserById).mockResolvedValueOnce(null); // deactivated
    await request(app).get(url).expect(404);

    vi.mocked(authService.getUserById).mockResolvedValueOnce({ ...viewer, canViewProjects: false });
    await request(app).get(url).expect(404);
  });

  it('rejects content that is not really an image, whatever the declared type', async () => {
    const before = existsSync(photoDir) ? readdirSync(photoDir).length : 0;
    const res = await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'image/png').expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(existsSync(photoDir) ? readdirSync(photoDir).length : 0).toBe(before);
    expect(geoPhotos.createGeoPhotoFile).not.toHaveBeenCalled();
  });

  it('rejects other declared types', async () => {
    await upload('plain text', 'text/plain').expect(415);
    await upload(PNG, 'image/svg+xml').expect(415);
  });

  it('rejects files over the size limit', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const res = await upload(big, 'image/png');
    expect(res.status).toBe(413);
  });

  it('needs "Can view projects", like every project API (S-03)', async () => {
    vi.mocked(authService.getUserById).mockResolvedValue({ ...viewer, canViewProjects: false });
    const res = await upload(PNG, 'image/png').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN_VIEW');
  });

  it('removes the file again when the database insert fails', async () => {
    const before = existsSync(photoDir) ? readdirSync(photoDir).length : 0;
    vi.mocked(geoPhotos.createGeoPhotoFile).mockRejectedValueOnce(new Error('insert failed'));
    await upload(PNG, 'image/png').expect(500);
    expect(readdirSync(photoDir)).toHaveLength(before);
  });
});
