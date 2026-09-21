/**
 * Presentation mappings for the drill canvas and the Insights panels.
 * Client-safe. Every colour comes from the state channel (design system §2.2)
 * and is always paired with a word (§2.2b).
 */

import type { TickState } from '@/components/ui/shared/StateTick';
import type { Band, Confidence, DrillVerdict, LinkStatus, MisconceptionKind, SynthesisFormat } from '@/lib/synthesis/types';

export type Tone = 'ink' | 'due' | 'learning' | 'mastered' | 'lapsed' | 'streak';

export const FORMAT_LABEL: Record<SynthesisFormat, string> = {
  causal: 'Causal',
  counterfactual: 'Counterfactual',
  comparative: 'Comparative',
  evaluate: 'Evaluate',
  apply: 'Apply',
  distinguish: 'Distinguish',
  elaborate: 'Elaborate',
};

/** One line per format for the launcher's picker. */
export const FORMAT_HINT: Record<SynthesisFormat, string> = {
  causal: 'by what mechanism A constrains B',
  counterfactual: 'what breaks if X is removed',
  comparative: 'when A beats B, and what it costs',
  evaluate: 'to what extent a claim holds',
  apply: 'what happens in a concrete case',
  distinguish: 'two concepts people confuse',
  elaborate: 'why, three levels deep',
};

/** Slot labels and placeholders per format (spec Appendix B). */
export const SLOT_LABELS: Record<SynthesisFormat, { claim: string; mechanism1: string; mechanism2: string; tradeoff: string }> = {
  causal: {
    claim: 'Claim',
    mechanism1: 'Mechanism 1',
    mechanism2: 'Mechanism 2',
    tradeoff: 'Boundary',
  },
  counterfactual: {
    claim: 'Position',
    mechanism1: 'Consequence 1',
    mechanism2: 'Consequence 2',
    tradeoff: 'Mitigation',
  },
  comparative: {
    claim: 'Position',
    mechanism1: 'Why A wins there',
    mechanism2: 'What A sacrifices',
    tradeoff: 'Boundary',
  },
  evaluate: {
    claim: 'Position',
    mechanism1: 'For',
    mechanism2: 'Against',
    tradeoff: 'Judgement',
  },
  apply: {
    claim: 'What happens',
    mechanism1: 'Because (1)',
    mechanism2: 'Because (2)',
    tradeoff: 'Unless',
  },
  distinguish: {
    claim: 'The distinction',
    mechanism1: 'A applies when',
    mechanism2: 'B applies when',
    tradeoff: 'Where they overlap',
  },
  elaborate: {
    claim: 'Claim',
    mechanism1: 'Why',
    mechanism2: 'Why, one level deeper',
    tradeoff: 'Where the chain stops',
  },
};

export const SLOT_PLACEHOLDERS: Record<SynthesisFormat, { claim: string; mechanism1: string; mechanism2: string; tradeoff: string }> = {
  causal: {
    claim: 'your position: what A does to B',
    mechanism1: 'how A acts on B — name the terms',
    mechanism2: 'the second step, or the reverse direction',
    tradeoff: 'when this stops holding',
  },
  counterfactual: {
    claim: 'what breaks when X is removed',
    mechanism1: 'first effect, and on which concept',
    mechanism2: 'second effect',
    tradeoff: 'what would limit the damage, or where it would not matter',
  },
  comparative: {
    claim: 'when A beats B',
    mechanism1: 'the mechanism',
    mechanism2: 'or what B wins',
    tradeoff: 'the condition that flips the choice',
  },
  evaluate: {
    claim: 'how far the claim holds, in one line',
    mechanism1: 'the strongest mechanism for it',
    mechanism2: 'the strongest consideration against it',
    tradeoff: 'your judgement, and what decides it',
  },
  apply: {
    claim: 'the outcome in this case',
    mechanism1: 'which concept drives it, and how',
    mechanism2: 'the second concept at work',
    tradeoff: 'the change in the case that would flip the outcome',
  },
  distinguish: {
    claim: 'the feature that separates them',
    mechanism1: 'the condition under which A is the right concept',
    mechanism2: 'the condition under which B is',
    tradeoff: 'the case where both apply, or neither',
  },
  elaborate: {
    claim: 'the relation that holds',
    mechanism1: 'because…',
    mechanism2: 'and that is because…',
    tradeoff: 'the point at which the reasons run out',
  },
};

/** The optional evidence slot (plan D12), shown when the key asks for a named example. */
export const EVIDENCE_SLOT = { label: 'Evidence', placeholder: 'a named example, case, study or datum the cards give' } as const;

export const FREE_TEXT_PLACEHOLDER = 'Position, mechanism, limit — in that order.';

/** Judgement of learning before the check (audit F1); the digit is the hotkey. */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  1: 'Unsure',
  2: 'Fairly sure',
  3: 'Sure',
};
export const CONFIDENCE_OPTIONS: readonly Confidence[] = [1, 2, 3];

/**
 * sound → mastered · partial → due · contradicted → lapsed · off_target → the
 * absence of a signal. The word beside the tick is what carries the meaning.
 */
export const VERDICT_TICK: Record<DrillVerdict, TickState> = {
  sound: 'mastered',
  partial: 'due',
  contradicted: 'lapsed',
  off_target: 'neutral',
};

export const VERDICT_TONE: Record<DrillVerdict, Tone> = {
  sound: 'mastered',
  partial: 'due',
  contradicted: 'lapsed',
  off_target: 'ink',
};

/** Essay-plan bands (plan D15): the examiner's words, and the same three ticks the verdict uses. */
export const BAND_LABEL: Record<Band, string> = {
  developing: 'Developing',
  secure: 'Secure',
  strong: 'Strong',
};
export const BAND_TICK: Record<Band, TickState> = {
  developing: 'due',
  secure: 'learning',
  strong: 'mastered',
};

export const VERDICT_LABEL: Record<DrillVerdict, string> = {
  sound: 'Sound',
  partial: 'Partial',
  contradicted: 'Contradicted',
  off_target: 'Off target',
};

/** The misconception kinds in the student's words (audit G7). */
export const MISCONCEPTION_LABEL: Record<MisconceptionKind, string> = {
  reversal: 'direction reversed',
  overgeneralisation: 'rule stretched past its condition',
  conflation: 'two concepts merged',
  wrong_condition: 'condition misstated',
  other: 'contradicts the card',
};

/** Red is reserved for *wrong*; a missing link is absence, not error. */
export const LINK_TICK: Record<LinkStatus, TickState> = {
  covered: 'mastered',
  partial: 'due',
  missing: 'empty',
};

export function linksTone(covered: number, total: number, verdict?: DrillVerdict | null): Tone {
  if (verdict === 'contradicted') return 'lapsed';
  if (total === 0) return 'ink';
  if (covered === total) return 'mastered';
  return 'due';
}

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Compact age for readings: `now`, `42m`, `3h`, `2d`, `3mo`. */
export function formatAge(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '—';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  const days = Math.round(seconds / 86_400);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/** `just now`, else `42m ago`. */
export function formatAgo(iso: string | null, now = Date.now()): string {
  const age = formatAge(iso, now);
  if (age === '—') return age;
  return age === 'now' ? 'just now' : `${age} ago`;
}

/** When a drill next comes up: `now`, `in 12h`, `in 2d`. */
export function formatDueIn(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at) || at <= now) return 'now';
  const hours = Math.round((at - now) / 3_600_000);
  if (hours < 36) return `in ${Math.max(1, hours)}h`;
  return `in ${Math.round(hours / 24)}d`;
}
