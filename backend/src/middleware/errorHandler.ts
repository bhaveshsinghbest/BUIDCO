import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../env.js';
import { describeError, logger } from '../lib/logger.js';
import { pathOf } from './requestLogger.js';

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

/**
 * Classify a Postgres error that was caused by the client's input.
 *
 * Request schemas catch almost everything, but a few faults are only
 * detectable by the database: a district/scheme id that doesn't exist
 * (FK), a duplicate unique value, a CHECK constraint, a value past the
 * column's precision. Those reported themselves as HTTP 500 "internal"
 * failures — misleading for callers (5xx reads as "retry me") and noise in
 * monitoring. Anything not listed here stays a 500. Messages are generic so
 * no schema details leak.
 */
function asPgClientError(
  err: unknown,
): { status: number; code: string; message: string } | null {
  const candidates = [err, (err as { cause?: unknown } | null)?.cause];
  for (const c of candidates) {
    if (typeof c !== 'object' || c === null) continue;
    const code = (c as { code?: unknown }).code;
    if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) continue;
    switch (code) {
      case '23503':
        return {
          status: 400,
          code: 'INVALID_REFERENCE',
          message: 'The request refers to a record that does not exist, or the record is still in use',
        };
      case '23505':
        return { status: 409, code: 'CONFLICT', message: 'A record with the same unique value already exists' };
      case '23514':
        return { status: 400, code: 'CONSTRAINT_VIOLATION', message: 'A value is outside its allowed range' };
      case '22003':
        return { status: 400, code: 'VALUE_OUT_OF_RANGE', message: 'A numeric value is out of range' };
      case '22007':
      case '22008':
        return { status: 400, code: 'INVALID_DATE', message: 'A date value is not a valid calendar date' };
      case '22001':
        return { status: 400, code: 'VALUE_TOO_LONG', message: 'A text value is too long' };
      case '22P02':
        return { status: 400, code: 'INVALID_VALUE', message: 'A value has the wrong format' };
      default:
        return null;
    }
  }
  return null;
}

/**
 * Server-side record of an unexpected (HTTP 500) failure.
 *
 * Before this, an internal error was answered with a generic message and
 * then discarded — nothing reached the server logs, so a production fault
 * left no trace for operators or auditors. The stack goes to the error log
 * (with server paths made relative, see lib/logger.ts) and never to the
 * client in production. Only the method and path are logged: the query
 * string and body can carry search terms or form data.
 */
function logInternalError(err: unknown, method: string, path: string, requestId: unknown): void {
  logger.error('http.unhandled_error', {
    requestId: typeof requestId === 'string' ? requestId : null,
    method,
    path,
    ...describeError(err),
  });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
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

  const pgError = asPgClientError(err);
  if (pgError) {
    res.status(pgError.status).json({
      error: { code: pgError.code, message: pgError.message },
    });
    return;
  }

  logInternalError(err, req.method, pathOf(req), res.locals.requestId);

  const payload: Record<string, unknown> = {
    code: 'INTERNAL_ERROR',
    message: isProduction ? 'Internal server error' : message,
  };
  if (!isProduction && err instanceof Error && err.stack) {
    payload.stack = err.stack;
  }

  res.status(500).json({ error: payload });
};
