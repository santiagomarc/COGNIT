import { describe, expect, it } from 'vitest';
import { drillCheckOutputSchema, type DrillCheckOutput } from './schemas';
import type { AnchorCard, RequiredLink } from './types';
import { computeBand, computeVerdict, countCovered, deriveCardIdSets, mergeReconciled, reconcileDiagnostic, verifyContradiction } from './verdict';

const ANCHORS: AnchorCard[] = [
  { id: 'id-a', key: 'c1', term: 'Time quantum', definition: 'too large degenerates toward FCFS', explanation: null, state: 'review' },
  { id: 'id-b', key: 'c2', term: 'Interactive process', definition: 'Short CPU bursts; responsiveness matters more than throughput', explanation: null, state: 'new' },
];

const LINKS: RequiredLink[] = [
  { id: 'm1', text: 'link one', cardIds: ['id-a'], kind: 'mechanism', core: true },
  { id: 'm2', text: 'link two', cardIds: ['id-a', 'id-b'], kind: 'mechanism', core: true },
  { id: 'm3', text: 'link three', cardIds: ['id-b'], kind: 'condition', core: true },
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
  it('keeps every drill link in order, nulls unverifiable evidence, and keeps a partial status', () => {
    const result = reconcileDiagnostic(raw(), { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER });
    expect(result.coverage.map((c) => c.linkId)).toEqual(['m1', 'm2', 'm3']);
    expect(result.coverage[0]).toEqual({ linkId: 'm1', status: 'covered', evidence: 'Each switch is overhead' });
    expect(result.coverage[1]).toEqual({ linkId: 'm2', status: 'partial', evidence: null });
    expect(result.demotedCovered).toBe(0);
  });

  it('demotes a covered link whose evidence cannot be found in the answer to partial, and counts it', () => {
    const result = reconcileDiagnostic(
      raw({ coverage: [
        { link_id: 'm1', status: 'covered', evidence: 'words that are not in the answer at all' },
        { link_id: 'm2', status: 'covered', evidence: null },
        { link_id: 'm3', status: 'covered', evidence: 'as responsive as the feedback queue' },
      ] }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.coverage.map((c) => c.status)).toEqual(['partial', 'partial', 'covered']);
    expect(result.demotedCovered).toBe(2);
    expect(computeVerdict(result, LINKS)).toBe('partial');
  });

  it('fills a link the model omitted as missing and drops ids the drill does not have', () => {
    const result = reconcileDiagnostic(
      raw({ coverage: [{ link_id: 'm4', status: 'covered', evidence: null }, { link_id: 'm1', status: 'covered', evidence: 'Each switch is overhead' }] }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.coverage.map((c) => [c.linkId, c.status])).toEqual([['m1', 'covered'], ['m2', 'missing'], ['m3', 'missing']]);
  });
});

describe('verifyContradiction', () => {
  it('stands only when card_says is in the card and the statement is in the answer', () => {
    const byKey = new Map(ANCHORS.map((a) => [a.key, a]));
    const ok = verifyContradiction(
      { statement: 'A large quantum keeps round-robin as responsive as the feedback queue', card_key: 'c1', card_says: 'too large degenerates toward FCFS', kind: 'other' },
      byKey, ANSWER,
    );
    expect(ok).toEqual({ statement: 'A large quantum keeps round-robin as responsive as the feedback queue', cardId: 'id-a', cardSays: 'too large degenerates toward FCFS', kind: 'other' });

    // The model "knows better" than the card: the quote is not card text.
    expect(verifyContradiction({ statement: 'A large quantum keeps round-robin as responsive as the feedback queue', card_key: 'c1', card_says: 'CFS uses virtual runtime', kind: 'other' }, byKey, ANSWER)).toBeNull();
    // Unknown key.
    expect(verifyContradiction({ statement: 'Each switch is overhead', card_key: 'c9', card_says: 'too large degenerates', kind: 'other' }, byKey, ANSWER)).toBeNull();
    // Statement not actually in the answer.
    expect(verifyContradiction({ statement: 'Aging prevents starvation', card_key: 'c1', card_says: 'too large degenerates', kind: 'other' }, byKey, ANSWER)).toBeNull();
  });
});

describe('reconcileDiagnostic — contradictions and outside claims', () => {
  it('drops a contradiction the card does not say and counts it, without inventing an outside claim', () => {
    const result = reconcileDiagnostic(
      raw({ contradictions: [{ statement: 'Each switch is overhead', card_key: 'c1', card_says: 'switches are free', kind: 'other' }] }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.contradictions).toEqual([]);
    expect(result.outsideClaims).toEqual([]);
    expect(result.droppedContradictions).toBe(1);
  });

  it('accepts a contradiction quoted loosely and shows the located card and answer spans verbatim', () => {
    const result = reconcileDiagnostic(
      raw({ contradictions: [{
        statement: 'large quantum keep round robin responsive as feedback queue',
        card_key: 'c2',
        card_says: 'short CPU burst; responsiveness matter more than throughput',
        kind: 'other',
      }] }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.contradictions).toEqual([{
      statement: 'large quantum keeps round-robin as responsive as the feedback queue',
      cardId: 'id-b',
      cardSays: 'Short CPU bursts; responsiveness matters more than throughput',
      kind: 'other',
    }]);
    expect(result.droppedContradictions).toBe(0);
  });

  it('passes AI-verified outside claims through, stripping redaction artefacts and capping at three', () => {
    const claim = (n: number) => ({ statement: `claim ${n} [redacted] here`, verified: n % 2 === 0, ai_assessment: 'Because so.', term_suggestion: 'Term' });
    const result = reconcileDiagnostic(
      raw({ outside_claims: [claim(1), claim(2), claim(3)], contradictions: [{ statement: 'Each switch is overhead', card_key: 'c1', card_says: 'nope nope nope', kind: 'other' }] }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.outsideClaims).toHaveLength(3);
    expect(result.outsideClaims[0]).toEqual({ statement: 'claim 1 here', verified: false, aiAssessment: 'Because so.', termSuggestion: 'Term' });
  });

  it('lets an empty outline slot override the model on claim and trade-off presence', () => {
    const result = reconcileDiagnostic(
      raw({ structure: { claim_present: true, tradeoff_present: true } }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER, slots: { claim: false, tradeoff: true } },
    );
    expect(result.structure).toEqual({ claimPresent: false, tradeoffPresent: true });
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
    expect(computeVerdict(sound, LINKS)).toBe('sound');
  });

  it('lets a non-core link be partial, never missing, and never a core one', () => {
    const links: RequiredLink[] = [
      { id: 'm1', text: 'core', cardIds: ['id-a'], kind: 'mechanism', core: true },
      { id: 'm2', text: 'evidence', cardIds: ['id-a'], kind: 'evidence', core: false },
      { id: 'm3', text: 'boundary', cardIds: ['id-b'], kind: 'condition', core: true },
    ];
    const coverage = (statuses: ('covered' | 'partial' | 'missing')[]) =>
      statuses.map((status, index) => ({ linkId: `m${index + 1}`, status, evidence: null }));
    const okIntegrity = { injectionDetected: false, offTarget: false };

    expect(computeVerdict({ coverage: coverage(['covered', 'partial', 'covered']), contradictions: [], integrity: okIntegrity }, links)).toBe('sound');
    expect(computeVerdict({ coverage: coverage(['covered', 'missing', 'covered']), contradictions: [], integrity: okIntegrity }, links)).toBe('partial');
    expect(computeVerdict({ coverage: coverage(['covered', 'covered', 'partial']), contradictions: [], integrity: okIntegrity }, links)).toBe('partial');
    // Without link metadata every link is core: the original rule.
    expect(computeVerdict({ coverage: coverage(['covered', 'partial', 'covered']), contradictions: [], integrity: okIntegrity })).toBe('partial');
  });

  it('strips link and card ids from the gap note and assessments', () => {
    const result = reconcileDiagnostic(
      raw({
        gap_note: 'You miss the tuning link (m3) and card c1 says otherwise. Ask: what is the quantum just above?',
        outside_claims: [{ statement: 'CFS uses virtual runtime', verified: true, ai_assessment: 'True; unrelated to m2.', term_suggestion: 'CFS' }],
      }),
      { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER },
    );
    expect(result.gapNote).toBe('You miss the tuning link and card says otherwise. Ask: what is the quantum just above?');
    expect(result.outsideClaims[0].aiAssessment).toBe('True; unrelated to.');
  });

  it('is contradicted when a verified contradiction exists, regardless of coverage', () => {
    const sound = { ...base, coverage: base.coverage.map((c) => ({ ...c, status: 'covered' as const })) };
    expect(computeVerdict({ ...sound, contradictions: [{ statement: 's', cardId: 'id-a', cardSays: 'c', kind: 'other' }] })).toBe('contradicted');
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
    const sets = deriveCardIdSets(result.coverage, LINKS, [{ statement: 's', cardId: 'id-a', cardSays: 'c', kind: 'other' }]);
    expect(sets).toEqual({ missingCardIds: ['id-b'], contradictedCardIds: ['id-a'] });
    expect(countCovered(result.coverage)).toBe(1);
  });
});

describe('computeBand (plan D15)', () => {
  const links: RequiredLink[] = [
    { id: 'm1', text: 'point', cardIds: ['id-a'], kind: 'mechanism', core: true },
    { id: 'm2', text: 'point', cardIds: ['id-a'], kind: 'mechanism', core: true },
    { id: 'm3', text: 'evidence', cardIds: ['id-b'], kind: 'evidence', core: false },
    { id: 'm4', text: 'judgement', cardIds: ['id-b'], kind: 'evaluation', core: true },
  ];
  const cov = (statuses: ('covered' | 'partial' | 'missing')[]) => statuses.map((status, index) => ({ linkId: `m${index + 1}`, status, evidence: null }));
  const ok = { injectionDetected: false, offTarget: false };
  const structure = { claimPresent: true, tradeoffPresent: true };

  it('is null off target, developing under half the core points or on a contradiction, secure with every core point, strong with evidence, evaluation and structure', () => {
    expect(computeBand({ coverage: cov(['covered', 'covered', 'covered', 'covered']), contradictions: [], structure, integrity: { injectionDetected: false, offTarget: true } }, links, { conclusionPresent: true })).toBeNull();
    expect(computeBand({ coverage: cov(['covered', 'missing', 'missing', 'missing']), contradictions: [], structure, integrity: ok }, links, { conclusionPresent: true })).toBe('developing');
    expect(computeBand({ coverage: cov(['covered', 'covered', 'covered', 'covered']), contradictions: [{ statement: 's', cardId: 'id-a', cardSays: 'c', kind: 'other' }], structure, integrity: ok }, links, { conclusionPresent: true })).toBe('developing');
    // Every core point covered but the evidence missing: secure, not strong.
    expect(computeBand({ coverage: cov(['covered', 'covered', 'missing', 'covered']), contradictions: [], structure, integrity: ok }, links, { conclusionPresent: true })).toBe('secure');
    // Every core point present, one only thinly: secure. A core point missing: developing.
    expect(computeBand({ coverage: cov(['covered', 'partial', 'covered', 'covered']), contradictions: [], structure, integrity: ok }, links, { conclusionPresent: true })).toBe('secure');
    expect(computeBand({ coverage: cov(['covered', 'covered', 'covered', 'missing']), contradictions: [], structure, integrity: ok }, links, { conclusionPresent: true })).toBe('developing');
    // Everything, with a thesis, a judgement and a conclusion: strong.
    expect(computeBand({ coverage: cov(['covered', 'covered', 'partial', 'covered']), contradictions: [], structure, integrity: ok }, links, { conclusionPresent: true })).toBe('strong');
    // The same without a conclusion, or with a thesis that does not answer the question: secure.
    expect(computeBand({ coverage: cov(['covered', 'covered', 'partial', 'covered']), contradictions: [], structure, integrity: ok }, links, { conclusionPresent: false })).toBe('secure');
    expect(computeBand({ coverage: cov(['covered', 'covered', 'partial', 'covered']), contradictions: [], structure: { claimPresent: false, tradeoffPresent: true }, integrity: ok }, links, { conclusionPresent: true })).toBe('secure');
  });
});

describe('mergeReconciled (audit G6)', () => {
  it('takes the conservative status per link, unions contradictions, ands structure and ors integrity', () => {
    const a = reconcileDiagnostic(raw({
      coverage: [
        { link_id: 'm1', status: 'covered', evidence: 'Each switch is overhead' },
        { link_id: 'm2', status: 'covered', evidence: 'as responsive as the feedback queue' },
        { link_id: 'm3', status: 'missing', evidence: null },
      ],
      contradictions: [{ statement: 'A large quantum keeps round-robin as responsive as the feedback queue', card_key: 'c1', card_says: 'too large degenerates toward FCFS', kind: 'other' }],
      structure: { claim_present: true, tradeoff_present: true },
    }), { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER });
    const b = reconcileDiagnostic(raw({
      coverage: [
        { link_id: 'm1', status: 'covered', evidence: 'Each switch is overhead' },
        { link_id: 'm2', status: 'missing', evidence: null },
        { link_id: 'm3', status: 'partial', evidence: null },
      ],
      structure: { claim_present: true, tradeoff_present: false },
      off_target: false,
    }), { requiredLinks: LINKS, anchors: ANCHORS, answerText: ANSWER });

    const merged = mergeReconciled(a, b);
    expect(merged.coverage.map((entry) => entry.status)).toEqual(['covered', 'partial', 'partial']);
    expect(merged.coverage[1].evidence).toBe('as responsive as the feedback queue');
    expect(merged.contradictions).toHaveLength(1);
    expect(merged.structure).toEqual({ claimPresent: true, tradeoffPresent: false });
    expect(merged.integrity).toEqual({ injectionDetected: false, offTarget: false });
    expect(mergeReconciled(a, a).coverage.map((entry) => entry.status)).toEqual(['covered', 'covered', 'missing']);
  });
});
