import { describe, expect, it } from 'vitest';
import { MAX_SESSION_CARD_COUNT, parseSessionCardIds } from './study';

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
