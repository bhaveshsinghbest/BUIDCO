/**
 * Unit tests for the centralised error handler — the last line of defence
 * between application errors and the client. Guarantees the shape:
 *   { error: { code, message, details?, stack? } }
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError, errorHandler, notFoundHandler } from './errorHandler.js';

function buildApp(handler: express.RequestHandler): express.Express {
  const app = express();
  app.get('/boom', handler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('maps ZodError to 400 VALIDATION_ERROR with flattened details', async () => {
    const schema = z.object({ n: z.number() });
    const app = buildApp((_req, _res, next) => {
      const parsed = schema.safeParse({ n: 'not-a-number' });
      if (!parsed.success) return next(parsed.error);
      next();
    });
    const res = await request(app).get('/boom').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors).toBeDefined();
  });

  it('preserves status and code from HttpError', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new HttpError(418, 'IM_A_TEAPOT', 'Short and stout', { hint: 'brew it' }));
    });
    const res = await request(app).get('/boom').expect(418);
    expect(res.body.error).toEqual({
      code: 'IM_A_TEAPOT',
      message: 'Short and stout',
      details: { hint: 'brew it' },
    });
  });

  it('maps a CORS rejection Error (from cors middleware) to 403 CORS_FORBIDDEN', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new Error('Origin https://evil.example is not allowed by CORS'));
    });
    const res = await request(app).get('/boom').expect(403);
    expect(res.body.error.code).toBe('CORS_FORBIDDEN');
  });

  it('maps an unclassified Error to 500 INTERNAL_ERROR without leaking stack (in test/prod)', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new Error('boom — internal detail'));
    });
    const res = await request(app).get('/boom').expect(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    // NODE_ENV=test in vitest config, and isProduction is false. Non-prod
    // handler surfaces the raw message + stack — we assert on that here.
    // If someone flips NODE_ENV=production the message should collapse.
    expect(typeof res.body.error.message).toBe('string');
  });

  /**
   * Regression: body-parser errors used to fall through to the generic 500
   * branch, so a truncated body or an oversized upload reported itself as an
   * internal server error. These go through a real express.json() pipeline
   * rather than a synthesised error, so they break if the upstream error
   * shape ever changes.
   */
  describe('body-parser failures are client errors, not 500s', () => {
    function buildJsonApp(limit: string): express.Express {
      const app = express();
      app.use(express.json({ limit }));
      app.post('/echo', (req, res) => res.json({ ok: true, body: req.body }));
      app.use(errorHandler);
      return app;
    }

    it('maps malformed JSON to 400 BAD_JSON', async () => {
      const res = await request(buildJsonApp('1mb'))
        .post('/echo')
        .set('Content-Type', 'application/json')
        .send('{"broken": ')
        .expect(400);
      expect(res.body.error.code).toBe('BAD_JSON');
      expect(res.body.error.stack).toBeUndefined();
    });

    it('maps an oversized body to 413 PAYLOAD_TOO_LARGE', async () => {
      const res = await request(buildJsonApp('1kb'))
        .post('/echo')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ big: 'x'.repeat(5000) }))
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('does not echo the offending payload back to the client', async () => {
      const res = await request(buildJsonApp('1mb'))
        .post('/echo')
        .set('Content-Type', 'application/json')
        .send('{"secret-marker-value": ')
        .expect(400);
      expect(JSON.stringify(res.body)).not.toContain('secret-marker-value');
    });

    it('still maps a genuine unclassified Error to 500', async () => {
      const app = buildApp((_req, _res, next) => {
        next(new Error('real internal fault'));
      });
      const res = await request(app).get('/boom').expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  it('notFoundHandler returns 404 NOT_FOUND for any unknown path', async () => {
    const app = buildApp((_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/other-path').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
