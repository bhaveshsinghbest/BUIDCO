/**
 * Return `url` only when it is an http(s) link, else null.
 *
 * Geo-photo and geo-tagging URLs are user-entered and rendered as clickable
 * links and image sources. The API now refuses anything but http(s), but
 * rows saved before that check (or edited directly in the database) could
 * still hold a `javascript:` / `data:` URL, so links are filtered here too.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // A photo kept on this server: the API hands out a same-origin signed
  // link, and only that exact shape is accepted (security finding S-21).
  if (/^\/api\/photo-files\/\d+\?u=\d+&exp=\d+&sig=[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}
