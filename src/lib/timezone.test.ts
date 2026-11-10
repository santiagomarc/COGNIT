import { describe, expect, it } from 'vitest';

import { dayKeyDiff, localDayKey, parseTimeZone, shiftDayKey } from './timezone';

describe('localDayKey', () => {
  // 23:30 UTC on 1 Oct is already 2 Oct in Manila (UTC+8) and still 1 Oct in New York (UTC-4).
  const instant = new Date('2026-10-01T23:30:00Z');

  it('cuts the day at the user\'s midnight, not UTC\'s', () => {
    expect(localDayKey(instant, 'Asia/Manila')).toBe('2026-10-02');
    expect(localDayKey(instant, 'America/New_York')).toBe('2026-10-01');
    expect(localDayKey(instant, 'UTC')).toBe('2026-10-01');
  });
});

describe('parseTimeZone', () => {
  it('keeps a real zone', () => {
    expect(parseTimeZone('Asia/Manila')).toBe('Asia/Manila');
  });

  it('falls back to UTC for a missing, unknown or oversized value', () => {
    expect(parseTimeZone(undefined)).toBe('UTC');
    expect(parseTimeZone('')).toBe('UTC');
    expect(parseTimeZone('Mars/Olympus')).toBe('UTC');
    expect(parseTimeZone('A'.repeat(65))).toBe('UTC');
  });
});

describe('day keys', () => {
  it('shifts across month and year ends', () => {
    expect(shiftDayKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDayKey('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('counts whole days between keys', () => {
    expect(dayKeyDiff('2026-10-05', '2026-10-01')).toBe(4);
    expect(dayKeyDiff('2026-10-01', '2026-10-05')).toBe(-4);
  });
});
