import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DAILY_AI_CALL_CEILING, aiUsageReading } from './ai-usage';

describe('aiUsageReading', () => {
  it('reads no usage as an empty meter', () => {
    expect(aiUsageReading(null)).toEqual({
      used: 0,
      ceiling: DAILY_AI_CALL_CEILING,
      remaining: DAILY_AI_CALL_CEILING,
      fraction: 0,
      atLimit: false,
      nextFreesAt: null,
    });
  });

  it('computes the meter and when the oldest call leaves the window', () => {
    const reading = aiUsageReading({ calls_used: 38, oldest_call_at: '2026-10-01T08:00:00Z' });
    expect(reading.remaining).toBe(262);
    expect(reading.fraction).toBeCloseTo(38 / 300);
    expect(reading.nextFreesAt?.toISOString()).toBe('2026-10-02T08:00:00.000Z');
  });

  it('clamps at the ceiling and survives junk', () => {
    expect(aiUsageReading({ calls_used: 340, oldest_call_at: null })).toMatchObject({ fraction: 1, remaining: 0, atLimit: true });
    expect(aiUsageReading({ calls_used: -5, oldest_call_at: 'not a date' })).toMatchObject({ used: 0, nextFreesAt: null });
  });
});

describe('one ceiling', () => {
  it('is the number the reservation passes to reserve_ai_call', () => {
    const shared = readFileSync(path.resolve(__dirname, '../app/actions/_shared.ts'), 'utf8');
    expect(shared).toMatch(/import \{[^}]*DAILY_AI_CALL_CEILING[^}]*\} from '@\/lib\/ai-usage'/);
    expect(shared).not.toMatch(/const DAILY_AI_CALL_CEILING/);
  });
});
