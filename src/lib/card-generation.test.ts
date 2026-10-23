import { describe, expect, it } from 'vitest';
import {
  createCardPicker,
  isEnumerationLike,
  isValidTermFront,
  parseGeneratedCard,
  pickBalancedCards,
  scoreCandidateCard,
  sectionCap,
  sectionRequestSize,
  STREAM_ACCEPT_MIN_SCORE,
  type CandidateCard,
} from './card-generation';

describe('isValidTermFront', () => {
  it.each([
    ['Photosynthesis', true],
    ['Krebs cycle', true],
    ['Adenosine triphosphate', true],
    ['What is photosynthesis?', false],          // question form
    ['Define entropy', false],                   // imperative
    ['The mitochondrion is the powerhouse of the cell', false],  // full sentence
    ['3.', false],                               // numbering artifact
    ['Photosynthesis:', false],                  // trailing punctuation
  ])('%s → %s', (front, expected) => {
    expect(isValidTermFront(front)).toBe(expected);
  });

  it('rejects a front that exceeds the hard word limit', () => {
    expect(isValidTermFront('one two three four five six seven')).toBe(false);
  });
});

describe('isEnumerationLike', () => {
  it('rejects numbered lists', () => {
    expect(isEnumerationLike('1. First step 2. Second step')).toBe(true);
  });

  it('rejects bulleted text', () => {
    expect(isEnumerationLike('- a bullet point')).toBe(true);
  });

  it('accepts prose definitions', () => {
    expect(isEnumerationLike('A process that converts light into chemical energy.')).toBe(false);
  });

  it('accepts a repeated ordinal inside a compound term', () => {
    // "first-in-first-out" repeats one ordinal; it is a term, not a list.
    // Counting raw hits rejected every queue/FIFO card in a CS deck.
    expect(isEnumerationLike('A first-in-first-out collection of elements.')).toBe(false);
    expect(isEnumerationLike('A last-in-first-out collection of elements.')).toBe(false);
  });

  it('still rejects two DISTINCT ordinals', () => {
    expect(isEnumerationLike('First you initialise it, second you traverse it.')).toBe(true);
  });
});

describe('scoreCandidateCard', () => {
  it('prefers a short term that appears verbatim in the source', () => {
    const source = 'photosynthesis is the process by which plants convert light.';
    const strong = scoreCandidateCard(
      { front: 'Photosynthesis', back: 'The process by which plants convert light into energy.' },
      source,
    );
    const weak = scoreCandidateCard(
      { front: 'Some unrelated multi word phrase', back: 'Short.' },
      source,
    );
    expect(strong).toBeGreaterThan(weak);
  });

  it('penalises enumerated backs', () => {
    const source = 'steps of the process';
    const prose = scoreCandidateCard(
      { front: 'Glycolysis', back: 'A pathway that breaks down glucose into pyruvate.' },
      source,
    );
    const listy = scoreCandidateCard(
      { front: 'Glycolysis', back: '1. First 2. Second 3. Third' },
      source,
    );
    expect(prose).toBeGreaterThan(listy);
  });
});

describe('pickBalancedCards', () => {
  const card = (
    front: string,
    score: number,
    difficulty: CandidateCard['difficulty'],
  ): CandidateCard => ({ front, back: 'definition text', score, difficulty, topicTags: [], distractors: [] });

  it('returns everything when the pool is already small enough', () => {
    const pool = [card('A', 10, 'foundational'), card('B', 9, 'advanced')];
    expect(pickBalancedCards(pool, 5)).toHaveLength(2);
  });

  it('never exceeds maxCount', () => {
    const pool = Array.from({ length: 40 }, (_, i) => card(`F${i}`, 40 - i, 'foundational'));
    expect(pickBalancedCards(pool, 10)).toHaveLength(10);
  });

  it('keeps the highest-scoring advanced card when other bands over-fill', () => {
    // Regression for R-12: the old implementation pushed foundational →
    // intermediate → advanced then truncated, so the best advanced cards were
    // the first thing discarded.
    const pool = [
      card('TopAdvanced', 100, 'advanced'),
      ...Array.from({ length: 20 }, (_, i) => card(`F${i}`, 10 - i * 0.1, 'foundational')),
    ];
    expect(pickBalancedCards(pool, 5).map((c) => c.front)).toContain('TopAdvanced');
  });

  it('produces no duplicate fronts', () => {
    const pool = [
      card('Same', 10, 'foundational'),
      card('same', 9, 'intermediate'),
      card('Other', 8, 'advanced'),
    ];
    const fronts = pickBalancedCards(pool, 2).map((c) => c.front.toLowerCase());
    expect(new Set(fronts).size).toBe(fronts.length);
  });
});

const SOURCE = 'a context switch saves the state of one process and loads another. thrashing is paging so heavy that little work gets done. the working set is the pages a process needs now.';

