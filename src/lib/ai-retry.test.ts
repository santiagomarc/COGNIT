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

  it('keeps the kind of an AiServiceError thrown by the operation and does not retry it when non-retryable', async () => {
    const op = vi.fn(async () => {
      throw new AiServiceError('bad_request', 'response truncated at maxOutputTokens', 1);
    });
    await expect(withGeminiRetry(op, { label: 't', maxAttempts: 3 })).rejects.toMatchObject({ kind: 'bad_request' });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('honours shouldRetry to narrow the retryable set', async () => {
    const op = vi.fn(async () => {
      throw new Error('deadline exceeded: timeout');
    });
    await expect(
      withGeminiRetry(op, { label: 't', maxAttempts: 3, shouldRetry: (kind) => kind !== 'timeout' }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts', async () => {
    const op = vi.fn().mockRejectedValue(new Error('429'));
    await expect(withGeminiRetry(op, { label: 't', maxAttempts: 3, baseDelayMs: 1 }))
      .rejects.toMatchObject({ kind: 'rate_limited', attempts: 3 });
    expect(op).toHaveBeenCalledTimes(3);
  });
});

describe('classifyAiError — status and abort first (plan §6.1)', () => {
  const apiError = (status: number) => Object.assign(new Error('{"error":{"message":"…"}}'), { status });

  it('reads a numeric status the way @google/genai ApiError carries it', () => {
    expect(classifyAiError(apiError(429))).toBe('rate_limited');
    expect(classifyAiError(apiError(403))).toBe('unauthenticated');
    expect(classifyAiError(apiError(400))).toBe('bad_request');
    expect(classifyAiError(apiError(504))).toBe('timeout');
    expect(classifyAiError(apiError(503))).toBe('unavailable');
  });

  it('treats spent prepaid credits (402) as a non-retryable config failure', () => {
    expect(classifyAiError(apiError(402))).toBe('unauthenticated');
  });

  it('treats an aborted request as a timeout, so the check still does not retry it', () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    expect(classifyAiError(abort)).toBe('timeout');
  });

  it('never retries once the caller has cancelled', async () => {
    const controller = new AbortController();
    const op = vi.fn(async () => {
      controller.abort();
      throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    });
    await expect(withGeminiRetry(op, { label: 't', maxAttempts: 3, signal: controller.signal }))
      .rejects.toMatchObject({ kind: 'timeout', attempts: 1 });
    expect(op).toHaveBeenCalledTimes(1);
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
