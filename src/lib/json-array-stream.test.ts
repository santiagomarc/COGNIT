import { describe, expect, it } from 'vitest';
import { createJsonArrayStream } from './json-array-stream';

const CARDS = [
  { front: 'Time quantum', back: 'The slice a process runs for. Braces {like this} and [these] stay text.', topic_tags: ['scheduling', 'cpu'], mcq_distractors: ['Page frame', 'Working set', 'Context switch'] },
  { front: 'Escape "test"', back: 'A back slash \\ then a quote \\" inside one string.', topic_tags: ['strings'], mcq_distractors: ['a', 'b', 'c'] },
  { front: 'Thrashing', back: 'Paging so heavy that little work gets done.', topic_tags: [], mcq_distractors: [] },
];
const WIRE = JSON.stringify({ cards: CARDS }, null, 2);

function feed(pieces: string[]) {
  const stream = createJsonArrayStream();
  const out: unknown[] = [];
  const seenAfterPiece: number[] = [];
  for (const piece of pieces) {
    out.push(...stream.push(piece));
    seenAfterPiece.push(out.length);
  }
  return { out, seenAfterPiece };
}

describe('createJsonArrayStream', () => {
  it('returns every element when the document arrives whole', () => {
    expect(feed([WIRE]).out).toEqual(CARDS);
  });

  it('returns the same elements one character at a time', () => {
    expect(feed([...WIRE]).out).toEqual(CARDS);
  });

  it('returns each element as soon as it closes, before the array ends', () => {
    const firstEnd = WIRE.indexOf('}', WIRE.indexOf('"mcq_distractors"')) + 1;
    const { seenAfterPiece } = feed([WIRE.slice(0, firstEnd - 1), WIRE.slice(firstEnd - 1, firstEnd), WIRE.slice(firstEnd)]);
    expect(seenAfterPiece).toEqual([0, 1, 3]);
  });

  it('survives splits inside escapes and strings at every offset', () => {
    for (let cut = 1; cut < WIRE.length; cut += 1) {
      expect(feed([WIRE.slice(0, cut), WIRE.slice(cut)]).out).toEqual(CARDS);
    }
  });

  it('ignores a later array and anything outside the first one', () => {
    const wire = JSON.stringify({ note: '[not this]', cards: [CARDS[0]], extra: [{ front: 'no' }] });
    expect(feed([wire]).out).toEqual([CARDS[0]]);
  });

  it('skips non-object elements and returns nothing for an unfinished object', () => {
    expect(feed(['{"cards":[1,"two",{"front":"A","back":"B"},{"front":"half']).out).toEqual([{ front: 'A', back: 'B' }]);
  });
});
