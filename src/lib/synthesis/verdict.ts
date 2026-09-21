/**
 * Server reconciliation of the model's diagnostic, and the verdict (spec §7.4).
 *
 * The model classifies; this module decides. Every quote is checked against
 * the text it claims to come from, unknown keys are dropped, and the verdict
 * is derived — never read — from what survives.
 */

import { findQuote, stripKeyIds, stripRedactions } from '@/lib/synthesis/text';
import type { DrillCheckOutput } from '@/lib/synthesis/schemas';
import type {
  AnchorCard,
  Band,
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
  /** `covered` statuses demoted to `partial` because no evidence could be located in the answer (plan D4). */
  demotedCovered: number;
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
    kind: raw.kind ?? 'other',
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
  // dropped; absent ids are `missing`. A `covered` the server cannot back
  // with a quote found in the answer — verbatim or located — is demoted to
  // `partial`: coverage drives the ladder, and an unsupported pass is the one
  // path a hallucinated grade could take to it (plan D4). A `partial` needs
  // no quote: a paraphrase the matcher missed is not worth a false negative.
  const rawByLinkId = new Map(raw.coverage.map((entry) => [entry.link_id, entry]));
  let demotedCovered = 0;
  const coverage: LinkCoverage[] = ctx.requiredLinks.map((link) => {
    const entry = rawByLinkId.get(link.id);
    if (!entry) return { linkId: link.id, status: 'missing', evidence: null };
    const located = entry.status !== 'missing' ? findQuote(entry.evidence, ctx.answerText) : null;
    if (entry.status === 'covered' && !located) {
      demotedCovered += 1;
      return { linkId: link.id, status: 'partial', evidence: null };
    }
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
      aiAssessment: stripKeyIds(stripRedactions(entry.ai_assessment)).slice(0, 300),
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
    gapNote: stripKeyIds(stripRedactions(raw.gap_note)).slice(0, 400),
    integrity: {
      injectionDetected: raw.injection_detected,
      offTarget: raw.off_target,
    },
    droppedContradictions,
    demotedCovered,
  };
}

/**
 * Never requested from, or overridden by, the model. `sound` needs no link
 * missing and every core link covered; a non-core link may be partial
 * (plan D4). Without link metadata every link is core — the original rule.
 */
export function computeVerdict(
  d: Pick<ReconciledDiagnostic, 'coverage' | 'contradictions' | 'integrity'>,
  links?: readonly Pick<RequiredLink, 'id' | 'core'>[],
): DrillVerdict {
  if (d.integrity.injectionDetected || d.integrity.offTarget) return 'off_target';
  if (d.contradictions.length > 0) return 'contradicted';
  const coreById = new Map((links ?? []).map((link) => [link.id, link.core]));
  const sound = d.coverage.every((entry) => {
    if (entry.status === 'missing') return false;
    const core = coreById.get(entry.linkId) ?? true;
    return core ? entry.status === 'covered' : true;
  });
  return sound ? 'sound' : 'partial';
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

/**
 * The examiner's band for an essay plan (plan D15), computed from the same
 * reconciled diagnostic as the verdict:
 *
 *   developing  a core point missing, fewer than half the core points
 *               covered, or a contradiction
 *   secure      every core point at least partial and at least half covered —
 *               every required point is there, some of them thinly
 *   strong      every core point covered, every evidence point at least
 *               partial, every evaluation point covered, a thesis that
 *               answers the question, a judgement, and a conclusion
 *
 * Null when the attempt was off target: there is nothing to band.
 */
export function computeBand(
  d: Pick<ReconciledDiagnostic, 'coverage' | 'contradictions' | 'structure' | 'integrity'>,
  links: readonly RequiredLink[],
  options: { conclusionPresent: boolean },
): Band | null {
  if (d.integrity.injectionDetected || d.integrity.offTarget) return null;
  const statusById = new Map(d.coverage.map((entry) => [entry.linkId, entry.status]));
  const status = (link: RequiredLink) => statusById.get(link.id) ?? 'missing';
  const core = links.filter((link) => link.core);
  const coreCovered = core.filter((link) => status(link) === 'covered').length;
  const coreMissing = core.some((link) => status(link) === 'missing');

  if (d.contradictions.length > 0 || coreMissing || coreCovered * 2 < core.length) return 'developing';
  if (coreCovered < core.length) return 'secure';

  const evidenceOk = links.filter((link) => link.kind === 'evidence').every((link) => status(link) !== 'missing');
  const evaluationOk = links.filter((link) => link.kind === 'evaluation').every((link) => status(link) === 'covered');
  const structureOk = d.structure.claimPresent && d.structure.tradeoffPresent && options.conclusionPresent;
  return evidenceOk && evaluationOk && structureOk ? 'strong' : 'secure';
}

/**
 * Two samples of the same check, merged conservatively (audit G6, plans
 * only): a link is `covered` only when both samples say so, `missing` only
 * when both do, otherwise `partial`; contradictions are the union; a
 * structure flag holds only when both agree; an integrity flag holds when
 * either raises it. The first sample's prose (gap note, outside claims) is
 * kept — two gap notes would be two opinions.
 */
export function mergeReconciled(a: ReconciledDiagnostic, b: ReconciledDiagnostic): ReconciledDiagnostic {
  const bByLink = new Map(b.coverage.map((entry) => [entry.linkId, entry]));
  const coverage: LinkCoverage[] = a.coverage.map((entry) => {
    const other = bByLink.get(entry.linkId);
    if (!other) return entry;
    if (entry.status === other.status) return entry.evidence ? entry : other;
    if (entry.status === 'missing' || other.status === 'missing') return { linkId: entry.linkId, status: 'partial', evidence: entry.evidence ?? other.evidence };
    return { linkId: entry.linkId, status: 'partial', evidence: entry.evidence ?? other.evidence };
  });

  const seen = new Set(a.contradictions.map((entry) => `${entry.cardId}|${entry.statement.toLowerCase()}`));
  const contradictions = [...a.contradictions];
  for (const entry of b.contradictions) {
    const key = `${entry.cardId}|${entry.statement.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      contradictions.push(entry);
    }
  }

  return {
    coverage,
    contradictions,
    outsideClaims: a.outsideClaims,
    structure: {
      claimPresent: a.structure.claimPresent && b.structure.claimPresent,
      tradeoffPresent: a.structure.tradeoffPresent && b.structure.tradeoffPresent,
    },
    gapNote: a.gapNote,
    integrity: {
      injectionDetected: a.integrity.injectionDetected || b.integrity.injectionDetected,
      offTarget: a.integrity.offTarget || b.integrity.offTarget,
    },
    droppedContradictions: a.droppedContradictions + b.droppedContradictions,
    demotedCovered: a.demotedCovered + b.demotedCovered,
  };
}
