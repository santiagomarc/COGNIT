/**
 * Micro-synthesis domain types (COGNIT_MICRO_SYNTHESIS_SPEC.md Rev. B.1 §9.2).
 *
 * Client-safe: no server imports. Cards cross every boundary as
 * `{ id, term, definition }` — never `front` / `back` (design system §7.6).
 */

export type SynthesisFormat = 'causal' | 'counterfactual' | 'comparative' | 'evaluate' | 'apply' | 'distinguish' | 'elaborate';
/**
 * What a required link asks for (execution plan D3). `mechanism` is the
 * causal chain; `condition` is a boundary or trade-off — always core;
 * `evidence` is a named example, study, case or datum; `evaluation` is a
 * counter-position or judgement (plan-mode keys).
 */
export type LinkKind = 'mechanism' | 'condition' | 'evidence' | 'evaluation';
/** The generator's difficulty tag (Bloom, revised): the queue prefers harder formats at step 2. */
export type Bloom = 'analyse' | 'evaluate' | 'create';
export type DrillVerdict = 'sound' | 'partial' | 'contradicted' | 'off_target';
export type LinkStatus = 'covered' | 'partial' | 'missing';
export type AnswerMode = 'outline' | 'free' | 'plan';
/** A drill is 2–3 cards and a four-slot answer; a plan is a set question over 4–8 cards answered as an essay plan (plan D15). */
export type DrillKind = 'drill' | 'plan';
/** How an essay plan is graded: the same words examiners use (plan D15). */
export type Band = 'developing' | 'secure' | 'strong';
/** Index into LADDER_DAYS (schedule.ts). */
export type Step = 0 | 1 | 2;
/** Judgement of learning before the check: 1 unsure · 2 fairly sure · 3 sure. */
export type Confidence = 1 | 2 | 3;

export const SYNTHESIS_FORMATS: readonly SynthesisFormat[] = ['causal', 'counterfactual', 'comparative', 'evaluate', 'apply', 'distinguish', 'elaborate'];
/** The three formats a launch rotates through by default; the rest are opt-in or queue-preferred. */
export const DEFAULT_LAUNCH_FORMATS: readonly SynthesisFormat[] = ['causal', 'counterfactual', 'comparative'];
export const LINK_KINDS: readonly LinkKind[] = ['mechanism', 'condition', 'evidence', 'evaluation'];

export type RequiredLink = {
  id: string;
  text: string;
  cardIds: string[];
  kind: LinkKind;
  /** A `sound` verdict needs every core link covered; a non-core link may be partial (plan D4). */
  core: boolean;
};
export type Exemplar = { claim: string; mechanisms: [string, string]; tradeoff: string };

/** One paragraph of an essay plan: the point, its mechanism, its evidence, its limit. */
export type PlanPoint = { claim: string; mechanism: string; evidence: string; limit: string };
/** A model essay plan, generated with the question (plan D15). */
export type PlanExemplar = { thesis: string; points: [PlanPoint, PlanPoint, PlanPoint]; conclusion: string };

export type SynthesisDrill = {
  id: string;
  deckId: string;
  kind: DrillKind;
  format: SynthesisFormat;
  /** Plan only: the exam question as set, and its command word ("to what extent", "discuss"…). */
  questionText: string | null;
  commandWord: string | null;
  /** Plan only: the model plan; `exemplar` then carries a four-slot digest of it for the shared surfaces. */
  planExemplar: PlanExemplar | null;
  promptText: string;
  /** Rewordings of the same question, served in rotation (plan D6). */
  promptVariants: string[];
  /** The short case an `apply` drill is set in; null for other formats. */
  scenario: string | null;
  bloom: Bloom | null;
  /** Anchor card ids in a fixed order; the check keys them c1..c3 by position. */
  cardIds: string[];
  topicTag: string | null;
  requiredLinks: RequiredLink[];
  exemplar: Exemplar;
  status: 'active' | 'archived';
  step: Step;
  nextDueAt: string;
  attemptCount: number;
  lastVerdict: DrillVerdict | null;
  lastAttemptAt: string | null;
};

/** The wording the student sees for an attempt: the original or one of its variants. */
export function promptForAttempt(drill: Pick<SynthesisDrill, 'promptText' | 'promptVariants'>, variant: number): string {
  const pool = [drill.promptText, ...drill.promptVariants];
  return pool[Math.max(0, Math.min(pool.length - 1, variant))];
}

/** The variant a drill serves next: rotates with the attempt count. */
export function nextPromptVariant(drill: Pick<SynthesisDrill, 'promptVariants' | 'attemptCount'>): number {
  return drill.attemptCount % (1 + drill.promptVariants.length);
}

/**
 * What the drill canvas receives at page load: never the answer key. The
 * required links, the exemplar and the cards' definitions come back with
 * the check, once the answer has been given (audit P3). `promptText` is the
 * variant being served; `promptVariant` is its index, echoed by the check.
 * `linkKinds` says what the key asks for (an evidence slot, say) without
 * saying what it says.
 */
export type CanvasDrill = Omit<SynthesisDrill, 'requiredLinks' | 'exemplar' | 'planExemplar' | 'promptVariants'> & {
  linkCount: number;
  linkKinds: LinkKind[];
  promptVariant: number;
};

/** An anchor as the canvas sees it before the check: the term only. */
export type CanvasAnchor = Pick<AnchorCard, 'id' | 'key' | 'term'>;

/**
 * The projection the study completion screen needs to offer a capstone
 * (spec §8.3): identity, the prompt to show, and the three fields
 * `pickCapstoneDrill` reads. Never the answer key.
 */
