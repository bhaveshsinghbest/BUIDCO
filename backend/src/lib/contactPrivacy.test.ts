import { describe, expect, it } from 'vitest';
import { canSeeContactDetails, maskContactValue } from './contactPrivacy.js';

const md = { userId: 1, role: 'MD' as const };
const admin = { userId: 2, role: 'Admin' as const };
const pd = { userId: 3, role: 'PD' as const };
const viewer = { userId: 4, role: 'Viewer' as const };

describe('canSeeContactDetails (S-31)', () => {
  it('MD sees everyone', () => {
    for (const subject of [admin, pd, viewer, { userId: 9, role: 'MD' as const }]) {
      expect(canSeeContactDetails(md, subject)).toBe(true);
    }
  });

  it('Admin sees only the accounts an Admin administers (PD, Viewer)', () => {
    expect(canSeeContactDetails(admin, pd)).toBe(true);
    expect(canSeeContactDetails(admin, viewer)).toBe(true);
    expect(canSeeContactDetails(admin, md)).toBe(false);
    expect(canSeeContactDetails(admin, { userId: 8, role: 'Admin' })).toBe(false);
  });

  it('PD and Viewer see nobody else', () => {
    expect(canSeeContactDetails(pd, viewer)).toBe(false);
    expect(canSeeContactDetails(pd, md)).toBe(false);
    expect(canSeeContactDetails(viewer, pd)).toBe(false);
  });

  it('everyone sees their own', () => {
    expect(canSeeContactDetails(pd, pd)).toBe(true);
    expect(canSeeContactDetails(viewer, viewer)).toBe(true);
  });
});

describe('maskContactValue', () => {
  it('masks e-mail and mobile values, leaves empty ones alone', () => {
    expect(maskContactValue('email', 'officer@buidco.in')).toBe('off****@buidco.in');
    expect(maskContactValue('mobileNumber', '9876543210')).toBe('******3210');
    expect(maskContactValue('email', null)).toBeNull();
    expect(maskContactValue('mobileNumber', '')).toBe('');
  });
});
