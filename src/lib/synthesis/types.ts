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

export function isDrillVerdict(value: unknown): value is DrillVerdict {
  return value === 'sound' || value === 'partial' || value === 'contradicted' || value === 'off_target';
}

export function isSynthesisFormat(value: unknown): value is SynthesisFormat {
  return value === 'causal' || value === 'counterfactual' || value === 'comparative';
}
