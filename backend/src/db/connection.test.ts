import { describe, expect, it } from 'vitest';
import { buildSslOption, resolveSslMode, sslModeFromUrl, stripTlsParams } from './connection.js';

describe('database TLS (S-10)', () => {
  it('derives the mode from the URL when DB_SSL is unset', () => {
    expect(sslModeFromUrl('postgres://app@db.example/x?sslmode=require')).toBe('verify');
    expect(sslModeFromUrl('postgres://app@db.example/x?sslmode=verify-full')).toBe('verify');
    expect(sslModeFromUrl('postgres://app@db.example/x?sslmode=no-verify')).toBe('no-verify');
    expect(sslModeFromUrl('postgres://app@db.example/x?ssl=true')).toBe('verify');
    expect(sslModeFromUrl('postgres://app@localhost:5432/x')).toBe('off');
    expect(sslModeFromUrl('postgres://app@localhost/x?sslmode=disable')).toBe('off');
  });

  it('DB_SSL wins over the URL', () => {
    expect(resolveSslMode({ DB_SSL: 'off', DATABASE_URL: 'postgres://h/x?sslmode=require' })).toBe('off');
    expect(resolveSslMode({ DB_SSL: 'verify', DATABASE_URL: 'postgres://localhost/x' })).toBe('verify');
    expect(resolveSslMode({ DB_SSL: undefined, DATABASE_URL: 'postgres://h/x?sslmode=require' })).toBe('verify');
  });

  it('"verify" really verifies the certificate (and host name)', () => {
    expect(buildSslOption('verify', undefined)).toEqual({ rejectUnauthorized: true });
    expect(buildSslOption('verify', '/etc/ssl/gov-ca.pem', () => 'PEM-DATA')).toEqual({
      rejectUnauthorized: true,
      ca: 'PEM-DATA',
    });
    expect(buildSslOption('off', undefined)).toBe(false);
    expect(buildSslOption('no-verify', undefined)).toEqual({ rejectUnauthorized: false });
  });

  it('removes TLS parameters from the URL so the driver cannot override the decision', () => {
    expect(stripTlsParams('postgres://app@h/db?sslmode=require&channel_binding=require')).toBe(
      'postgres://app@h/db?channel_binding=require',
    );
    expect(stripTlsParams('postgres://app@h/db?sslmode=no-verify&uselibpqcompat=true')).toBe('postgres://app@h/db');
    expect(stripTlsParams('postgres://app@h/db')).toBe('postgres://app@h/db');
    expect(stripTlsParams('postgres://app@h/db?application_name=api')).toBe('postgres://app@h/db?application_name=api');
  });
});
