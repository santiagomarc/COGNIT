/**
 * Drill scheduling (spec §8.1–8.3, Rev. B.1). Pure.
 *
 * Exam-sprint cadence: drills live on a [0, 1, 2]-day ladder rather than the
 * flashcards' months-long SM-2 tail, and they are NEVER locked — the queue
 * orders, it does not gate. Cards are not touched here at all (§8.4 lives in
 * the action, as one filtered update).
 */

import type { CapstoneDrillCandidate, DrillVerdict, Step, SynthesisDrill } from '@/lib/synthesis/types';

/** index = step, value = days until the next due after a `sound` verdict. */
export const LADDER_DAYS = [0, 1, 2] as const;
export const MAX_STEP: Step = 2;
export const PARTIAL_RETRY_HOURS = 24;
export const CONTRADICTED_RETRY_HOURS = 12;

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

function toStep(value: number): Step {
  return Math.max(0, Math.min(MAX_STEP, Math.floor(value))) as Step;
}

export function nextSchedule(step: Step, verdict: DrillVerdict, now: Date): { step: Step; nextDueAt: Date } {
  switch (verdict) {
    case 'sound': {
      const next = toStep(step + 1);
      return { step: next, nextDueAt: new Date(now.getTime() + LADDER_DAYS[next] * DAY_MS) };
    }
    case 'partial':
      return { step: toStep(step), nextDueAt: new Date(now.getTime() + PARTIAL_RETRY_HOURS * HOUR_MS) };
    case 'contradicted':
      return { step: toStep(step - 1), nextDueAt: new Date(now.getTime() + CONTRADICTED_RETRY_HOURS * HOUR_MS) };
    case 'off_target':
      // Nothing was learned; the drill stays due and an in-place retry is offered.
      return { step: toStep(step), nextDueAt: new Date(now.getTime()) };
  }
}

export type QueueCandidate = {
  drill: SynthesisDrill;
  /** SM-2 `state` of each surviving anchor. */
  anchorStates: string[];
};

/**
 * Due first, then a lapse-affected anchor, then everything else — and always
 * `count` drills while candidates remain. No two drills in one launch share a
 * card; formats rotate where the order allows; a pinned drill goes first.
 */
export function orderQueue(input: {
  candidates: QueueCandidate[];
  count: number;
  now: Date;
  pinnedDrillId?: string | null;
  random?: () => number;
}): SynthesisDrill[] {
  const random = input.random ?? Math.random;
  const nowMs = input.now.getTime();

  const scored = input.candidates
    .filter((candidate) => candidate.drill.status === 'active' && candidate.drill.cardIds.length >= 2)
    .map((candidate) => {
      const due = new Date(candidate.drill.nextDueAt).getTime() <= nowMs;
      const relearning = candidate.anchorStates.some((state) => state === 'relearning');
      const pinned = input.pinnedDrillId != null && candidate.drill.id === input.pinnedDrillId;
      const priority = (pinned ? -10 : 0) + (due ? 0 : 1) - (relearning ? 0.5 : 0);
      return { drill: candidate.drill, priority, tiebreak: random() };
    })
    .sort((a, b) =>
      a.priority - b.priority
      || new Date(a.drill.nextDueAt).getTime() - new Date(b.drill.nextDueAt).getTime()
      || a.tiebreak - b.tiebreak);

  const chosen: SynthesisDrill[] = [];
  const usedCards = new Set<string>();
  const remaining = [...scored];

  // Greedy with a format-rotation preference: among the next eligible drills
  // at the same priority, prefer one whose format differs from the last chosen.
  while (chosen.length < input.count && remaining.length > 0) {
    const lastFormat = chosen[chosen.length - 1]?.format;
    let pickIndex = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index];
      if (entry.drill.cardIds.some((id) => usedCards.has(id))) continue;
      if (pickIndex === -1) pickIndex = index;
      const samePriorityAsFirst = entry.priority === remaining[pickIndex].priority;
      if (!samePriorityAsFirst) break;
      if (lastFormat && entry.drill.format !== lastFormat) {
        pickIndex = index;
        break;
      }
    }
    if (pickIndex === -1) break;

    const [picked] = remaining.splice(pickIndex, 1);
    chosen.push(picked.drill);
    for (const id of picked.drill.cardIds) usedCards.add(id);
  }

  return chosen;
}

export type CapstoneGrade = 'again' | 'hard' | 'good' | 'easy';

/**
 * Capstone after a study session (spec §8.3): a due drill whose anchors were
 * all just graded good/easy, else a never-attempted one meeting the same
 * condition, else a due drill, else nothing.
 *
 * A card's *last* grade in the session is the one that counts — a requeued
 * card that went again → good ended warm. Any anchor whose last grade was
 * `again` rules its drills out at every tier: the offer exists because
 * retrieval is warm (§8.1), and a drill on a card the student just failed is
 * not a capstone, it is a second failure (UAT J7).
 *
 * Generic over the drill shape so the study page can pass the lean
 * `CapstoneDrillCandidate` projection instead of the full drill.
 */
export function pickCapstoneDrill<T extends CapstoneDrillCandidate>(input: {
  drills: T[];
  gradeLog: { cardId: string; grade: CapstoneGrade }[];
  now: Date;
}): T | null {
  const nowMs = input.now.getTime();
  const lastGrade = new Map<string, CapstoneGrade>();
  for (const entry of input.gradeLog) lastGrade.set(entry.cardId, entry.grade);

  const active = input.drills.filter((drill) => drill.status === 'active' && drill.cardIds.length >= 2);
  const isDue = (drill: T) => new Date(drill.nextDueAt).getTime() <= nowMs;
  const cold = (drill: T) => drill.cardIds.some((id) => lastGrade.get(id) === 'again');
  const warm = (drill: T) => drill.cardIds.every((id) => {
    const grade = lastGrade.get(id);
    return grade === 'good' || grade === 'easy';
  });

  const eligible = active.filter((drill) => !cold(drill));
  return (
    eligible.find((drill) => isDue(drill) && warm(drill))
    ?? eligible.find((drill) => drill.attemptCount === 0 && warm(drill))
    ?? eligible.find(isDue)
    ?? null
  );
}
