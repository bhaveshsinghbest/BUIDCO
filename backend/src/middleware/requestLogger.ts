import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

/**
 * HTTP access log (finding S-11): one `http.request` line per API request,
 * written when the response finishes.
 *
 * Recorded: request id, method, path, status, duration, client IP (as
 * resolved through the configured trust-proxy setting), the signed-in
 * user's id and role when there is one, and the user agent.
 *
 * Never recorded: the query string (search text, signed photo links), the
 * body (passwords, OTPs, form data) or any header other than the user
 * agent (Authorization and Cookie carry credentials).
 *
 * Page loads of the single-page app itself (index.html, JS, CSS) are served
 * by the static web server and appear in its access log; every screen then
 * fetches its data through the API, so this log shows which user opened
 * which record.
 *
 * Successful health checks are skipped: load balancers poll them every few
 * seconds and they would drown everything else.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const path = pathOf(req);
    if (path === '/api/health' && res.statusCode < 400) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info('http.request', {
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      ip: req.ip ?? null,
      userId: req.user?.userId ?? null,
      role: req.user?.role ?? null,
      userAgent: req.get('user-agent')?.slice(0, 200) ?? null,
    });
  });

  next();
};

/** The request path without its query string. */
export function pathOf(req: Request): string {
  const raw = req.originalUrl || req.url;
  const q = raw.indexOf('?');
  return (q === -1 ? raw : raw.slice(0, q)).slice(0, 300);
}
