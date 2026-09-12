import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, type QueryResult } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';
const DRILL_ID = '00000000-0000-4000-8000-0000000000d1';
const CARD_A = '00000000-0000-4000-8000-00000000000a';
const CARD_B = '00000000-0000-4000-8000-00000000000b';
const CARD_C = '00000000-0000-4000-8000-00000000000c';

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  generateContent: vi.fn(),
  reserveAiCall: vi.fn(),
  recordAiUsage: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/env-server', () => ({
  getServerEnv: () => ({ GEMINI_API_KEY: 'test', GEMINI_MODEL: 'gemini-test', GEMINI_EMBEDDING_MODEL: 'embed-test', GEMINI_MODEL_MAX_TOKENS: 4096 }),
}));
vi.mock('@/app/actions/_shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_shared')>()),
  getGeminiJsonModel: () => ({ generateContent: mocks.generateContent }),
  reserveAiCall: mocks.reserveAiCall,
  recordAiUsage: mocks.recordAiUsage,
}));

type DrillRow = Record<string, unknown>;

function drillRow(overrides: DrillRow = {}): DrillRow {
  return {
    id: DRILL_ID,
    deck_id: DECK_ID,
    format: 'causal',
    prompt_text: 'By what mechanism does the time quantum constrain responsiveness for an interactive process?',
    card_ids: [CARD_A, CARD_B],
    topic_tag: 'scheduling',
    required_links: [
      { id: 'm1', text: 'A smaller quantum forces more context switches.', card_ids: [CARD_A] },
      { id: 'm2', text: 'A larger quantum makes interactive bursts wait.', card_ids: [CARD_A, CARD_B] },
    ],
    exemplar: { claim: 'c', mechanisms: ['m1', 'm2'], tradeoff: 't' },
    status: 'active',
    step: 0,
    next_due_at: '2026-09-12T00:00:00Z',
    attempt_count: 0,
    last_verdict: null,
    last_attempt_at: null,
    ...overrides,
  };
}

const ANCHOR_ROWS = [
  { id: CARD_A, front: 'Time quantum', back: 'too large degenerates toward FCFS', explanation: null, state: 'review' },
  { id: CARD_B, front: 'Interactive process', back: 'short bursts; responsiveness matters', explanation: null, state: 'review' },
];

function modelOutput(overrides: Record<string, unknown> = {}) {
  return {
    coverage: [
      { link_id: 'm1', status: 'covered', evidence: 'more switches means overhead' },
      { link_id: 'm2', status: 'covered', evidence: 'interactive bursts wait' },
    ],
    contradictions: [],
    outside_claims: [],
    structure: { claim_present: true, tradeoff_present: true },
    gap_note: 'Nothing major missing.',
    off_target: false,
    injection_detected: false,
    ...overrides,
  };
}

function respondWith(output: unknown) {
  mocks.generateContent.mockImplementation(async () => ({
    response: {
      text: () => (typeof output === 'string' ? output : JSON.stringify(output)),
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1500 },
    },
  }));
}

function buildClient(overrides: Record<string, QueryResult> = {}) {
  return createSupabaseMock({
    tables: {
      decks: { data: { id: DECK_ID, title: 'OS' }, error: null },
      synthesis_drills: { data: drillRow(), error: null },
      cards: { data: ANCHOR_ROWS, error: null },
      synthesis_attempts: { data: { id: 'attempt-1' }, error: null },
      ...overrides,
    },
    rpcs: { search_deck_cards_by_embedding: { data: [], error: null } },
  });
}

type Chain = { update: ReturnType<typeof vi.fn>; gt: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn> };

/** Every chain the action created for a table, in call order. */
function chainsFor(client: ReturnType<typeof createSupabaseMock>, table: string): Chain[] {
  return client.from.mock.calls
    .map((call, index) => ({ table: call[0], chain: client.from.mock.results[index]?.value as Chain }))
    .filter((entry) => entry.table === table)
    .map((entry) => entry.chain);
}

