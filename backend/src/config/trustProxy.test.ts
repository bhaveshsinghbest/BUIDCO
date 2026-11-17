import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from './trustProxy.js';

describe('parseTrustProxy (S-22)', () => {
  it('keeps the previous single-hop default when unset', () => {
    expect(parseTrustProxy(undefined)).toBe(1);
    expect(parseTrustProxy('')).toBe(1);
  });

  it('accepts a hop count, with 0 meaning no proxy', () => {
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('0')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('accepts addresses, subnets and keywords', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy(' loopback , 10.0.0.0/8 ')).toBe('loopback, 10.0.0.0/8');
  });

  it('refuses "true" and implausible hop counts', () => {
    expect(() => parseTrustProxy('true')).toThrow(/any client/);
    expect(() => parseTrustProxy('99')).toThrow(/plausible/);
  });

  it('with a named proxy, a direct client cannot spoof X-Forwarded-For', async () => {
    const app = express();
    app.set('trust proxy', parseTrustProxy('10.9.9.9'));
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const res = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.7').expect(200);
    // The test client connects from loopback, which is not the named proxy,
    // so the forged header is ignored.
    expect(res.body.ip).not.toBe('203.0.113.7');
  });

  it('with loopback trusted, the proxy-supplied address is used', async () => {
    const app = express();
    app.set('trust proxy', parseTrustProxy('loopback'));
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const res = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.7').expect(200);
    expect(res.body.ip).toBe('203.0.113.7');
  });
});
