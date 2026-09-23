/**
 * Drill scheduling (spec §8.1–8.3, Rev. B.1). Pure.
 *
 * Exam-sprint cadence: drills live on a [0, 1, 2]-day ladder rather than the
 * flashcards' months-long SM-2 tail, and they are NEVER locked — the queue
 * orders, it does not gate. Cards are not touched here at all (§8.4 lives in
 * the action, as one filtered update).
 */

import type { CapstoneDrillCandidate, Confidence, DrillKind, DrillVerdict, Step, SynthesisDrill, SynthesisFormat } from '@/lib/synthesis/types';

/** index = step, value = days until the next due after a `sound` verdict. */
export const LADDER_DAYS = [0, 1, 2] as const;
/** Plans are longer and rarer: a sound plan comes back in 1, then 3, then 7 days (plan D15). */
export const PLAN_LADDER_DAYS = [1, 3, 7] as const;
/** Inside three days of the exam every sound drill is back within the day (plan D19). */
export const FINAL_DAYS_LADDER = [0, 0.5, 1] as const;
/** More than two weeks out the sprint cadence is too tight; the ladder stretches. */
export const DISTANT_LADDER_DAYS = [1, 3, 7] as const;
export const FINAL_DAYS_THRESHOLD = 3;
export const SPRINT_THRESHOLD_DAYS = 14;

/**
 * Which ladder a drill walks, given the deck's exam date (plan D19). No
 * date, or a date already past, means the sprint cadence — the default the
 * feature launched with.
 */
export function ladderFor(kind: DrillKind, daysToExam: number | null): readonly number[] {
  if (kind === 'plan') return PLAN_LADDER_DAYS;
  if (daysToExam === null || daysToExam < 0) return LADDER_DAYS;
  if (daysToExam <= FINAL_DAYS_THRESHOLD) return FINAL_DAYS_LADDER;
  if (daysToExam <= SPRINT_THRESHOLD_DAYS) return LADDER_DAYS;
  return DISTANT_LADDER_DAYS;
}

/**
 * Whole days left before the exam: 0 on the exam day, 1 the day before, -1
 * once it has passed; null without a date. `exam_at` is stored as 23:59 local
 * time on the exam day (ExamDateControl), so flooring the remaining time
 * counts calendar days. `Math.ceil` read one day long: "in 2 days" for
 * tomorrow, "in 1 day" on the day itself, and the final-days ladder engaged
 * a day late.
 */
export function daysToExam(examAt: string | null | undefined, now: Date): number | null {
  if (!examAt) return null;
  const at = Date.parse(examAt);
  if (Number.isNaN(at)) return null;
  const remaining = at - now.getTime();
  return remaining < 0 ? -1 : Math.floor(remaining / (24 * 60 * 60_000));
}
export const MAX_STEP: Step = 2;
export const PARTIAL_RETRY_HOURS = 24;
export const CONTRADICTED_RETRY_HOURS = 12;
export const PLAN_PARTIAL_RETRY_HOURS = 48;
export const PLAN_CONTRADICTED_RETRY_HOURS = 24;
/** A student who was *sure* and was not sound retries sooner: overconfidence is the thing to fix first. */
export const OVERCONFIDENT_RETRY_HOURS = 12;

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

function toStep(value: number): Step {
  return Math.max(0, Math.min(MAX_STEP, Math.floor(value))) as Step;
}

/**
 * @param options.confidence The student's judgement before the check (1 unsure ·
 * 2 fairly sure · 3 sure). Only one cell changes the schedule: sure × partial
 * comes back in 12 h instead of 24 h — a miscalibrated "sure" is the gap
 * most worth closing while it is fresh. Unsure × sound changes nothing; the
 * student is already calibrated toward caution.
 */
export function nextSchedule(
  step: Step,
  verdict: DrillVerdict,
  now: Date,
  options: { confidence?: Confidence | null; kind?: DrillKind; daysToExam?: number | null } = {},
): { step: Step; nextDueAt: Date } {
  const plan = options.kind === 'plan';
  const ladder = ladderFor(options.kind ?? 'drill', options.daysToExam ?? null);
  switch (verdict) {
    case 'sound': {
      const next = toStep(step + 1);
      return { step: next, nextDueAt: new Date(now.getTime() + ladder[next] * DAY_MS) };
    }
    case 'partial': {
      const base = plan ? PLAN_PARTIAL_RETRY_HOURS : PARTIAL_RETRY_HOURS;
      const hours = options.confidence === 3 ? Math.min(base, OVERCONFIDENT_RETRY_HOURS) : base;
      return { step: toStep(step), nextDueAt: new Date(now.getTime() + hours * HOUR_MS) };
    }
    case 'contradicted':
      return { step: toStep(step - 1), nextDueAt: new Date(now.getTime() + (plan ? PLAN_CONTRADICTED_RETRY_HOURS : CONTRADICTED_RETRY_HOURS) * HOUR_MS) };
    case 'off_target':
      // Nothing was learned; the drill stays due and an in-place retry is offered.
      return { step: toStep(step), nextDueAt: new Date(now.getTime()) };
  }
}

/** Formats that demand a judgement or a construction rather than a chain. */
const HARDER_FORMATS: ReadonlySet<SynthesisFormat> = new Set(['evaluate', 'apply', 'distinguish', 'elaborate']);

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
  const active = input.candidates.filter((candidate) => candidate.drill.status === 'active' && candidate.drill.cardIds.length >= 2);

  // Difficulty preference (plan D18): once a drill has been sound twice
  // (step 2), a harder drill on any of the same cards is preferred over it —
  // the relation is known; the next thing to test is a judgement about it.
  const masteredCards = new Set(active.filter((candidate) => candidate.drill.step >= MAX_STEP).flatMap((candidate) => candidate.drill.cardIds));
  const isHarder = (drill: SynthesisDrill) => drill.bloom === 'evaluate' || drill.bloom === 'create' || HARDER_FORMATS.has(drill.format);

  const scored = active
    .map((candidate) => {
      const due = new Date(candidate.drill.nextDueAt).getTime() <= nowMs;
      const relearning = candidate.anchorStates.some((state) => state === 'relearning');
      const pinned = input.pinnedDrillId != null && candidate.drill.id === input.pinnedDrillId;
      const stepUp = candidate.drill.step < MAX_STEP && isHarder(candidate.drill) && candidate.drill.cardIds.some((id) => masteredCards.has(id));
      const priority = (pinned ? -10 : 0) + (due ? 0 : 1) - (relearning ? 0.5 : 0) - (stepUp ? 0.25 : 0);
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
