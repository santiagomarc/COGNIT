/**
 * Server reconciliation of the model's diagnostic, and the verdict (spec §7.4).
 *
 * The model classifies; this module decides. Every quote is checked against
 * the text it claims to come from, unknown keys are dropped, and the verdict
 * is derived — never read — from what survives.
 */

import { stripRedactions, verifyQuote } from '@/lib/synthesis/text';
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
};

const MAX_OUTSIDE_CLAIMS = 3;

function cardText(card: AnchorCard): string {
  return [card.term, card.definition, card.explanation ?? ''].join(' ');
}

/**
 * A contradiction stands only if the model can point at card text the server
 * finds, and at student text the server finds. This is what stops "the model
 * thinks it knows better than the card" from ever reaching the student as an
 * error (spec §3.1).
 */
export function verifyContradiction(
  raw: DrillCheckOutput['contradictions'][number],
  anchorsByKey: ReadonlyMap<string, AnchorCard>,
  answerText: string,
): Contradiction | null {
  const card = anchorsByKey.get(raw.card_key);
  if (!card) return null;
  if (!verifyQuote(raw.card_says, cardText(card))) return null;
  if (!verifyQuote(raw.statement, answerText)) return null;
  return {
    statement: stripRedactions(raw.statement),
    cardId: card.id,
    cardSays: raw.card_says.trim(),
  };
}

export function reconcileDiagnostic(
  raw: DrillCheckOutput,
  ctx: { requiredLinks: RequiredLink[]; anchors: AnchorCard[]; answerText: string },
): ReconciledDiagnostic {
  const anchorsByKey = new Map(ctx.anchors.map((card) => [card.key, card]));

  // Coverage: exactly the drill's links, in the drill's order. Unknown ids are
  // dropped; absent ids are `missing`. A quote the server cannot find is
  // nulled but the status stands — coverage drives no card state, so a
  // paraphrased quote is not worth a false negative.
  const rawByLinkId = new Map(raw.coverage.map((entry) => [entry.link_id, entry]));
  const coverage: LinkCoverage[] = ctx.requiredLinks.map((link) => {
    const entry = rawByLinkId.get(link.id);
    if (!entry) return { linkId: link.id, status: 'missing', evidence: null };
    const evidence = entry.status !== 'missing' && verifyQuote(entry.evidence, ctx.answerText)
      ? stripRedactions(entry.evidence ?? '')
      : null;
    return { linkId: link.id, status: entry.status, evidence };
  });

  const contradictions: Contradiction[] = [];
  const outsideClaims: OutsideClaim[] = [];

  for (const entry of raw.contradictions) {
    const verified = verifyContradiction(entry, anchorsByKey, ctx.answerText);
    if (verified) {
      contradictions.push(verified);
      continue;
    }
    // Could not be pinned to card text: it is an outside claim, and the model's
    // own words about it are the best assessment available — but it is never
    // presented as verified.
    outsideClaims.push({
      statement: stripRedactions(entry.statement),
      verified: false,
      aiAssessment: stripRedactions(entry.card_says),
      termSuggestion: '',
    });
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
      claimPresent: raw.structure.claim_present,
      tradeoffPresent: raw.structure.tradeoff_present,
    },
    gapNote: stripRedactions(raw.gap_note).slice(0, 400),
    integrity: {
      injectionDetected: raw.injection_detected,
      offTarget: raw.off_target,
    },
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
