import { describe, expect, it } from 'vitest';
import { hasBalancedMath, hasRichText, parseRichText } from './rich-text';

describe('parseRichText', () => {
  it('leaves prices alone', () => {
    expect(parseRichText('It costs $5 and $10 today.')).toEqual([{ kind: 'text', value: 'It costs $5 and $10 today.' }]);
  });

  it('parses inline math', () => {
    expect(parseRichText('Energy: $E=mc^2$ holds.')).toEqual([
      { kind: 'text', value: 'Energy: ' },
      { kind: 'math', value: 'E=mc^2', display: false },
      { kind: 'text', value: ' holds.' },
    ]);
  });

  it('parses display math and trims it', () => {
    expect(parseRichText('$$ \\int_0^1 x\\,dx $$')).toEqual([{ kind: 'math', value: '\\int_0^1 x\\,dx', display: true }]);
  });

  it('parses inline code and fenced code with a language', () => {
    expect(parseRichText('Use `map` here.')).toEqual([
      { kind: 'text', value: 'Use ' },
      { kind: 'code', value: 'map', lang: null, block: false },
      { kind: 'text', value: ' here.' },
    ]);
    expect(parseRichText('```ts\nconst x = 1;\n```')).toEqual([
      { kind: 'code', value: 'const x = 1;', lang: 'ts', block: true },
    ]);
  });

  it('does not treat a lone or spaced dollar sign as math', () => {
    expect(parseRichText('a $ b $ c')).toEqual([{ kind: 'text', value: 'a $ b $ c' }]);
    expect(parseRichText('the $x$y case')).toEqual([{ kind: 'text', value: 'the $x$y case' }]);
  });

  it('keeps a dollar sign inside code literal', () => {
    expect(parseRichText('`$HOME` and $x$')).toEqual([
      { kind: 'code', value: '$HOME', lang: null, block: false },
      { kind: 'text', value: ' and ' },
      { kind: 'math', value: 'x', display: false },
    ]);
  });

  it('returns one text segment for plain text', () => {
    expect(parseRichText('Mitosis')).toEqual([{ kind: 'text', value: 'Mitosis' }]);
  });
});

describe('hasRichText', () => {
  it('gates on the two delimiter characters only', () => {
    expect(hasRichText('plain')).toBe(false);
    expect(hasRichText('$x$')).toBe(true);
    expect(hasRichText('`x`')).toBe(true);
  });
});

describe('hasBalancedMath', () => {
  it('accepts balanced pairs, prices and escaped signs', () => {
    expect(hasBalancedMath('$E=mc^2$ costs $5, \\$ literal')).toBe(true);
    expect(hasBalancedMath('plain')).toBe(true);
  });

  it('rejects a stray delimiter the renderer would print raw', () => {
    expect(hasBalancedMath('$E=mc^2 is famous')).toBe(false);
  });
});
