import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../env.js';

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

/**
 * Classify a body-parser failure.
 *
 * body-parser sets `type` (e.g. 'entity.parse.failed', 'entity.too.large')
 * and an HTTP `status`/`statusCode` on the errors it throws. We key off
 * `type` and fall back to the numeric status so a body-parser error can
 * never be mistaken for an internal fault. Messages are deliberately
 * generic: the raw text can echo a fragment of the offending payload.
 */
function asBodyParserError(
  err: unknown,
): { status: number; code: string; message: string } | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { type?: unknown; status?: unknown; statusCode?: unknown };
  if (typeof e.type !== 'string') return null;

  switch (e.type) {
    case 'entity.parse.failed':
      return { status: 400, code: 'BAD_JSON', message: 'Request body is not valid JSON' };
    case 'entity.too.large':
      return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
    case 'encoding.unsupported':
      return { status: 415, code: 'UNSUPPORTED_ENCODING', message: 'Unsupported content encoding' };
    case 'charset.unsupported':
      return { status: 415, code: 'UNSUPPORTED_CHARSET', message: 'Unsupported charset' };
    default:
      break;
  }

  // Any other body-parser-shaped error with a 4xx status is still a client
  // error — pass the status through rather than relabelling it a 500.
  const status = typeof e.status === 'number' ? e.status : e.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { status, code: 'BAD_REQUEST', message: 'Request could not be processed' };
  }
  return null;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload failed validation',
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  // CORS rejection surfaces as a plain Error from the cors middleware.
  if (message.startsWith('Origin ') && message.endsWith(' is not allowed by CORS')) {
    res.status(403).json({ error: { code: 'CORS_FORBIDDEN', message } });
    return;
  }

  // body-parser (express.json / express.urlencoded) rejects malformed or
  // oversized bodies by throwing a tagged Error carrying its own `status`
  // and `type`. These are CLIENT errors, but without this branch they fell
  // through to the 500 below — so a truncated request body reported itself
  // as an internal server failure. That misleads callers (5xx reads as
  // "retry me", and a malformed body will fail identically forever) and
  // buries real server faults in monitoring.
  const parseError = asBodyParserError(err);
  if (parseError) {
    res.status(parseError.status).json({
      error: { code: parseError.code, message: parseError.message },
    });
    return;
  }

  const payload: Record<string, unknown> = {
    code: 'INTERNAL_ERROR',
    message: isProduction ? 'Internal server error' : message,
  };
  if (!isProduction && err instanceof Error && err.stack) {
    payload.stack = err.stack;
  }

  res.status(500).json({ error: payload });
};
