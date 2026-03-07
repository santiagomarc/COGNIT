import { describe, expect, it } from 'vitest';
import { parseDelimitedNotes } from './parser';

describe('parseDelimitedNotes', () => {
  it('parses valid lines with the default delimiter', () => {
    const result = parseDelimitedNotes([
      'Mitochondria - The powerhouse of the cell',
      'Photosynthesis - Turns light into chemical energy',
    ].join('\n'));

    expect(result.cards).toEqual([
      { front: 'Mitochondria', back: 'The powerhouse of the cell', lineNumber: 1 },
      { front: 'Photosynthesis', back: 'Turns light into chemical energy', lineNumber: 2 },
    ]);
    expect(result.flagged).toEqual([]);
  });

  it('skips blank lines and preserves exact inner punctuation', () => {
    const result = parseDelimitedNotes('\nDNA - Stores genetic information.\n\nRNA - Carries messages, sometimes.\n');

    expect(result.cards).toEqual([
      { front: 'DNA', back: 'Stores genetic information.', lineNumber: 2 },
      { front: 'RNA', back: 'Carries messages, sometimes.', lineNumber: 4 },
    ]);
    expect(result.totalLines).toBe(5);
  });

  it('flags lines without the delimiter', () => {
    const result = parseDelimitedNotes('No delimiter here');

    expect(result.cards).toEqual([]);
    expect(result.flagged).toEqual([
      { text: 'No delimiter here', lineNumber: 1, reason: 'no_delimiter' },
    ]);
  });

  it('flags empty front and empty back values', () => {
    const result = parseDelimitedNotes([' - Missing front', 'Missing back - '].join('\n'));

    expect(result.cards).toEqual([]);
    expect(result.flagged).toEqual([
      { text: '- Missing front', lineNumber: 1, reason: 'empty_front' },
      { text: 'Missing back -', lineNumber: 2, reason: 'empty_back' },
    ]);
  });

  it('splits only on the first matching delimiter', () => {
    const result = parseDelimitedNotes('Term - Description - still same card');

    expect(result.cards).toEqual([
      { front: 'Term', back: 'Description - still same card', lineNumber: 1 },
    ]);
  });

  it('supports custom delimiters', () => {
    const result = parseDelimitedNotes('HTTP => Protocol for web requests', ' => ');

    expect(result.cards[0]).toEqual({
      front: 'HTTP',
      back: 'Protocol for web requests',
      lineNumber: 1,
    });
  });
});