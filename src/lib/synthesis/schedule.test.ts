import { describe, expect, it } from 'vitest';
import { LADDER_DAYS, nextSchedule, orderQueue, pickCapstoneDrill } from './schedule';
import type { SynthesisDrill } from './types';

const NOW = new Date('2026-09-12T12:00:00Z');
const HOUR = 60 * 60_000;

function drill(id: string, overrides: Partial<SynthesisDrill> = {}): SynthesisDrill {
  return {
    id,
    deckId: 'deck',
    format: 'causal',
    promptText: `prompt ${id}`,
    cardIds: [`${id}-a`, `${id}-b`],
    topicTag: null,
    requiredLinks: [{ id: 'm1', text: 'l', cardIds: [`${id}-a`] }, { id: 'm2', text: 'l', cardIds: [`${id}-b`] }],
    exemplar: { claim: 'c', mechanisms: ['m', 'm'], tradeoff: 't' },
    status: 'active',
    step: 0,
    nextDueAt: NOW.toISOString(),
    attemptCount: 0,
    lastVerdict: null,
    lastAttemptAt: null,
    ...overrides,
  };
}

describe('nextSchedule — exam-sprint ladder', () => {
  it('is [0, 1, 2] days', () => {
    expect([...LADDER_DAYS]).toEqual([0, 1, 2]);
  });

  it('climbs 1 day, then 2 days, then stays at 2 on sound', () => {
    const first = nextSchedule(0, 'sound', NOW);
    expect(first.step).toBe(1);
    expect(first.nextDueAt.getTime()).toBe(NOW.getTime() + 24 * HOUR);

    const second = nextSchedule(1, 'sound', NOW);
    expect(second.step).toBe(2);
    expect(second.nextDueAt.getTime()).toBe(NOW.getTime() + 48 * HOUR);

    const capped = nextSchedule(2, 'sound', NOW);
    expect(capped.step).toBe(2);
    expect(capped.nextDueAt.getTime()).toBe(NOW.getTime() + 48 * HOUR);
  });

  it('retries partial in 24h without moving the step', () => {
    const result = nextSchedule(2, 'partial', NOW);
    expect(result).toEqual({ step: 2, nextDueAt: new Date(NOW.getTime() + 24 * HOUR) });
  });

  it('retries contradicted in 12h and drops one step, flooring at 0', () => {
    expect(nextSchedule(2, 'contradicted', NOW)).toEqual({ step: 1, nextDueAt: new Date(NOW.getTime() + 12 * HOUR) });
    expect(nextSchedule(0, 'contradicted', NOW).step).toBe(0);
  });

  it('leaves an off-target drill due now with its step unchanged', () => {
    expect(nextSchedule(1, 'off_target', NOW)).toEqual({ step: 1, nextDueAt: NOW });
  });
});

describe('orderQueue — orders, never locks', () => {
  const later = new Date(NOW.getTime() + 3 * 24 * HOUR).toISOString();

  it('always fills the launch while candidates remain, due first', () => {
    const queue = orderQueue({
      candidates: [
        { drill: drill('x', { nextDueAt: later }), anchorStates: ['review', 'review'] },
        { drill: drill('y'), anchorStates: ['review', 'review'] },
        { drill: drill('z', { nextDueAt: later }), anchorStates: ['new', 'new'] },
      ],
      count: 3,
      now: NOW,
      random: () => 0.5,
    });
    expect(queue).toHaveLength(3);
    expect(queue[0].id).toBe('y');
  });

  it('serves never-reviewed anchors just like reviewed ones (no readiness gate)', () => {
    const queue = orderQueue({
      candidates: [{ drill: drill('fresh'), anchorStates: ['new', 'new'] }],
      count: 1,
      now: NOW,
    });
    expect(queue.map((d) => d.id)).toEqual(['fresh']);
  });

  it('moves a drill with a relearning anchor ahead of its peers', () => {
    const queue = orderQueue({
      candidates: [
        { drill: drill('calm'), anchorStates: ['review', 'review'] },
        { drill: drill('lapsed'), anchorStates: ['relearning', 'review'] },
      ],
      count: 2,
      now: NOW,
      random: () => 0.5,
    });
    expect(queue[0].id).toBe('lapsed');
  });

  it('never puts two drills sharing a card in one launch', () => {
    const queue = orderQueue({
      candidates: [
        { drill: drill('p', { cardIds: ['shared', 'p-b'] }), anchorStates: ['review', 'review'] },
        { drill: drill('q', { cardIds: ['shared', 'q-b'] }), anchorStates: ['review', 'review'] },
        { drill: drill('r'), anchorStates: ['review', 'review'] },
      ],
      count: 3,
      now: NOW,
      random: () => 0.5,
    });
    expect(queue).toHaveLength(2);
    expect(queue.map((d) => d.id)).toEqual(expect.arrayContaining(['r']));
  });

  it('rotates formats among equal-priority drills', () => {
    const queue = orderQueue({
      candidates: [
        { drill: drill('a1', { format: 'causal' }), anchorStates: [] },
        { drill: drill('a2', { format: 'causal' }), anchorStates: [] },
        { drill: drill('b1', { format: 'comparative' }), anchorStates: [] },
      ],
      count: 3,
      now: NOW,
      random: () => 0.5,
    });
    expect(queue[1].format).not.toBe(queue[0].format);
  });

  it('serves a pinned drill first regardless of its due date', () => {
    const queue = orderQueue({
      candidates: [
        { drill: drill('due'), anchorStates: [] },
        { drill: drill('pinned', { nextDueAt: later }), anchorStates: [] },
      ],
      count: 2,
      now: NOW,
      pinnedDrillId: 'pinned',
      random: () => 0.5,
    });
    expect(queue[0].id).toBe('pinned');
  });

  it('skips archived drills and drills with fewer than two surviving anchors', () => {
    const queue = orderQueue({
      candidates: [
        { drill: drill('archived', { status: 'archived' }), anchorStates: [] },
        { drill: drill('orphan', { cardIds: ['only'] }), anchorStates: [] },
      ],
      count: 2,
      now: NOW,
    });
    expect(queue).toEqual([]);
  });
});

