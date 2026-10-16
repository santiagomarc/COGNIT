import { describe, expect, it } from 'vitest';
import { fillSiblingDistractors, pickSiblingDistractors, selectUsableDistractors } from '@/lib/distractors';

describe('selectUsableDistractors', () => {
  it('accepts three distinct plausible distractors', () => {
    expect(selectUsableDistractors(['Meiosis', 'Apoptosis', 'Cytokinesis'], 'Mitosis'))
      .toEqual(['Meiosis', 'Apoptosis', 'Cytokinesis']);
  });

  it('rejects a distractor identical to the correct answer', () => {
    // This is the case that rendered two options as "correct" and produced a
    // duplicate React key in MCQMode.
    expect(selectUsableDistractors(['Mitosis', 'Meiosis', 'Apoptosis'], 'Mitosis')).toEqual([]);
  });

  it('rejects a near-duplicate of the answer differing only by case and space', () => {
    expect(selectUsableDistractors(['mitosis ', 'Meiosis', 'Apoptosis'], 'Mitosis')).toEqual([]);
  });

  it('rejects duplicate distractors', () => {
    expect(selectUsableDistractors(['Meiosis', 'meiosis', 'Apoptosis'], 'Mitosis')).toEqual([]);
  });

  it('requires exactly three — a 3-option MCQ is materially easier', () => {
    expect(selectUsableDistractors(['Meiosis', 'Apoptosis'], 'Mitosis')).toEqual([]);
  });

  it('takes the first three when the model over-delivers', () => {
    expect(selectUsableDistractors(
      ['Meiosis', 'Apoptosis', 'Cytokinesis', 'Autophagy'],
      'Mitosis',
    )).toEqual(['Meiosis', 'Apoptosis', 'Cytokinesis']);
  });

  it('drops blank and oversized entries', () => {
    expect(selectUsableDistractors(['  ', 'x'.repeat(250), 'Meiosis'], 'Mitosis')).toEqual([]);
  });

  it('handles a missing answer without crashing', () => {
    expect(selectUsableDistractors(['A', 'B', 'C'], '')).toHaveLength(3);
  });
});

const card = (id: string, front: string, topic_tags: string[] | null = null) => ({ id, front, topic_tags });

describe('pickSiblingDistractors', () => {
  const deck = [
    card('a', 'Mitosis', ['cell division']),
    card('b', 'Meiosis', ['cell division']),
    card('c', 'Cytokinesis', ['cell division']),
    card('d', 'Osmosis', ['transport']),
    card('e', 'Active transport', ['transport']),
  ];

  it('picks three other terms, never the answer', () => {
    const picked = pickSiblingDistractors(deck[0], deck);
    expect(picked).toHaveLength(3);
    expect(picked).not.toContain('Mitosis');
  });

  it('ranks terms sharing a topic tag first', () => {
    const picked = pickSiblingDistractors(deck[0], deck);
    expect(picked.slice(0, 2).sort()).toEqual(['Cytokinesis', 'Meiosis']);
  });

  it('is stable: the same card gets the same options every time', () => {
    expect(pickSiblingDistractors(deck[3], deck)).toEqual(pickSiblingDistractors(deck[3], deck));
  });

  it('skips a near-duplicate of the answer', () => {
    const picked = pickSiblingDistractors(card('x', 'Mitosis'), [card('x', 'Mitosis'), card('y', 'mitosis '), ...deck.slice(1)]);
    expect(picked.map((value) => value.toLowerCase().trim())).not.toContain('mitosis');
  });

  it('prefers terms that share words with the answer (parallel form)', () => {
    const generations = [
      card('g5', 'Fifth generation computers'),
      card('g4', 'Fourth generation computers'),
      card('g3', 'Third generation computers'),
      card('g2', 'Second generation computers'),
      card('m', 'Pre-mechanical era'),
      card('e', 'Electro-mechanical era'),
    ];
    expect(pickSiblingDistractors(generations[0], generations).sort())
      .toEqual(['Fourth generation computers', 'Second generation computers', 'Third generation computers']);
  });

  it('never offers a term that contains the answer, or is contained by it', () => {
    const rpc = [
      card('a', 'Remote Procedure Calls (RPC)'),
      card('b', 'Remote Procedure Calls'),
      card('c', 'Message Passing Model'),
      card('d', 'Distributed Hash Tables'),
      card('e', 'Publish-subscribe'),
    ];
    expect(pickSiblingDistractors(rpc[0], rpc)).not.toContain('Remote Procedure Calls');
  });

  it('returns [] for a deck with fewer than four terms', () => {
    expect(pickSiblingDistractors(deck[0], deck.slice(0, 3))).toEqual([]);
  });
});

describe('fillSiblingDistractors', () => {
  const deck = [card('a', 'Mitosis'), card('b', 'Meiosis'), card('c', 'Cytokinesis'), card('d', 'Osmosis')];

  it('fills cards without three options and keeps stored ones', () => {
    const [filled, kept] = fillSiblingDistractors(
      [
        { ...deck[0], mcq_distractors: null },
        { ...deck[1], mcq_distractors: ['Apoptosis', 'Autophagy', 'Necrosis'] },
      ],
      deck,
    );
    expect(filled.mcq_distractors).toHaveLength(3);
    expect(kept.mcq_distractors).toEqual(['Apoptosis', 'Autophagy', 'Necrosis']);
  });
});
