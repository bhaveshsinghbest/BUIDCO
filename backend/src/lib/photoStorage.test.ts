import { describe, expect, it } from 'vitest';
import {
  cleanFileName,
  presentPhoto,
  resolvePhotoStorage,
  signPhotoLink,
  sniffImageKind,
  storageKeyOf,
  verifyPhotoLink,
} from './photoStorage.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

describe('photo storage selection (S-21)', () => {
  it('explicit setting wins; otherwise UploadThing when its token is set, else off', () => {
    expect(resolvePhotoStorage({ PHOTO_STORAGE: 'local', UPLOADTHING_TOKEN: 'x' })).toBe('local');
    expect(resolvePhotoStorage({ PHOTO_STORAGE: undefined, UPLOADTHING_TOKEN: 'x' })).toBe('uploadthing');
    expect(resolvePhotoStorage({ PHOTO_STORAGE: undefined, UPLOADTHING_TOKEN: undefined })).toBe('off');
  });
});

describe('sniffImageKind — the bytes decide, not the name or declared type', () => {
  it('recognises JPEG, PNG and WebP', () => {
    expect(sniffImageKind(JPEG)).toBe('jpeg');
    expect(sniffImageKind(PNG)).toBe('png');
    expect(sniffImageKind(WEBP)).toBe('webp');
  });

  it('rejects anything else, including HTML and SVG dressed up as images', () => {
    expect(sniffImageKind(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageKind(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageKind(Buffer.alloc(0))).toBeNull();
  });
});

describe('storage references', () => {
  it('accepts only the exact file names the server generates', () => {
    expect(storageKeyOf('local:0b7c1e2a-1111-4222-8333-444455556666.png')).toBe(
      '0b7c1e2a-1111-4222-8333-444455556666.png',
    );
    expect(storageKeyOf('local:../../etc/passwd')).toBeNull();
    expect(storageKeyOf('local:0b7c1e2a-1111-4222-8333-444455556666.png/../x')).toBeNull();
    expect(storageKeyOf('local:0b7c1e2a-1111-4222-8333-444455556666.exe')).toBeNull();
    expect(storageKeyOf('https://example.org/a.png')).toBeNull();
  });

  it('keeps the original file name only as a harmless label', () => {
    expect(cleanFileName('C:\\Users\\x\\site "photo".jpg')).toBe('site photo.jpg');
    expect(cleanFileName('../../evil.png')).toBe('evil.png');
    expect(cleanFileName('')).toBeNull();
    expect(cleanFileName(undefined)).toBeNull();
  });
});

describe('signed photo links', () => {
  const now = Date.UTC(2026, 10, 16, 12, 0, 0);

  function parts(link: string): { exp: number; sig: string; u: number } {
    const url = new URL(link, 'https://dashboard.example');
    return {
      exp: Number(url.searchParams.get('exp')),
      sig: url.searchParams.get('sig') ?? '',
      u: Number(url.searchParams.get('u')),
    };
  }

  it('a fresh link verifies for its own photo and user', () => {
    const { exp, sig, u } = parts(signPhotoLink(7, 42, now));
    expect(u).toBe(42);
    expect(verifyPhotoLink(7, 42, exp, sig, now)).toBe(true);
  });

  it('expires after 30 minutes', () => {
    const { exp, sig } = parts(signPhotoLink(7, 42, now));
    expect(verifyPhotoLink(7, 42, exp, sig, now + 29 * 60_000)).toBe(true);
    expect(verifyPhotoLink(7, 42, exp, sig, now + 31 * 60_000)).toBe(false);
  });

  it('cannot be moved to another photo, another user, or a later expiry', () => {
    const { exp, sig } = parts(signPhotoLink(7, 42, now));
    expect(verifyPhotoLink(8, 42, exp, sig, now)).toBe(false);
    expect(verifyPhotoLink(7, 43, exp, sig, now)).toBe(false);
    expect(verifyPhotoLink(7, 42, exp + 3600, sig, now)).toBe(false);
    expect(verifyPhotoLink(7, 42, exp, `${sig.slice(0, -2)}AA`, now)).toBe(false);
    expect(verifyPhotoLink(7, 42, exp, 'short', now)).toBe(false);
  });

  it('presentPhoto swaps a stored reference for a signed link and leaves external URLs alone', () => {
    const local = presentPhoto({ photoId: 7, url: 'local:0b7c1e2a-1111-4222-8333-444455556666.png' }, 42);
    expect(local.url).toMatch(/^\/api\/photo-files\/7\?u=42&exp=\d+&sig=/);
    const external = presentPhoto({ photoId: 8, url: 'https://maps.example/x' }, 42);
    expect(external.url).toBe('https://maps.example/x');
  });
});
