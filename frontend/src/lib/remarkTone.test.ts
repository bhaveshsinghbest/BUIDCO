/**
 * The classifier is pinned against the remarks actually on record, so a
 * future keyword tweak can't silently recolour real projects.
 */
import { describe, expect, it } from 'vitest';
import { remarkStyleOf, remarkToneOf } from './remarkTone';

describe('remarkToneOf — real remarks currently in the database', () => {
  it('treats an explicit all-clear as clear', () => {
    expect(remarkToneOf('No outstanding issues reported.')).toBe('clear');
  });

  it('treats escalations as needing attention', () => {
    expect(
      remarkToneOf(
        'Escalated to Revenue Department (Land Acquisition) for resolution; being tracked under Management Action.',
      ),
    ).toBe('attention');
    expect(
      remarkToneOf(
        'Escalated to District Administration — clearance pending for resolution; being tracked under Management Action.',
      ),
    ).toBe('attention');
    expect(
      remarkToneOf(
        'Escalated to Electricity Board (Utility Shifting) for resolution; being tracked under Management Action.',
      ),
    ).toBe('attention');
  });

  it('treats routine tender wording as in-process, not a warning', () => {
    expect(remarkToneOf('Bid evaluation for Package 6 pending committee sign-off.')).toBe('process');
  });

  it('treats blocking issues as critical', () => {
    expect(
      remarkToneOf(
        'Design consultant has not submitted revised drawings for 3 months despite reminders — blocking resumption of work.',
      ),
    ).toBe('critical');
    expect(
      remarkToneOf(
        'Land encroachment at 3 sites blocking handover — needs district administration intervention.',
      ),
    ).toBe('critical');
  });

  it('flags land acquisition pending clearance as attention', () => {
    expect(
      remarkToneOf('Flood-retention basin land acquisition at Site 2 pending Revenue Department clearance.'),
    ).toBe('attention');
  });

  it('leaves unclassifiable text neutral rather than guessing', () => {
    expect(remarkToneOf('Test')).toBe('neutral');
    expect(remarkToneOf('asdf')).toBe('neutral');
  });

  it('treats empty and absent remarks as neutral', () => {
    expect(remarkToneOf(null)).toBe('neutral');
    expect(remarkToneOf(undefined)).toBe('neutral');
    expect(remarkToneOf('   ')).toBe('neutral');
  });
});

describe('precedence', () => {
  it('critical beats an all-clear phrase in the same sentence', () => {
    expect(remarkToneOf('No outstanding issues, but work is blocked at the site.')).toBe('critical');
  });

  it('escalation beats routine "pending" wording', () => {
    expect(remarkToneOf('Escalated for approval; pending sign-off.')).toBe('attention');
  });

  it('is case-insensitive', () => {
    expect(remarkToneOf('NO OUTSTANDING ISSUES REPORTED.')).toBe('clear');
    expect(remarkToneOf('WORK IS BLOCKED')).toBe('critical');
  });
});

describe('remarkStyleOf', () => {
  it('pairs every tone with a glyph so colour is not the only signal', () => {
    for (const r of [
      'No outstanding issues reported.',
      'Escalated to Revenue Department for resolution.',
      'Bid evaluation pending committee sign-off.',
      'Work blocked on site.',
      'Test',
    ]) {
      const style = remarkStyleOf(r);
      expect(style.icon).toBeTruthy();
      expect(style.label).toBeTruthy();
      expect(style.chip).toContain('border-');
    }
  });
});