describe('pickCapstoneDrill', () => {
  const good = (cardId: string) => ({ cardId, grade: 'good' as const });

  it('prefers a due drill whose anchors were all graded well, then an unattempted one, then any due one', () => {
    const drills = [
      drill('anyDue'),
      drill('warmUnattempted', { nextDueAt: new Date(NOW.getTime() + HOUR).toISOString() }),
      drill('warmDue', { attemptCount: 2 }),
    ];
    const gradeLog = [good('warmDue-a'), good('warmDue-b'), good('warmUnattempted-a'), good('warmUnattempted-b')];
    expect(pickCapstoneDrill({ drills, gradeLog, now: NOW })?.id).toBe('warmDue');
    expect(pickCapstoneDrill({ drills: drills.slice(0, 2), gradeLog, now: NOW })?.id).toBe('warmUnattempted');
    expect(pickCapstoneDrill({ drills: drills.slice(0, 1), gradeLog, now: NOW })?.id).toBe('anyDue');
  });

  it('returns null when nothing is due and nothing is warm', () => {
    const cold = drill('cold', { nextDueAt: new Date(NOW.getTime() + HOUR).toISOString() });
    expect(pickCapstoneDrill({ drills: [cold], gradeLog: [{ cardId: 'cold-a', grade: 'again' }], now: NOW })).toBeNull();
  });

  it('never offers a drill whose anchor was last graded again, even when it is due (J7)', () => {
    const drills = [drill('due')];
    expect(pickCapstoneDrill({ drills, gradeLog: [good('due-a'), { cardId: 'due-b', grade: 'again' }], now: NOW })).toBeNull();
    // A card not seen this session does not make the drill cold.
    expect(pickCapstoneDrill({ drills, gradeLog: [good('due-a')], now: NOW })?.id).toBe('due');
  });

  it('counts a card by its last grade in the session, so again → good ends warm', () => {
    const drills = [drill('anyDue'), drill('requeued', { attemptCount: 1 })];
    const gradeLog = [
      { cardId: 'requeued-a', grade: 'again' as const },
      good('requeued-b'),
      good('requeued-a'),
    ];
    expect(pickCapstoneDrill({ drills, gradeLog, now: NOW })?.id).toBe('requeued');
    // …and good → again ends cold.
    expect(pickCapstoneDrill({ drills, gradeLog: [good('requeued-a'), { cardId: 'requeued-a', grade: 'again' }], now: NOW })?.id).toBe('anyDue');
  });

  it('accepts the lean candidate projection the study page passes', () => {
    const candidates = [
      { id: 'lean', promptText: 'p', cardIds: ['x', 'y'], status: 'active' as const, nextDueAt: NOW.toISOString(), attemptCount: 0 },
      { id: 'archived', promptText: 'p', cardIds: ['x', 'y'], status: 'archived' as const, nextDueAt: NOW.toISOString(), attemptCount: 0 },
    ];
    const picked = pickCapstoneDrill({ drills: candidates, gradeLog: [good('x'), good('y')], now: NOW });
    expect(picked?.id).toBe('lean');
    expect(picked?.promptText).toBe('p');
  });
});
