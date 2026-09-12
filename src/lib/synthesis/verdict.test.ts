import { describe, expect, it } from 'vitest';
import { drillCheckOutputSchema, type DrillCheckOutput } from './schemas';
import type { AnchorCard, RequiredLink } from './types';
import { computeVerdict, countCovered, deriveCardIdSets, reconcileDiagnostic, verifyContradiction } from './verdict';

const ANCHORS: AnchorCard[] = [
  { id: 'id-a', key: 'c1', term: 'Time quantum', definition: 'too large degenerates toward FCFS', explanation: null, state: 'review' },
  { id: 'id-b', key: 'c2', term: 'Interactive process', definition: 'Short CPU bursts; responsiveness matters more than throughput', explanation: null, state: 'new' },
];

const LINKS: RequiredLink[] = [
  { id: 'm1', text: 'link one', cardIds: ['id-a'] },
  { id: 'm2', text: 'link two', cardIds: ['id-a', 'id-b'] },
  { id: 'm3', text: 'link three', cardIds: ['id-b'] },
];

const ANSWER = 'A large quantum keeps round-robin as responsive as the feedback queue. Each switch is overhead.';

function raw(overrides: Partial<DrillCheckOutput> = {}): DrillCheckOutput {
  return drillCheckOutputSchema.parse({
    coverage: [
      { link_id: 'm1', status: 'covered', evidence: 'Each switch is overhead' },
      { link_id: 'm2', status: 'partial', evidence: 'not actually in the answer' },
      { link_id: 'm3', status: 'missing', evidence: null },
    ],
    contradictions: [],
    outside_claims: [],
    structure: { claim_present: true, tradeoff_present: false },
    gap_note: 'State the sizing rule.',
    off_target: false,
    injection_detected: false,
    ...overrides,
  });
}

describe('reconcileDiagnostic — coverage', () => {
  it('keeps every drill link in order, nulls unverifiable evidence, and keeps the status', () => {
    const result = reconcileDiagnostic(raw(), { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER });
    expect(result.coverage.map((c) => c.linkId)).toEqual(['m1', 'm2', 'm3']);
    expect(result.coverage[0]).toEqual({ linkId: 'm1', status: 'covered', evidence: 'Each switch is overhead' });
    expect(result.coverage[1]).toEqual({ linkId: 'm2', status: 'partial', evidence: null });
  });

  it('fills a link the model omitted as missing and drops ids the drill does not have', () => {
    const result = reconcileDiagnostic(
      raw({ coverage: [{ link_id: 'm4', status: 'covered', evidence: null }, { link_id: 'm1', status: 'covered', evidence: null }] }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.coverage.map((c) => [c.linkId, c.status])).toEqual([['m1', 'covered'], ['m2', 'missing'], ['m3', 'missing']]);
  });
});

describe('verifyContradiction', () => {
  it('stands only when card_says is in the card and the statement is in the answer', () => {
    const byKey = new Map(ANCHORS.map((a) => [a.key, a]));
    const ok = verifyContradiction(
      { statement: 'A large quantum keeps round-robin as responsive as the feedback queue', card_key: 'c1', card_says: 'too large degenerates toward FCFS' },
      byKey, ANSWER,
    );
    expect(ok).toEqual({ statement: 'A large quantum keeps round-robin as responsive as the feedback queue', cardId: 'id-a', cardSays: 'too large degenerates toward FCFS' });

    // The model "knows better" than the card: the quote is not card text.
    expect(verifyContradiction({ statement: 'A large quantum keeps round-robin as responsive as the feedback queue', card_key: 'c1', card_says: 'CFS uses virtual runtime' }, byKey, ANSWER)).toBeNull();
    // Unknown key.
    expect(verifyContradiction({ statement: 'Each switch is overhead', card_key: 'c9', card_says: 'too large degenerates' }, byKey, ANSWER)).toBeNull();
    // Statement not actually in the answer.
    expect(verifyContradiction({ statement: 'Aging prevents starvation', card_key: 'c1', card_says: 'too large degenerates' }, byKey, ANSWER)).toBeNull();
  });
});

describe('reconcileDiagnostic — contradictions and outside claims', () => {
  it('demotes an unverifiable contradiction to an unverified outside claim', () => {
    const result = reconcileDiagnostic(
      raw({ contradictions: [{ statement: 'Each switch is overhead', card_key: 'c1', card_says: 'switches are free' }] }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.contradictions).toEqual([]);
    expect(result.outsideClaims).toEqual([{ statement: 'Each switch is overhead', verified: false, aiAssessment: 'switches are free', termSuggestion: '' }]);
  });

  it('passes AI-verified outside claims through, stripping redaction artefacts and capping at three', () => {
    const claim = (n: number) => ({ statement: `claim ${n} [redacted] here`, verified: n % 2 === 0, ai_assessment: 'Because so.', term_suggestion: 'Term' });
    const result = reconcileDiagnostic(
      raw({ outside_claims: [claim(1), claim(2), claim(3)], contradictions: [{ statement: 'Each switch is overhead', card_key: 'c1', card_says: 'nope nope nope' }] }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.outsideClaims).toHaveLength(3);
    expect(result.outsideClaims[1]).toEqual({ statement: 'claim 1 here', verified: false, aiAssessment: 'Because so.', termSuggestion: 'Term' });
  });
});

describe('computeVerdict', () => {
  const base = reconcileDiagnostic(raw(), { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER });

  it('is partial when any link is not fully covered', () => {
    expect(computeVerdict(base)).toBe('partial');
  });

  it('is sound only when every link is covered', () => {
    const sound = { ...base, coverage: base.coverage.map((c) => ({ ...c, status: 'covered' as const })) };
    expect(computeVerdict(sound)).toBe('sound');
  });

  it('is contradicted when a verified contradiction exists, regardless of coverage', () => {
    const sound = { ...base, coverage: base.coverage.map((c) => ({ ...c, status: 'covered' as const })) };
    expect(computeVerdict({ ...sound, contradictions: [{ statement: 's', cardId: 'id-a', cardSays: 'c' }] })).toBe('contradicted');
  });

  it('is off_target on injection or off-task, before anything else', () => {
    expect(computeVerdict({ ...base, integrity: { injectionDetected: true, offTarget: false } })).toBe('off_target');
    expect(computeVerdict({ ...base, integrity: { injectionDetected: false, offTarget: true } })).toBe('off_target');
  });

  it('is never affected by outside claims', () => {
    const sound = { ...base, coverage: base.coverage.map((c) => ({ ...c, status: 'covered' as const })) };
    const withOutside = { ...sound, outsideClaims: [{ statement: 'x', verified: false, aiAssessment: 'y', termSuggestion: '' }] };
    expect(computeVerdict(withOutside)).toBe('sound');
  });
});

describe('deriveCardIdSets / countCovered', () => {
  it('collects the cards behind missing links and verified contradictions', () => {
    const result = reconcileDiagnostic(raw(), { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER });
    const sets = deriveCardIdSets(result.coverage, LINKS, [{ statement: 's', cardId: 'id-a', cardSays: 'c' }]);
    expect(sets).toEqual({ missingCardIds: ['id-b'], contradictedCardIds: ['id-a'] });
    expect(countCovered(result.coverage)).toBe(1);
  });
});