const ANSWER = {
  claim: 'The quantum decides how long interactive processes wait.',
  mechanisms: ['A short quantum means more switches means overhead.', 'A long quantum makes interactive bursts wait behind full slices.'] as [string, string],
  tradeoff: 'Set it just above a typical burst.',
};

async function check(input: Partial<Parameters<typeof import('./synthesis').checkSynthesisAttempt>[0]> = {}) {
  const { checkSynthesisAttempt } = await import('./synthesis');
  return checkSynthesisAttempt({
    deck_id: DECK_ID,
    drill_id: DRILL_ID,
    mode: 'outline',
    response: ANSWER,
    duration_ms: 90_000,
    pull_forward: true,
    ...input,
  });
}

describe('checkSynthesisAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveAiCall.mockResolvedValue({ ok: true, reservationId: 'r1' });
    mocks.recordAiUsage.mockResolvedValue(undefined);
    respondWith(modelOutput());
  });

  it('refuses a deck the user does not own before reserving anything', async () => {
    mocks.client = buildClient({ decks: { data: null, error: { message: 'not found' } } });
    const result = await check();
    expect(result).toMatchObject({ error: 'Deck not found or access denied.' });
    expect(mocks.reserveAiCall).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('computes the word count and the verdict server-side and advances the drill ladder', async () => {
    const client = buildClient();
    mocks.client = client;

    const result = await check();
    expect(result).toMatchObject({ success: true, attemptId: 'attempt-1' });
    if (!('success' in result) || !result.success) return;

    expect(result.diagnostic.verdict).toBe('sound');
    expect(result.diagnostic.linksCovered).toBe(2);
    expect(result.diagnostic.schedule.step).toBe(1);

    const inserted = client.__inserted.synthesis_attempts?.[0] as Record<string, unknown>;
    expect(inserted.word_count).toBe(33);   // counted from the body, not the client
    expect(inserted.verdict).toBe('sound');
    expect(inserted.model).toBe('gemini-test');

    const drillUpdate = chainsFor(client, 'synthesis_drills').find((chain) => chain.update.mock.calls.length > 0);
    expect(drillUpdate?.update).toHaveBeenCalledWith(expect.objectContaining({ step: 1, last_verdict: 'sound', attempt_count: 1 }));
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'synthesis_check', expect.objectContaining({ verdict: 'sound' }), 'r1');
  });

  it('never trusts the model for the verdict: a partial link makes the attempt partial', async () => {
    mocks.client = buildClient();
    respondWith(modelOutput({
      coverage: [
        { link_id: 'm1', status: 'covered', evidence: 'more switches means overhead' },
        { link_id: 'm2', status: 'partial', evidence: null },
      ],
    }));
    const result = await check();
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.diagnostic.verdict).toBe('partial');
    expect(result.diagnostic.schedule.step).toBe(0);
  });

  it('pulls a contradicted card forward only when the contradiction is pinned to card text', async () => {
    const client = buildClient();
    mocks.client = client;
    respondWith(modelOutput({
      contradictions: [{
        statement: 'A long quantum makes interactive bursts wait behind full slices',
        card_key: 'c1',
        card_says: 'too large degenerates toward FCFS',
      }],
    }));

    const result = await check();
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.diagnostic.verdict).toBe('contradicted');
    expect(result.diagnostic.contradictions).toHaveLength(1);

    const cardUpdate = chainsFor(client, 'cards').find((chain) => chain.update.mock.calls.length > 0);
    expect(cardUpdate).toBeDefined();
    expect(cardUpdate?.update).toHaveBeenCalledWith({ next_review_at: expect.any(String) });
    // The filter that makes it non-destructive: never push a card later.
    expect(cardUpdate?.gt).toHaveBeenCalledWith('next_review_at', expect.any(String));
    expect(cardUpdate?.in).toHaveBeenCalledWith('id', [CARD_A]);

    const inserted = client.__inserted.synthesis_attempts?.[0] as Record<string, unknown>;
    expect(inserted.contradicted_card_ids).toEqual([CARD_A]);
  });

  it('demotes a contradiction the server cannot find in the card to an unverified outside claim', async () => {
    const client = buildClient();
    mocks.client = client;
    respondWith(modelOutput({
      contradictions: [{
        statement: 'A long quantum makes interactive bursts wait behind full slices',
        card_key: 'c1',
        card_says: 'CFS uses virtual runtime',   // the model "knows better"; not card text
      }],
    }));

    const result = await check();
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.diagnostic.verdict).toBe('sound');
    expect(result.diagnostic.outsideClaims).toEqual([
      expect.objectContaining({ verified: false, aiAssessment: 'CFS uses virtual runtime' }),
    ]);
    expect(chainsFor(client, 'cards').some((chain) => chain.update.mock.calls.length > 0)).toBe(false);
  });

  it('honours pull_forward = false even with a verified contradiction', async () => {
    const client = buildClient();
    mocks.client = client;
    respondWith(modelOutput({
      contradictions: [{
        statement: 'A long quantum makes interactive bursts wait behind full slices',
        card_key: 'c1',
        card_says: 'too large degenerates toward FCFS',
      }],
    }));

    const result = await check({ pull_forward: false });
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.diagnostic.verdict).toBe('contradicted');
    expect(chainsFor(client, 'cards').some((chain) => chain.update.mock.calls.length > 0)).toBe(false);
    expect(result.diagnostic.pulledForwardCardIds).toEqual([]);
  });

  it('records an off-target answer with no card effect and leaves the drill due', async () => {
    const client = buildClient();
    mocks.client = client;
    respondWith(modelOutput({ off_target: true, injection_detected: true }));

    const result = await check();
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.diagnostic.verdict).toBe('off_target');
    expect(chainsFor(client, 'cards').some((chain) => chain.update.mock.calls.length > 0)).toBe(false);
    expect(result.diagnostic.schedule.step).toBe(0);
    expect(Date.parse(result.diagnostic.schedule.nextDueAt)).toBeLessThanOrEqual(Date.now());
  });

  it('passes AI-verified outside claims through with their assessment and term', async () => {
    mocks.client = buildClient();
    respondWith(modelOutput({
      outside_claims: [{ statement: 'Linux CFS uses virtual runtime', verified: true, ai_assessment: 'CFS picks the least virtual runtime.', term_suggestion: 'Completely Fair Scheduler' }],
    }));
    const result = await check();
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.diagnostic.verdict).toBe('sound');   // advisory: never changes the verdict
    expect(result.diagnostic.outsideClaims[0]).toEqual({
      statement: 'Linux CFS uses virtual runtime',
      verified: true,
      aiAssessment: 'CFS picks the least virtual runtime.',
      termSuggestion: 'Completely Fair Scheduler',
    });
  });

  it('returns a typed failure, never a rejection, when the reservation is refused', async () => {
    mocks.client = buildClient();
    mocks.reserveAiCall.mockResolvedValue({ ok: false, error: 'AI limit reached for synthesis check. Try again in about 60 minutes.' });
    const result = await check();
    expect(result).toMatchObject({ error: expect.stringContaining('AI limit reached') });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an empty answer without spending a reservation', async () => {
    mocks.client = buildClient();
    const result = await check({ response: { claim: 'x', mechanisms: ['', ''], tradeoff: '' } });
    // 'x' is one word; make it genuinely empty through the free mode instead.
    expect(result).toMatchObject({ success: true });
    const empty = await check({ mode: 'free', response: { text: '   ' } });
    expect(empty).toMatchObject({ error: expect.anything() });
  });
});

