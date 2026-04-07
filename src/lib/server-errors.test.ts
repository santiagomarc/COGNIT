import { describe, expect, it } from 'vitest';
import { sanitizeAiServiceError, sanitizeDatabaseError } from './server-errors';

describe('sanitizeDatabaseError', () => {
  it('maps unique violations', () => {
    expect(sanitizeDatabaseError({ code: '23505', message: 'duplicate key value' }))
      .toBe('This item already exists.');
  });

  it('maps foreign key violations', () => {
    expect(sanitizeDatabaseError({ code: '23503', message: 'violates foreign key constraint' }))
      .toBe('This action references data that no longer exists.');
  });

  it('maps permission and RLS violations', () => {
    expect(sanitizeDatabaseError({ message: 'permission denied for table cards' }))
      .toBe('You do not have permission to perform this action.');

    expect(sanitizeDatabaseError({ message: 'new row violates row-level security policy' }))
      .toBe('You do not have permission to perform this action.');
  });

  it('maps missing schema/table scenarios', () => {
    expect(sanitizeDatabaseError({ message: 'relation "card_mastery_state" does not exist' }))
      .toBe('This feature is not available yet. Please try again shortly.');

    expect(sanitizeDatabaseError({ message: 'schema cache does not include this table' }))
      .toBe('This feature is not available yet. Please try again shortly.');
  });

  it('uses fallback for unknown errors', () => {
    const fallback = 'Could not complete operation.';
    expect(sanitizeDatabaseError({ code: '99999', message: 'unknown' }, fallback)).toBe(fallback);
    expect(sanitizeDatabaseError(null, fallback)).toBe(fallback);
  });
});

describe('sanitizeAiServiceError', () => {
  it('maps quota and rate-limit errors', () => {
    expect(sanitizeAiServiceError('429 Too Many Requests'))
      .toBe('AI is under heavy demand right now. Please try again in a little while.');

    expect(sanitizeAiServiceError('quota exceeded'))
      .toBe('AI is under heavy demand right now. Please try again in a little while.');
  });

  it('maps credential errors', () => {
    expect(sanitizeAiServiceError('API key invalid'))
      .toBe('AI service is not configured correctly right now. Please try again later.');
  });

  it('maps timeout errors', () => {
    expect(sanitizeAiServiceError('deadline exceeded from provider'))
      .toBe('AI request timed out. Please try again.');
  });

  it('falls back for unknown AI errors', () => {
    const fallback = 'Fallback AI message';
    expect(sanitizeAiServiceError('some random provider error', fallback)).toBe(fallback);
  });
});
