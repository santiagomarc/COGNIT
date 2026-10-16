import { describe, expect, it } from 'vitest';
import { maskTerm, quizPrompt } from './study-prompt';

describe('maskTerm', () => {
  it('blanks a one-word term in any case', () => {
    expect(maskTerm('Photosynthesis turns light into sugar; photosynthesis needs chlorophyll.', 'Photosynthesis'))
      .toBe('____ turns light into sugar; ____ needs chlorophyll.');
  });

  it('blanks a multi-word term, even across extra spaces', () => {
    expect(maskTerm('The Calvin  cycle runs in the stroma.', 'Calvin cycle')).toBe('The ____ runs in the stroma.');
  });

  it('blanks a simple plural and a term next to punctuation', () => {
    expect(maskTerm('Enzymes speed reactions (an enzyme is a catalyst).', 'Enzyme'))
      .toBe('____ speed reactions (an ____ is a catalyst).');
  });

  it('leaves longer words that merely contain the term', () => {
    expect(maskTerm('A cellular process.', 'Cell')).toBe('A cellular process.');
  });

  it('escapes regex characters in the term', () => {
    expect(maskTerm('C++ adds classes to C.', 'C++')).toBe('____ adds classes to C.');
  });

  it('leaves text without the term untouched', () => {
    expect(maskTerm('The powerhouse of the cell.', 'Mitochondria')).toBe('The powerhouse of the cell.');
  });
});

describe('quizPrompt', () => {
  it('prefers a stored AI question and masks the description otherwise', () => {
    expect(quizPrompt({ front: 'Osmosis', back: 'Osmosis moves water.', id_question: 'What moves water?' })).toBe('What moves water?');
    expect(quizPrompt({ front: 'Osmosis', back: 'Osmosis moves water.', id_question: null })).toBe('____ moves water.');
  });
});
