import { describe, expect, it } from 'vitest';
import { addUsage, finishReasonOf } from './ai-outcome';

describe('addUsage', () => {
  it('starts from zero and adds every token count across calls', () => {
    const first = addUsage(null, { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 5 } });
    const both = addUsage(first, { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 } });
    expect(first).toEqual({ input: 100, output: 40, thoughts: 5 });
    expect(both).toEqual({ input: 110, output: 44, thoughts: 5 });
  });

  it('treats a response without usage metadata as zero', () => {
    expect(addUsage(null, {})).toEqual({ input: 0, output: 0, thoughts: 0 });
  });
});

describe('finishReasonOf', () => {
  it('reads the first candidate, or null', () => {
    expect(finishReasonOf({ candidates: [{ finishReason: 'MAX_TOKENS' as never }] })).toBe('MAX_TOKENS');
    expect(finishReasonOf({})).toBeNull();
  });
});