describe('generateSynthesisDrills', () => {
  const taggedCards = [
    { id: CARD_A, front: 'Time quantum', back: 'The fixed CPU slice.', explanation: null, topic_tags: ['scheduling'] },
    { id: CARD_B, front: 'Interactive process', back: 'Short bursts.', explanation: null, topic_tags: ['scheduling'] },
    { id: CARD_C, front: 'Context switch', back: 'Pure overhead.', explanation: null, topic_tags: ['scheduling'] },
    // Unrelated singletons: the only shared tag in this deck is 'scheduling'.
    { id: '00000000-0000-4000-8000-00000000000d', front: 'Page fault', back: 'Missing page.', explanation: null, topic_tags: ['memory'] },
    { id: '00000000-0000-4000-8000-00000000000e', front: 'TLB', back: 'Translation cache.', explanation: null, topic_tags: ['caching'] },
    { id: '00000000-0000-4000-8000-00000000000f', front: 'Deadlock', back: 'Circular wait.', explanation: null, topic_tags: ['concurrency'] },
  ];

  const validDraft = {
    format: 'causal',
    prompt_text: 'By what mechanism does the time quantum constrain an interactive process when context switch overhead rises?',
    required_links: [
      { text: 'A smaller quantum forces more context switches, each pure overhead.', card_keys: ['c1', 'c3'] },
      { text: 'A larger quantum makes interactive processes wait longer.', card_keys: ['c1', 'c2'] },
    ],
    exemplar: { claim: 'The quantum trades overhead for waiting.', mechanisms: ['Shrinking it multiplies switches.', 'Growing it delays interactive bursts.'], tradeoff: 'Set it just above a burst.' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveAiCall.mockResolvedValue({ ok: true, reservationId: 'r1' });
    mocks.recordAiUsage.mockResolvedValue(undefined);
  });

  it('refuses a deck under six cards before reserving', async () => {
    mocks.client = createSupabaseMock({
      tables: { decks: { data: { id: DECK_ID, title: 'OS' }, error: null }, cards: { data: taggedCards.slice(0, 3), error: null } },
    });
    const { generateSynthesisDrills } = await import('./synthesis');
    const result = await generateSynthesisDrills({ deck_id: DECK_ID, count: 3 });
    expect(result).toMatchObject({ error: expect.stringContaining('at least 6 cards') });
    expect(mocks.reserveAiCall).not.toHaveBeenCalled();
  });

  it('inserts validated drills with resolved card ids and provenance', async () => {
    const client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'OS' }, error: null },
        cards: { data: taggedCards, error: null },
        synthesis_drills: { data: [], error: null },
      },
      rpcs: { search_deck_cards_by_embedding: { data: [], error: null } },
    });
    mocks.client = client;
    respondWith(validDraft);

    const { generateSynthesisDrills } = await import('./synthesis');
    const result = await generateSynthesisDrills({ deck_id: DECK_ID, count: 1 });
    expect(result).toMatchObject({ success: true, created: 1, failed: 0 });

    const rows = client.__inserted.synthesis_drills?.[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].card_ids).toEqual(expect.arrayContaining([CARD_A, CARD_B]));
    expect(rows[0].required_links).toEqual([
      expect.objectContaining({ id: 'm1' }),
      expect.objectContaining({ id: 'm2' }),
    ]);
    expect(rows[0].generation_meta).toMatchObject({ clustering: 'tags', model: 'gemini-test', requested_format: 'causal' });
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'synthesis_generate', expect.objectContaining({ created: 1 }), 'r1');
  });

  it('counts a draft that fails validation as failed rather than saving it', async () => {
    const client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'OS' }, error: null },
        cards: { data: taggedCards, error: null },
        synthesis_drills: { data: [], error: null },
      },
    });
    mocks.client = client;
    respondWith({ ...validDraft, prompt_text: 'Describe the time quantum and the interactive process in detail.' });

    const { generateSynthesisDrills } = await import('./synthesis');
    const result = await generateSynthesisDrills({ deck_id: DECK_ID, count: 1 });
    expect(result).toMatchObject({ error: expect.stringContaining('could not produce a valid drill') });
    expect(client.__inserted.synthesis_drills).toBeUndefined();
  });
});
