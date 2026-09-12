import { describe, expect, it } from 'vitest';
import {
  countWords,
  fenceAnswer,
  normaliseForQuote,
  renderResponseForModel,
  responseText,
  stripRedactions,
  verifyQuote,
} from './text';

describe('countWords', () => {
  it('counts whitespace-separated tokens, ignoring runs of spaces and newlines', () => {
    expect(countWords('  the   quantum\n\nconstrains responsiveness ')).toBe(4);
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('treats hyphenated and non-Latin words as single words', () => {
    expect(countWords('round-robin schedulers 時間 quantum')).toBe(4);
  });
});

describe('responseText / renderResponseForModel', () => {
  const outline = { claim: 'Claim here', mechanisms: ['First mech', ''] as [string, string], tradeoff: 'Limit' };

  it('joins only the non-empty outline slots for counting', () => {
    expect(responseText(outline)).toBe('Claim here\nFirst mech\nLimit');
    expect(countWords(responseText(outline))).toBe(5);
  });

  it('renders fixed labels for the model so quotes stay verbatim, marking empty slots', () => {
    expect(renderResponseForModel('outline', outline)).toBe(
      'Claim: Claim here\nMechanism 1: First mech\nMechanism 2: (empty)\nTrade-off: Limit',
    );
    expect(renderResponseForModel('free', { text: '  free text  ' })).toBe('free text');
  });
});

describe('fenceAnswer', () => {
  it('wraps the answer in fences that carry the nonce twice', () => {
    const fenced = fenceAnswer('hello', 'ab12cd34');
    expect(fenced).toBe('<<<ANSWER ab12cd34>>>\nhello\n<<<END ANSWER ab12cd34>>>');
    expect(fenced.match(/ab12cd34/g)).toHaveLength(2);
  });
});

describe('normaliseForQuote / verifyQuote', () => {
  it('straightens curly quotes and dashes and drops punctuation and case', () => {
    expect(normaliseForQuote('“Round-Robin’s” — quantum!')).toBe('round robin s quantum');
  });

  it('finds a quote regardless of casing, punctuation and whitespace', () => {
    const essay = 'A short quantum means the CPU switches constantly, and each switch is overhead.';
    expect(verifyQuote('each switch is overhead', essay)).toBe(true);
    expect(verifyQuote('EACH   switch is "overhead"', essay)).toBe(true);
  });

  it('rejects quotes that are absent, empty, or too short to mean anything', () => {
    const essay = 'A short quantum means more switches.';
    expect(verifyQuote('the convoy effect', essay)).toBe(false);
    expect(verifyQuote(null, essay)).toBe(false);
    expect(verifyQuote('a short', essay)).toBe(false); // 7 chars after normalisation
  });
});

describe('stripRedactions', () => {
  it('removes sanitiser artefacts and collapses the gap they leave', () => {
    expect(stripRedactions('the OS must [redacted] the instruction')).toBe('the OS must the instruction');
    expect(stripRedactions('[REDACTED] leading')).toBe('leading');
  });
});
