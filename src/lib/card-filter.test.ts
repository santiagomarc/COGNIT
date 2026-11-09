import { describe, expect, it } from 'vitest';

import { cardFilterPattern } from './card-filter';

describe('cardFilterPattern', () => {
  it('wraps the trimmed query for ILIKE', () => {
    expect(cardFilterPattern('  mitochondria ')).toBe('%mitochondria%');
  });

  it('waits for two characters', () => {
    expect(cardFilterPattern('')).toBeNull();
    expect(cardFilterPattern('a')).toBeNull();
    expect(cardFilterPattern('ab')).toBe('%ab%');
  });

  it('strips what PostgREST reads as syntax, so a query cannot add a filter', () => {
    expect(cardFilterPattern('a,id.eq.1')).toBe('%a id.eq.1%');
    expect(cardFilterPattern('x),back.ilike.(y')).toBe('%x back.ilike. y%');
    expect(cardFilterPattern('say "hi"')).toBe('%say hi%');
  });

  it('strips LIKE wildcards, so a query is plain text', () => {
    expect(cardFilterPattern('100%')).toBe('%100%');
    expect(cardFilterPattern('a_b')).toBe('%a b%');
    expect(cardFilterPattern('%%')).toBeNull();
  });
});
