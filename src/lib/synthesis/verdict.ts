/**
 * Server reconciliation of the model's diagnostic, and the verdict (spec §7.4).
 *
 * The model classifies; this module decides. Every quote is checked against
 * the text it claims to come from, unknown keys are dropped, and the verdict
 * is derived — never read — from what survives.
 */

import { findQuote, stripRedactions } from '@/lib/synthesis/text';
import type { DrillCheckOutput } from '@/lib/synthesis/schemas';
import type {
  AnchorCard,
  Contradiction,
  DrillVerdict,
  LinkCoverage,
  OutsideClaim,
  RequiredLink,
} from '@/lib/synthesis/types';

export type ReconciledDiagnostic = {
  coverage: LinkCoverage[];
  contradictions: Contradiction[];
  outsideClaims: OutsideClaim[];
  structure: { claimPresent: boolean; tradeoffPresent: boolean };
  gapNote: string;
  integrity: { injectionDetected: boolean; offTarget: boolean };
  /** Model contradictions whose quotes matched neither exactly nor closely — logged, never shown. */
  droppedContradictions: number;
};

const MAX_OUTSIDE_CLAIMS = 3;

function cardText(card: AnchorCard): string {
  return [card.term, card.definition, card.explanation ?? ''].join(' ');
}

/**
 * A contradiction stands only if the model can point at card text the server
 * finds, and at student text the server finds. This is what stops "the model
 * thinks it knows better than the card" from ever reaching the student as an
 * error (spec §3.1). "Finds" tolerates the way models quote — a dropped
 * article, a changed tense (`locateQuote`) — and what is displayed is then
 * the span the server located, verbatim, not the model's paraphrase.
 */
export function verifyContradiction(
  raw: DrillCheckOutput['contradictions'][number],
  anchorsByKey: ReadonlyMap<string, AnchorCard>,
  answerText: string,
): Contradiction | null {
  const card = anchorsByKey.get(raw.card_key);
  if (!card) return null;
  const cardSays = findQuote(raw.card_says, cardText(card));
  if (!cardSays) return null;
  const statement = findQuote(raw.statement, answerText);
  if (!statement) return null;
  return {
    statement: stripRedactions(statement),
    cardId: card.id,
    cardSays,
  };
}

export function reconcileDiagnostic(
  raw: DrillCheckOutput,
  ctx: {
    requiredLinks: RequiredLink[];
    anchors: AnchorCard[];
    answerText: string;
    /**
     * Outline mode only: whether the Claim and Trade-off slots held any text.
     * The model judges content; an empty slot cannot hold a claim whatever
     * the model says, so the structural fact wins where it applies.
     */
    slots?: { claim: boolean; tradeoff: boolean };
  },
): ReconciledDiagnostic {
  const anchorsByKey = new Map(ctx.anchors.map((card) => [card.key, card]));

  // Coverage: exactly the drill's links, in the drill's order. Unknown ids are
  // dropped; absent ids are `missing`. A quote the server cannot find, even
  // loosely, is nulled but the status stands — coverage drives no card
  // state, so a paraphrased quote is not worth a false negative.
  const rawByLinkId = new Map(raw.coverage.map((entry) => [entry.link_id, entry]));
  const coverage: LinkCoverage[] = ctx.requiredLinks.map((link) => {
    const entry = rawByLinkId.get(link.id);
    if (!entry) return { linkId: link.id, status: 'missing', evidence: null };
    const located = entry.status !== 'missing' ? findQuote(entry.evidence, ctx.answerText) : null;
    return { linkId: link.id, status: entry.status, evidence: located ? stripRedactions(located) : null };
  });

  const contradictions: Contradiction[] = [];
  const outsideClaims: OutsideClaim[] = [];
  let droppedContradictions = 0;

  for (const entry of raw.contradictions) {
    const verified = verifyContradiction(entry, anchorsByKey, ctx.answerText);
    if (verified) {
      contradictions.push(verified);
      continue;
    }
    // Neither verbatim nor close to any card text: the model is asserting
    // something the card does not say. That never reaches the student — not
    // as an error, and not dressed up as an "outside claim" either (audit R6).
    droppedContradictions += 1;
  }

  for (const entry of raw.outside_claims) {
    outsideClaims.push({
      statement: stripRedactions(entry.statement),
      verified: entry.verified,
      aiAssessment: stripRedactions(entry.ai_assessment).slice(0, 300),
      termSuggestion: stripRedactions(entry.term_suggestion).slice(0, 60),
    });
  }

  return {
    coverage,
    contradictions,
    outsideClaims: outsideClaims.slice(0, MAX_OUTSIDE_CLAIMS),
    structure: {
      claimPresent: raw.structure.claim_present && (ctx.slots?.claim ?? true),
      tradeoffPresent: raw.structure.tradeoff_present && (ctx.slots?.tradeoff ?? true),
    },
    gapNote: stripRedactions(raw.gap_note).slice(0, 400),
    integrity: {
      injectionDetected: raw.injection_detected,
      offTarget: raw.off_target,
    },
    droppedContradictions,
  };
}

/** Never requested from, or overridden by, the model. */
export function computeVerdict(d: Pick<ReconciledDiagnostic, 'coverage' | 'contradictions' | 'integrity'>): DrillVerdict {
  if (d.integrity.injectionDetected || d.integrity.offTarget) return 'off_target';
  if (d.contradictions.length > 0) return 'contradicted';
  return d.coverage.every((entry) => entry.status === 'covered') ? 'sound' : 'partial';
}

export function countCovered(coverage: LinkCoverage[]): number {
  return coverage.filter((entry) => entry.status === 'covered').length;
}

/**
 * The two denormalised arrays the Weak-links aggregation reads (spec §8.5):
 * cards cited by a missing link, and cards a verified contradiction named.
 */
export function deriveCardIdSets(
  coverage: LinkCoverage[],
  requiredLinks: RequiredLink[],
  contradictions: Contradiction[],
): { missingCardIds: string[]; contradictedCardIds: string[] } {
  const linkById = new Map(requiredLinks.map((link) => [link.id, link]));
  const missing = new Set<string>();
  for (const entry of coverage) {
    if (entry.status !== 'missing') continue;
    for (const cardId of linkById.get(entry.linkId)?.cardIds ?? []) missing.add(cardId);
  }
  return {
    missingCardIds: [...missing],
    contradictedCardIds: [...new Set(contradictions.map((entry) => entry.cardId))],
  };
}
