import { describe, expect, it, vi } from 'vitest';
import { AiServiceError, classifyAiError, withGeminiRetry } from './ai-retry';
import { guardAction } from './action-guard';

describe('classifyAiError', () => {
  it.each([
    ['[429] Too Many Requests', 'rate_limited'],
    ['Resource has been exhausted (quota)', 'rate_limited'],
    ['503 Service Unavailable', 'unavailable'],
    ['Deadline exceeded', 'timeout'],
    ['API key not valid', 'unauthenticated'],
    ['400 Invalid argument', 'bad_request'],
  ])('classifies %s as %s', (message, expected) => {
    expect(classifyAiError(new Error(message))).toBe(expected);
  });

  it('classifies JSON parse failures as malformed_output', () => {
    expect(classifyAiError(new SyntaxError('Unexpected token'))).toBe('malformed_output');
  });
});

describe('withGeminiRetry', () => {
  it('retries retryable failures and succeeds', async () => {
    const op = vi.fn()
      .mockRejectedValueOnce(new Error('503 unavailable'))
      .mockResolvedValueOnce('ok');
    await expect(withGeminiRetry(op, { label: 't', baseDelayMs: 1 })).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable failures', async () => {
    const op = vi.fn().mockRejectedValue(new Error('API key not valid'));
    await expect(withGeminiRetry(op, { label: 't', baseDelayMs: 1 }))
      .rejects.toBeInstanceOf(AiServiceError);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts', async () => {
    const op = vi.fn().mockRejectedValue(new Error('429'));
    await expect(withGeminiRetry(op, { label: 't', maxAttempts: 3, baseDelayMs: 1 }))
      .rejects.toMatchObject({ kind: 'rate_limited', attempts: 3 });
    expect(op).toHaveBeenCalledTimes(3);
  });
});

describe('guardAction', () => {
  it('converts a throw into an error result', async () => {
    const result = await guardAction('Deck chat', async () => { throw new Error('429 quota'); });
    expect(result).toEqual({ error: expect.stringContaining('heavy demand'), success: false });
  });

  it('passes success through untouched', async () => {
    await expect(guardAction('X', async () => ({ success: true as const })))
      .resolves.toEqual({ success: true });
  });
});
