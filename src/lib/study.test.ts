import { describe, expect, it } from 'vitest';
import { MAX_SESSION_CARD_COUNT, interleaveNewCards, parseSessionCardIds } from './study';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('parseSessionCardIds', () => {
  it('keeps well-formed ids in order, drops junk and duplicates, and caps the list', () => {
    expect(parseSessionCardIds(undefined)).toEqual([]);
    expect(parseSessionCardIds('')).toEqual([]);
    expect(parseSessionCardIds(`${A}, ${B},not-an-id,${A}`)).toEqual([A, B]);
    expect(parseSessionCardIds([`${B}`, `${A}`])).toEqual([B]);   // first value only, like every other param
    const many = Array.from({ length: MAX_SESSION_CARD_COUNT + 5 }, (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`).join(',');
    expect(parseSessionCardIds(many)).toHaveLength(MAX_SESSION_CARD_COUNT);
  });
});

describe('interleaveNewCards', () => {
  it('places one new card after every N scheduled cards', () => {
    const out = interleaveNewCards(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], ['n1', 'n2'], { every: 3 });
    expect(out).toEqual(['r1', 'r2', 'r3', 'n1', 'r4', 'r5', 'r6', 'n2']);
  });

  it('fills the session with new cards when nothing is scheduled', () => {
    expect(interleaveNewCards([], ['n1', 'n2', 'n3'], { every: 3 })).toEqual(['n1', 'n2', 'n3']);
  });

  it('never drops a scheduled card when new cards run out', () => {
    const out = interleaveNewCards(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'], ['n1'], { every: 3 });
    expect(out).toEqual(['r1', 'r2', 'r3', 'n1', 'r4', 'r5', 'r6', 'r7']);
  });

  it('treats a non-positive stride as one', () => {
    expect(interleaveNewCards(['r1', 'r2'], ['n1', 'n2'], { every: 0 })).toEqual(['r1', 'n1', 'r2', 'n2']);
  });
});