export type CapstoneDrillCandidate = Pick<SynthesisDrill, 'id' | 'promptText' | 'cardIds' | 'status' | 'nextDueAt' | 'attemptCount'>;

/** What the canvas and the check need per anchor. */
export type AnchorCard = {
  id: string;
  /** c1..c3 — position in the drill's card_ids. */
  key: string;
  term: string;
  definition: string;
  explanation: string | null;
  state: string;
};

export type OutlineResponse = {
  claim: string;
  mechanisms: [string, string];
  tradeoff: string;
  /** The optional fifth slot: a named example, case, study or datum (plan D12). */
  evidence?: string;
};
export type FreeResponse = { text: string };
/** An essay plan: the first eight minutes of an exam answer (plan D15). */
export type PlanResponse = { thesis: string; points: [PlanPoint, PlanPoint, PlanPoint]; conclusion: string };
export type AttemptResponse = OutlineResponse | FreeResponse | PlanResponse;

export type LinkCoverage = { linkId: string; status: LinkStatus; evidence: string | null };
/**
 * What kind of error a verified contradiction is (audit G7): the direction
 * of an effect reversed, a rule stretched past its condition, two concepts
 * merged, a condition misstated — or none of those.
 */
export type MisconceptionKind = 'reversal' | 'overgeneralisation' | 'conflation' | 'wrong_condition' | 'other';
export const MISCONCEPTION_KINDS: readonly MisconceptionKind[] = ['reversal', 'overgeneralisation', 'conflation', 'wrong_condition', 'other'];
export type Contradiction = { statement: string; cardId: string; cardSays: string; kind: MisconceptionKind };
export type OutsideClaim = {
  statement: string;
  verified: boolean;
  aiAssessment: string;
  termSuggestion: string;
};

export type Diagnostic = {
  verdict: DrillVerdict;
  coverage: LinkCoverage[];
  contradictions: Contradiction[];
  outsideClaims: OutsideClaim[];
  structure: { claimPresent: boolean; tradeoffPresent: boolean };
  gapNote: string;
  integrity: { injectionDetected: boolean; offTarget: boolean };
  pulledForwardCardIds: string[];
  linksCovered: number;
  linksTotal: number;
  schedule: { step: Step; nextDueAt: string };
  /** What the student said before the check, echoed so the result can show the calibration line. */
  confidence: Confidence | null;
  /** Outside claims already turned into cards, by claim index (improvement plan §3.3). */
  absorbedCardIds: Record<number, string>;
  /** Plans only: the examiner's band (plan D15). */
  band: Band | null;
};

/** The answer key and the cards, returned with the check — never before it. */
export type DrillReveal = {
  requiredLinks: { id: string; text: string; kind: LinkKind; core: boolean }[];
  exemplar: Exemplar;
  planExemplar: PlanExemplar | null;
  cards: { id: string; term: string; definition: string; explanation: string | null }[];
};

/** The last attempt on a drill, as the canvas shows it before answering. */
export type LastAttemptSummary = {
  attemptId: string;
  verdict: DrillVerdict;
  gapNote: string;
  linksCovered: number;
  linksTotal: number;
  createdAt: string;
};

/** One past attempt on a drill, as the result footer's tick row shows it (audit U4). */
export type DrillAttemptHistoryEntry = {
  verdict: DrillVerdict;
  linksCovered: number;
  linksTotal: number;
  createdAt: string;
};

export type WeakLinkRow = {
  cardId: string;
  term: string;
  missing: number;
  contradicted: number;
  lastAt: string;
};

export type DrillHistoryRow = {
  attemptId: string;
  drillId: string;
  promptText: string;
  format: SynthesisFormat;
  verdict: DrillVerdict;
  linksCovered: number;
  linksTotal: number;
  durationMs: number;
  createdAt: string;
};

export type SynthesisReadings = {
  activeDrills: number;
  due: number;
  linksCovered: number;
  linksTotal: number;
  lastAttemptAt: string | null;
  /** Plan questions (plan D15), counted apart from drills. */
  plans: { active: number; due: number };
};

/** The narrow drill row the launcher's readings are computed from (audit P1). */
export type DrillReadingRow = {
  status: 'active' | 'archived';
  nextDueAt: string;
  linkCount: number;
  lastLinksCovered: number | null;
  lastAttemptAt: string | null;
};

export function isConfidence(value: unknown): value is Confidence {
  return value === 1 || value === 2 || value === 3;
}

export function isDrillVerdict(value: unknown): value is DrillVerdict {
  return value === 'sound' || value === 'partial' || value === 'contradicted' || value === 'off_target';
}

export function isSynthesisFormat(value: unknown): value is SynthesisFormat {
  return typeof value === 'string' && (SYNTHESIS_FORMATS as readonly string[]).includes(value);
}

export function isLinkKind(value: unknown): value is LinkKind {
  return typeof value === 'string' && (LINK_KINDS as readonly string[]).includes(value);
}

export function isBloom(value: unknown): value is Bloom {
  return value === 'analyse' || value === 'evaluate' || value === 'create';
}

export function isMisconceptionKind(value: unknown): value is MisconceptionKind {
  return typeof value === 'string' && (MISCONCEPTION_KINDS as readonly string[]).includes(value);
}

export function isBand(value: unknown): value is Band {
  return value === 'developing' || value === 'secure' || value === 'strong';
}

export function isDrillKind(value: unknown): value is DrillKind {
  return value === 'drill' || value === 'plan';
}
