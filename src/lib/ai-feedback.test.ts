import { describe, expect, it } from 'vitest';
import { formatActionError } from './ai-feedback';

describe('formatActionError', () => {
  it('maps deck chat rate limit errors', () => {
    const message = formatActionError('AI limit reached for chat with deck. Try again in about 60 minutes.', 'fallback');
    expect(message).toContain('Deck chat is temporarily rate-limited');
  });

  it('maps embedding sync rate limit errors', () => {
    const message = formatActionError('AI limit reached for sync embeddings. Try again in about 60 minutes.', 'fallback');
    expect(message).toContain('embedding sync is temporarily limited');
  });

  it('maps mnemonic generation rate limit errors', () => {
    const message = formatActionError('AI limit reached for generate mnemonic. Try again in about 60 minutes.', 'fallback');
    expect(message).toContain('Mnemonic generation is temporarily limited');
  });

  it('joins object field validation errors', () => {
    const message = formatActionError({ message: ['Oops'], deck_id: ['Invalid deck id'] }, 'fallback');
    expect(message).toContain('Oops');
    expect(message).toContain('Invalid deck id');
  });

  it('uses fallback for unknown non-string errors', () => {
    const message = formatActionError(42, 'fallback');
    expect(message).toBe('fallback');
  });
});
