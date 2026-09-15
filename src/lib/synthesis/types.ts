/**
 * Micro-synthesis domain types (COGNIT_MICRO_SYNTHESIS_SPEC.md Rev. B.1 §9.2).
 *
 * Client-safe: no server imports. Cards cross every boundary as
 * `{ id, term, definition }` — never `front` / `back` (design system §7.6).
 */

export type SynthesisFormat = 'causal' | 'counterfactual' | 'comparative';
export type DrillVerdict = 'sound' | 'partial' | 'contradicted' | 'off_target';
export type LinkStatus = 'covered' | 'partial' | 'missing';
export type AnswerMode = 'outline' | 'free';
/** Index into LADDER_DAYS (schedule.ts). */
export type Step = 0 | 1 | 2;
/** Judgement of learning before the check: 1 unsure · 2 fairly sure · 3 sure. */
export type Confidence = 1 | 2 | 3;

export const SYNTHESIS_FORMATS: readonly SynthesisFormat[] = ['causal', 'counterfactual', 'comparative'];

export type RequiredLink = { id: string; text: string; cardIds: string[] };
export type Exemplar = { claim: string; mechanisms: [string, string]; tradeoff: string };

export type SynthesisDrill = {
  id: string;
  deckId: string;
  format: SynthesisFormat;
  promptText: string;
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

/**
 * What the drill canvas receives at page load: never the answer key. The
 * required links, the exemplar and the cards' definitions come back with
 * the check, once the answer has been given (audit P3).
 */
export type CanvasDrill = Omit<SynthesisDrill, 'requiredLinks' | 'exemplar'> & { linkCount: number };

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

export type OutlineResponse = { claim: string; mechanisms: [string, string]; tradeoff: string };
export type FreeResponse = { text: string };
export type AttemptResponse = OutlineResponse | FreeResponse;

export type LinkCoverage = { linkId: string; status: LinkStatus; evidence: string | null };
export type Contradiction = { statement: string; cardId: string; cardSays: string };
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
};

/** The answer key and the cards, returned with the check — never before it. */
export type DrillReveal = {
  requiredLinks: { id: string; text: string }[];
  exemplar: Exemplar;
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
  return value === 'causal' || value === 'counterfactual' || value === 'comparative';
}