describe('parseGeneratedCard', () => {
  it('keeps a valid card with its cleaned tags and three usable distractors', () => {
    const card = parseGeneratedCard({
      front: ' "Context switch" ',
      back: 'Saving the state of one process and loading another.',
      topic_tags: ['  Scheduling ', 'scheduling', 'CPU', 'x', 'process state', 'kernel'],
      mcq_distractors: ['Page fault', 'Working set', 'Thrashing'],
    }, SOURCE);
    expect(card).toMatchObject({
      front: 'Context switch',
      topicTags: ['scheduling', 'cpu', 'process state', 'kernel'],
      distractors: ['Page fault', 'Working set', 'Thrashing'],
    });
    expect(card!.score).toBeGreaterThanOrEqual(STREAM_ACCEPT_MIN_SCORE);
  });

  it('keeps the card but drops distractors that repeat the answer', () => {
    const card = parseGeneratedCard({
      front: 'Thrashing',
      back: 'Paging so heavy that little work gets done.',
      topic_tags: ['memory'],
      mcq_distractors: ['thrashing', 'Working set', 'Page fault'],
    }, SOURCE);
    expect(card?.distractors).toEqual([]);
    expect(card?.topicTags).toEqual(['memory']);
  });

  it('rejects question fronts, short backs and lists', () => {
    expect(parseGeneratedCard({ front: 'What is thrashing?', back: 'Paging so heavy that little work gets done.' }, SOURCE)).toBeNull();
    expect(parseGeneratedCard({ front: 'Thrashing', back: 'Paging.' }, SOURCE)).toBeNull();
    expect(parseGeneratedCard({ front: 'Steps', back: '1. Save state 2. Load state 3. Resume' }, SOURCE)).toBeNull();
    expect(parseGeneratedCard('not an object', SOURCE)).toBeNull();
  });
});

describe('sectionCap and sectionRequestSize', () => {
  it('shares what is left of the request across the sections left', () => {
    expect(sectionCap(30, 0, 1)).toBe(30);
    expect(sectionCap(10, 0, 4)).toBe(3);
    expect(sectionCap(10, 9, 3)).toBe(1);
    expect(sectionCap(10, 10, 3)).toBe(1);
  });

  it('asks a section for a little over its share, at least three, at most the maximum', () => {
    expect(sectionRequestSize(1, 30)).toBe(3);
    expect(sectionRequestSize(10, 30)).toBe(14);
    expect(sectionRequestSize(30, 30)).toBe(30);
  });
});

describe('createCardPicker', () => {
  const candidate = (front: string, score = 15, difficulty: CandidateCard['difficulty'] = 'foundational'): CandidateCard => ({
    front, back: `${front} is described here.`, score, difficulty, topicTags: [], distractors: [],
  });

  it('takes good cards at once, up to the section cap, and holds the rest', () => {
    const picker = createCardPicker({ count: 5, usedFrontKeys: new Set() });
    picker.open(0, 2);
    expect(picker.offer(0, candidate('Alpha'))).toBe('take');
    expect(picker.offer(0, candidate('Beta'))).toBe('take');
    expect(picker.sectionFull(0)).toBe(true);
    expect(picker.offer(0, candidate('Gamma'))).toBe('hold');
    expect(picker.accepted()).toBe(2);
  });

  it('holds a weak card even when there is room', () => {
    const picker = createCardPicker({ count: 5, usedFrontKeys: new Set() });
    picker.open(0, 5);
    expect(picker.offer(0, candidate('Weak term', STREAM_ACCEPT_MIN_SCORE - 1))).toBe('hold');
    expect(picker.accepted()).toBe(0);
  });

  it('refuses a term the deck or the run already has', () => {
    const picker = createCardPicker({ count: 5, usedFrontKeys: new Set(['thrashing']) });
    picker.open(0, 5);
    expect(picker.offer(0, candidate('Thrashing'))).toBe('duplicate');
    expect(picker.offer(0, candidate('Alpha'))).toBe('take');
    picker.open(1, 5);
    expect(picker.offer(1, candidate('alpha'))).toBe('duplicate');
  });

  it('is full at the count, then fills nothing', () => {
    const picker = createCardPicker({ count: 2, usedFrontKeys: new Set() });
    picker.open(0, 5);
    picker.offer(0, candidate('Alpha'));
    picker.offer(0, candidate('Beta'));
    expect(picker.full()).toBe(true);
    expect(picker.offer(0, candidate('Gamma'))).toBe('hold');
    expect(picker.fill()).toEqual([]);
  });

  it('fills the room left from held cards, best first, and only once', () => {
    const picker = createCardPicker({ count: 3, usedFrontKeys: new Set() });
    picker.open(0, 1);
    picker.offer(0, candidate('Alpha'));
    picker.offer(0, candidate('Low', 9));
    picker.offer(0, candidate('High', 14));
    picker.offer(0, candidate('Weak', 2));
    expect(picker.fill().map((card) => card.front)).toEqual(['High', 'Low']);
    expect(picker.accepted()).toBe(3);
    expect(picker.fill()).toEqual([]);
  });
});
