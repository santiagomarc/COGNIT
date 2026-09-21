import { describe, expect, it } from 'vitest';
import {
  countWords,
  fenceAnswer,
  findQuote,
  locateQuote,
  normaliseForQuote,
  stripKeyIds,
  wordDiff,
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

describe('locateQuote / findQuote', () => {
  const CARD = 'Time quantum — a quantum that is too large degenerates round-robin toward FCFS; too small spends the CPU on context switches.';

  it('returns the verbatim span when the model dropped an article and changed a tense', () => {
    const located = locateQuote('quantum too large degenerate round robin towards FCFS', CARD);
    expect(located).not.toBeNull();
    expect(located?.ratio).toBeGreaterThanOrEqual(0.8);
    // Verbatim from the card, punctuation and case intact.
    expect(located?.text).toBe('quantum that is too large degenerates round-robin toward FCFS');
  });

  it('refuses a quote the text does not contain', () => {
    expect(locateQuote('CFS uses virtual runtime to pick the next task', CARD)).toBeNull();
    expect(locateQuote('switches are free', CARD)).toBeNull();
  });

  it('lets a short quote differ only by number or tense, never by a word', () => {
    expect(locateQuote('context free', CARD)).toBeNull();          // 2 tokens, half wrong
    expect(locateQuote('context switch', CARD)).toEqual({ text: 'context switches', ratio: 1 });
    expect(locateQuote('context switches', CARD)?.ratio).toBe(1);
  });

  it('findQuote prefers the model wording when it is verbatim, else the located span', () => {
    expect(findQuote('too small spends the CPU', CARD)).toBe('too small spends the CPU');
    expect(findQuote('too small spend CPU on context switch', CARD)).toBe('too small spends the CPU on context switches');
    expect(findQuote('the scheduler is preemptive by default', CARD)).toBeNull();
  });
});

describe('stripKeyIds', () => {
  it('removes bracketed and bare link/card keys and tidies the punctuation left behind', () => {
    expect(stripKeyIds('You miss the tuning link (m3).')).toBe('You miss the tuning link.');
    expect(stripKeyIds('Links m1 and m2 are covered; card c2 says otherwise (c1, c3).')).toBe('Links and are covered; card says otherwise.');
    // Keys are lower-case; "vitamin C1" and "xm1" are words, not keys.
    expect(stripKeyIds('The m1 macro and vitamin C1 are unaffected: xm1 stays.')).toBe('The macro and vitamin C1 are unaffected: xm1 stays.');
    expect(stripKeyIds('Ask: what is the quantum just above?')).toBe('Ask: what is the quantum just above?');
  });
});

describe('evidence slot and wordDiff', () => {
  it('counts and renders the evidence slot only when it holds text', () => {
    const outline = { claim: 'A', mechanisms: ['b c', 'd'] as [string, string], tradeoff: 'e', evidence: '  ' };
    expect(countWords(responseText(outline))).toBe(5);
    expect(renderResponseForModel('outline', outline)).not.toContain('Evidence:');
    const withEvidence = { ...outline, evidence: 'Denning 1968' };
    expect(countWords(responseText(withEvidence))).toBe(7);
    expect(renderResponseForModel('outline', withEvidence)).toMatch(/\nEvidence: Denning 1968$/);
  });

  it('diffs a revision word by word', () => {
    const diff = wordDiff('the quantum sets waiting', 'the quantum sets responsiveness and waiting');
    expect(diff).toEqual([
      { text: 'the', kind: 'same' },
      { text: 'quantum', kind: 'same' },
      { text: 'sets', kind: 'same' },
      { text: 'responsiveness', kind: 'added' },
      { text: 'and', kind: 'added' },
      { text: 'waiting', kind: 'same' },
    ]);
    expect(wordDiff('a b', 'b c').map((t) => `${t.kind}:${t.text}`)).toEqual(['removed:a', 'same:b', 'added:c']);
  });
});

describe('plan responses', () => {
  it('counts every field and renders labelled sections for the checker', () => {
    const plan = {
      thesis: 'The quantum decides responsiveness.',
      points: [
        { claim: 'Short quantum helps.', mechanism: 'Fewer full slices to wait behind.', evidence: '', limit: 'Not below a burst.' },
        { claim: '', mechanism: '', evidence: '', limit: '' },
        { claim: 'Switches cost.', mechanism: 'Each is overhead.', evidence: 'Context switch card.', limit: '' },
      ] as [never, never, never],
      conclusion: 'So keep it just above a burst.',
    };
    expect(countWords(responseText(plan))).toBe(32);
    const rendered = renderResponseForModel('plan', plan);
    expect(rendered).toMatch(/^Thesis: The quantum decides responsiveness\.\nPoint 1:\n  Claim: Short quantum helps\./);
    expect(rendered).toMatch(/Point 2:\n  Claim: \(empty\)/);
    expect(rendered).toMatch(/Conclusion: So keep it just above a burst\.$/);
  });
});
