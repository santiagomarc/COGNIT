import { describe, expect, it } from 'vitest';
import { guardAction } from './action-guard';
import { formatActionError } from './ai-feedback';

describe('guardAction', () => {
  it('passes a plain string error through unchanged', async () => {
    const result = await guardAction('Deck chat', async () => ({ error: 'Deck not found.' }));
    expect(result).toEqual({ error: 'Deck not found.', success: false });
  });

  it('keeps Zod fieldErrors structured so formatActionError can flatten them', async () => {
    // Regression for D3: stringifying here showed the user raw JSON, e.g.
    // {"message":["Message is too short"]}
    const result = await guardAction('Deck chat', async () => ({
      error: { message: ['Message is too short'] },
    }));

    const shown = formatActionError((result as { error: unknown }).error, 'fallback');
    expect(shown).toBe('Message is too short');
    expect(shown).not.toContain('{');
  });

  it('flattens multi-field validation errors into readable copy', async () => {
    const result = await guardAction('Card generation', async () => ({
      error: { deck_id: ['Invalid deck id'], count: ['Too small'] },
    }));

    expect(formatActionError((result as { error: unknown }).error, 'fallback'))
      .toBe('Invalid deck id, Too small');
  });

  it('does not leak an unrecognised error shape to the user', async () => {
    const result = await guardAction('Search', async () => ({
      error: { nested: { secret: 'internal detail' } },
    }));

    const shown = formatActionError((result as { error: unknown }).error, 'fallback');
    expect(shown).not.toContain('internal detail');
    expect(shown).toContain('Search');
  });

  it('converts a thrown rate-limit error into friendly copy', async () => {
    const result = await guardAction('Deck chat', async () => {
      throw new Error('429 quota exceeded');
    });
    expect(result).toEqual({
      error: expect.stringContaining('heavy demand'),
      success: false,
    });
  });

  it('passes a success payload through untouched', async () => {
    await expect(guardAction('X', async () => ({ success: true as const, value: 1 })))
      .resolves.toEqual({ success: true, value: 1 });
  });
});
