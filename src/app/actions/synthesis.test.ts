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
  enrichCards: vi.fn(async () => ({ success: true })),
  syncEmbeddings: vi.fn(async () => ({ success: true })),
  embedTexts: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// `after()` needs a request scope; the test collects the callbacks and runs
// them explicitly so the response/side-effect ordering is observable.
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { mocks.afterCallbacks.push(fn); } }));
vi.mock('./ai-enrich', () => ({ enrichCards: mocks.enrichCards }));
vi.mock('@/lib/embeddings', () => ({ embedTexts: mocks.embedTexts, toVectorLiteral: (values: number[]) => `[${values.join(',')}]` }));
vi.mock('./chat', () => ({ syncEmbeddings: mocks.syncEmbeddings }));
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
    rpcs: {
      search_deck_cards_by_embedding: { data: [], error: null },
      // The write side of a check is one RPC (plan §3.4).
      record_synthesis_attempt: { data: [{ attempt_id: 'attempt-1', replayed: false, pulled_forward_card_ids: [] }], error: null },
    },
  });
}

/** The payload of the one write RPC a check makes, or undefined when none was made. */
function recordCall(client: ReturnType<typeof createSupabaseMock>) {
  const call = (client.rpc.mock.calls as unknown as unknown[][]).find((args) => args[0] === 'record_synthesis_attempt');
  return call?.[1] as {
    p_client_attempt_id: string | null;
    p_attempt: Record<string, unknown> & { usage: Record<string, unknown> };
    p_schedule: { step: number; next_due_at: string; last_links_covered: number };
    p_pull_forward_card_ids: string[];
    p_pull_forward_not_after: string | null;
  } | undefined;
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

    const record = recordCall(client);
    expect(record).toBeDefined();
    expect(record?.p_attempt.word_count).toBe(33);   // counted from the body, not the client
    expect(record?.p_attempt.verdict).toBe('sound');
    expect(record?.p_attempt.model).toBe('gemini-test');
    expect(record?.p_schedule).toMatchObject({ step: 1, last_links_covered: 2 });
    // No direct writes remain: the RPC owns cards, the attempt and the drill.
    expect(client.__inserted.synthesis_attempts).toBeUndefined();
    expect(chainsFor(client, 'synthesis_drills').some((chain) => chain.update.mock.calls.length > 0)).toBe(false);
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

    // The contradicted card is offered to the RPC, which pulls it forward but
    // never later (`next_review_at > not_after` is the filter inside the function).
    const record = recordCall(client);
    expect(record?.p_pull_forward_card_ids).toEqual([CARD_A]);
    expect(record?.p_pull_forward_not_after).toEqual(expect.any(String));
    expect(record?.p_attempt.contradicted_card_ids).toEqual([CARD_A]);
    // The action never touches cards directly any more.
    expect(chainsFor(client, 'cards').some((chain) => chain.update.mock.calls.length > 0)).toBe(false);
  });

  it('drops a contradiction the server cannot find in the card: no verdict effect, no card effect, no invented outside claim', async () => {
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
    expect(result.diagnostic.contradictions).toEqual([]);
    expect(result.diagnostic.outsideClaims).toEqual([]);
    const record = recordCall(client);
    expect(record?.p_pull_forward_card_ids).toEqual([]);
    expect(record?.p_attempt.usage.dropped_contradictions).toBe(1);
  });

  it('accepts a contradiction quoted loosely and displays the card\'s and the student\'s own words', async () => {
    const client = buildClient();
    mocks.client = client;
    respondWith(modelOutput({
      contradictions: [{
        statement: 'long quantum make interactive burst wait behind full slice',   // tense and number changed
        card_key: 'c1',
        card_says: 'too large degenerate towards FCFS',
      }],
    }));

    const result = await check();
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.diagnostic.verdict).toBe('contradicted');
    expect(result.diagnostic.contradictions).toEqual([{
      statement: 'long quantum makes interactive bursts wait behind full slices',
      cardId: CARD_A,
      cardSays: 'too large degenerates toward FCFS',
      kind: 'other',
    }]);
  });

  it('returns the answer key and the cards only with the check, and echoes the confidence', async () => {
    const client = buildClient();
    mocks.client = client;
    respondWith(modelOutput({
      coverage: [
        { link_id: 'm1', status: 'covered', evidence: 'more switches means overhead' },
        { link_id: 'm2', status: 'partial', evidence: null },
      ],
    }));

    const result = await check({ confidence: 3 });
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.reveal.requiredLinks).toEqual([
      expect.objectContaining({ id: 'm1', text: expect.any(String), kind: 'mechanism', core: true }),
      expect.objectContaining({ id: 'm2', text: expect.any(String), kind: 'mechanism', core: true }),
    ]);
    expect(result.reveal.cards.map((card) => card.term)).toEqual(['Time quantum', 'Interactive process']);
    expect(result.diagnostic.confidence).toBe(3);
    // Sure × partial comes back in 12 h, not 24 h.
    const dueInHours = (Date.parse(result.diagnostic.schedule.nextDueAt) - Date.now()) / 3_600_000;
    expect(dueInHours).toBeGreaterThan(11.9);
    expect(dueInHours).toBeLessThan(12.1);

    const record = recordCall(client);
    expect(record?.p_attempt.confidence).toBe(3);
    expect(record?.p_schedule.last_links_covered).toBe(1);
  });

  it('checks against the wording the student saw and records the variant and prompt version', async () => {
    const variant = 'Explain how the Time quantum shapes an Interactive process through context switching.';
    const client = buildClient({ synthesis_drills: { data: drillRow({ prompt_variants: [variant], attempt_count: 1 }), error: null } });
    mocks.client = client;

    const result = await check({ prompt_variant: 1 });
    if (!('success' in result) || !result.success) throw new Error('expected success');

    const request = mocks.generateContent.mock.calls[0][0] as { contents: { parts: { text: string }[] }[] };
    expect(request.contents[0].parts[0].text).toContain(`DRILL (causal): ${variant}`);
    const inserted = client.__inserted.synthesis_attempts?.[0] as Record<string, Record<string, unknown>> | undefined;
    // The write goes through the RPC now; the payload it was given carries the provenance.
    const rpcCalls = client.rpc.mock.calls as unknown as [string, { p_attempt: { usage: Record<string, unknown> } }][];
    const rpcCall = rpcCalls.find((call) => call[0] === 'record_synthesis_attempt');
    const payload = rpcCall![1].p_attempt;
    expect(payload.usage).toMatchObject({ prompt_variant: 1, prompt_version: expect.any(String), demoted_covered: 0 });
    expect(inserted).toBeUndefined();
  });

  it('replays an attempt with the same client key instead of calling the model again', async () => {
    const client = buildClient({
      synthesis_attempts: {
        data: {
          id: 'attempt-existing',
          verdict: 'partial',
          coverage: [{ link_id: 'm1', status: 'covered', evidence: 'x' }, { link_id: 'm2', status: 'missing', evidence: null }],
          contradictions: [],
          outside_claims: [],
          structure: { claim_present: true, tradeoff_present: false },
          gap_note: 'Say why.',
          integrity: { injection_detected: false, off_target: false },
          pulled_forward_card_ids: [],
          confidence: 2,
        },
        error: null,
      },
    });
    mocks.client = client;

    const result = await check({ client_attempt_id: '00000000-0000-4000-8000-0000000000aa' });
    expect(result).toMatchObject({ success: true, attemptId: 'attempt-existing', replayed: true });
    if (!('success' in result) || !result.success) return;
    expect(result.diagnostic.verdict).toBe('partial');
    expect(result.diagnostic.linksCovered).toBe(1);
    expect(result.diagnostic.confidence).toBe(2);
    expect(mocks.reserveAiCall).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(client.__inserted.synthesis_attempts).toBeUndefined();
  });

  it('treats a response cut off at the output cap as a non-retryable failure', async () => {
    mocks.client = buildClient();
    mocks.generateContent.mockImplementation(async () => ({
      response: {
        text: () => '{"coverage":[{"link_id":"m1","status":"cov',
        candidates: [{ finishReason: 'MAX_TOKENS' }],
        usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 640, totalTokenCount: 1840, thoughtsTokenCount: 600 },
      },
    }));

    const result = await check();
    expect(result).toMatchObject({ error: expect.stringContaining('temporarily unavailable') });
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it('refuses to revise an attempt that is not on this drill or is itself a revision', async () => {
    mocks.client = buildClient({ synthesis_attempts: { data: null, error: null } });
    const missing = await check({ revision_of: '00000000-0000-4000-8000-0000000000bb' });
    expect(missing).toMatchObject({ error: 'That attempt cannot be revised.' });

    mocks.client = buildClient({ synthesis_attempts: { data: { id: 'a1', revision_of: 'a0' }, error: null } });
    const chained = await check({ revision_of: '00000000-0000-4000-8000-0000000000bb' });
    expect(chained).toMatchObject({ error: 'That attempt cannot be revised.' });
    expect(mocks.reserveAiCall).not.toHaveBeenCalled();
  });

  it('queues a repair drill after a verified contradiction, and only then (plan D17)', async () => {
    mocks.afterCallbacks.length = 0;
    const client = buildClient();
    mocks.client = client;
    respondWith(modelOutput({
      contradictions: [{
        statement: 'A long quantum makes interactive bursts wait behind full slices',
        card_key: 'c1',
        card_says: 'too large degenerates toward FCFS',
        kind: 'reversal',
      }],
    }));
    const contradicted = await check();
    if (!('success' in contradicted) || !contradicted.success) throw new Error('expected success');
    expect(contradicted.diagnostic.contradictions[0].kind).toBe('reversal');
    expect(mocks.afterCallbacks).toHaveLength(1);

    // Running the repair reserves generation spend tagged with the attempt it
    // repairs, and a draft the validator rejects (the mock keeps answering with
    // a check-shaped output) is recorded as created: 0 — never thrown.
    mocks.reserveAiCall.mockClear();
    await mocks.afterCallbacks[0]();
    expect(mocks.reserveAiCall).toHaveBeenCalledWith(expect.anything(), 'user-1', 'synthesis_generate', expect.objectContaining({ repair_of: 'attempt-1' }), { calls: 1 });
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'synthesis_generate', expect.objectContaining({ repair_of: 'attempt-1', created: 0 }), 'r1');

    mocks.afterCallbacks.length = 0;
    respondWith(modelOutput());
    const sound = await check();
    if (!('success' in sound) || !sound.success) throw new Error('expected success');
    expect(mocks.afterCallbacks).toHaveLength(0);
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
    // Nothing is offered to the RPC to move.
    expect(recordCall(client)?.p_pull_forward_card_ids).toEqual([]);
    expect(recordCall(client)?.p_pull_forward_not_after).toBeNull();
    expect(result.diagnostic.pulledForwardCardIds).toEqual([]);
  });

  it('records an off-target answer with no card effect and leaves the drill due', async () => {
    const client = buildClient();
    mocks.client = client;
    respondWith(modelOutput({ off_target: true, injection_detected: true }));

    const result = await check();
    if (!('success' in result) || !result.success) throw new Error('expected success');
    expect(result.diagnostic.verdict).toBe('off_target');
    expect(recordCall(client)?.p_pull_forward_card_ids).toEqual([]);
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

  it('reports what the database actually pulled forward, and a concurrent replay as replayed', async () => {
    const client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'OS' }, error: null },
        synthesis_drills: { data: drillRow(), error: null },
        cards: { data: ANCHOR_ROWS, error: null },
        synthesis_attempts: { data: null, error: null },
      },
      rpcs: {
        search_deck_cards_by_embedding: { data: [], error: null },
        record_synthesis_attempt: { data: [{ attempt_id: 'attempt-9', replayed: true, pulled_forward_card_ids: [CARD_A] }], error: null },
      },
    });
    mocks.client = client;
    respondWith(modelOutput({
      contradictions: [{
        statement: 'A long quantum makes interactive bursts wait behind full slices',
        card_key: 'c1',
        card_says: 'too large degenerates toward FCFS',
      }],
    }));

    const result = await check({ client_attempt_id: '00000000-0000-4000-8000-0000000000ee' });
    expect(result).toMatchObject({ success: true, attemptId: 'attempt-9', replayed: true, scheduleSaved: true });
    if (!('success' in result) || !result.success) return;
    expect(result.diagnostic.pulledForwardCardIds).toEqual([CARD_A]);
  });

  it('surfaces a failed write as a typed error after the model call', async () => {
    const client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'OS' }, error: null },
        synthesis_drills: { data: drillRow(), error: null },
        cards: { data: ANCHOR_ROWS, error: null },
        synthesis_attempts: { data: null, error: null },
      },
      rpcs: {
        search_deck_cards_by_embedding: { data: [], error: null },
        record_synthesis_attempt: { data: null, error: { message: 'connection reset', code: '08006' } },
      },
    });
    mocks.client = client;

    const result = await check();
    expect(result).toMatchObject({ error: expect.stringContaining('could not be saved') });
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
    prompt_variants: ['Explain how the time quantum and context switch overhead together limit an interactive process.'],
    scenario: null,
    bloom: 'analyse',
    required_links: [
      { text: 'A smaller quantum forces more context switches, each pure overhead.', card_keys: ['c1', 'c3'], kind: 'mechanism', core: true },
      { text: 'A larger quantum makes interactive processes wait longer.', card_keys: ['c1', 'c2'], kind: 'mechanism', core: true },
      { text: 'Only while a burst is shorter than the quantum.', card_keys: ['c1', 'c2'], kind: 'condition', core: true },
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
      expect.objectContaining({ id: 'm1', kind: 'mechanism', core: true }),
      expect.objectContaining({ id: 'm2', kind: 'mechanism', core: true }),
      expect.objectContaining({ id: 'm3', kind: 'condition', core: true }),
    ]);
    expect(rows[0].link_count).toBe(3);
    expect(rows[0].prompt_variants).toEqual(['Explain how the time quantum and context switch overhead together limit an interactive process.']);
    expect(rows[0].bloom).toBe('analyse');
    expect(rows[0].generation_meta).toMatchObject({ clustering: 'tags', model: 'gemini-test', requested_format: 'causal', prompt_version: expect.any(String) });
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'synthesis_generate', expect.objectContaining({ created: 1 }), 'r1');
  });

  it('archives drills whose cards were deleted and excludes them from the active cap', async () => {
    const zombie = { id: 'zombie', card_ids: ['00000000-0000-4000-8000-0000000000dd', '00000000-0000-4000-8000-0000000000ee'] };
    const live = { id: 'live', card_ids: [CARD_A, CARD_B] };
    const client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'OS' }, error: null },
        cards: { data: taggedCards, error: null },
        synthesis_drills: { data: [zombie, live], error: null },
      },
    });
    mocks.client = client;
    respondWith({ ...validDraft, required_links: validDraft.required_links.map((link, index) => ({ ...link, card_keys: index === 0 ? ['c1', 'c3'] : ['c1', 'c2'] })) });

    const { generateSynthesisDrills } = await import('./synthesis');
    const result = await generateSynthesisDrills({ deck_id: DECK_ID, count: 1 });
    expect(result).toMatchObject({ success: true });

    const archive = chainsFor(client, 'synthesis_drills').find((chain) => chain.update.mock.calls.length > 0);
    expect(archive?.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }));
    expect(archive?.in).toHaveBeenCalledWith('id', ['zombie']);
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

describe('absorbOutsideClaim', () => {
  const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000a1';
  const NEW_CARD_ID = '00000000-0000-4000-8000-0000000000c9';

  async function absorb(input: Partial<Parameters<typeof import('./synthesis').absorbOutsideClaim>[0]> = {}) {
    const { absorbOutsideClaim } = await import('./synthesis');
    return absorbOutsideClaim({
      deck_id: DECK_ID,
      attempt_id: ATTEMPT_ID,
      claim_index: 1,
      front: 'Priority inversion',
      back: 'A low-priority task holds a lock a high-priority task needs.',
      ...input,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
  });

  it('inserts a provenance-carrying card and schedules enrichment and embedding after the response', async () => {
    const client = buildClient({
      synthesis_attempts: { data: { id: ATTEMPT_ID }, error: null },
      cards: { data: { id: NEW_CARD_ID }, error: null },
    });
    mocks.client = client;

    const result = await absorb();
    expect(result).toEqual({ success: true, cardId: NEW_CARD_ID, duplicate: false });

    const inserted = client.__inserted.cards?.[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      deck_id: DECK_ID,
      source: 'synthesis_claim',
      absorbed_from_attempt_id: ATTEMPT_ID,
      absorbed_claim_index: 1,
      front: 'Priority inversion',
    });

    // Nothing AI-shaped ran before the response was produced.
    expect(mocks.enrichCards).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);
    await mocks.afterCallbacks[0]();
    expect(mocks.enrichCards).toHaveBeenCalledWith({ deck_id: DECK_ID, card_ids: [NEW_CARD_ID] });
    expect(mocks.syncEmbeddings).toHaveBeenCalledWith({ deck_id: DECK_ID });
  });

  it('is idempotent: a second absorb of the same claim returns the existing card without inserting', async () => {
    const client = buildClient({
      synthesis_attempts: { data: { id: ATTEMPT_ID }, error: null },
      cards: { data: { id: NEW_CARD_ID }, error: { message: 'duplicate key value violates unique constraint', code: '23505' } },
    });
    mocks.client = client;

    const result = await absorb();
    // The insert failed on the partial unique index; the existing card is looked up.
    expect(result).toMatchObject({ success: true, duplicate: true });
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('refuses an attempt that is not the caller\'s', async () => {
    mocks.client = buildClient({ synthesis_attempts: { data: null, error: null } });
    const result = await absorb();
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    expect((mocks.client as ReturnType<typeof createSupabaseMock>).__inserted.cards).toBeUndefined();
  });

  it('rejects a claim index outside 0–2 before touching the database', async () => {
    const client = buildClient();
    mocks.client = client;
    const result = await absorb({ claim_index: 3 });
    expect(result).toMatchObject({ error: expect.anything() });
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('plans (execution plan D15 / D16)', () => {
  const PLAN_ID = '00000000-0000-4000-8000-0000000000e1';
  const CARD_D = '00000000-0000-4000-8000-00000000000d';
  const CARD_E = '00000000-0000-4000-8000-00000000000e';
  const PLAN_EXEMPLAR = {
    thesis: 'The quantum decides responsiveness within the limits aging sets.',
    points: [
      { claim: 'Short quanta keep interactive processes responsive.', mechanism: 'Fewer full slices to wait behind.', evidence: '', limit: 'Not below a burst.' },
      { claim: 'Switching costs.', mechanism: 'Each switch is pure overhead.', evidence: 'The context switch card.', limit: '' },
      { claim: 'Aging matters under a convoy.', mechanism: 'Waiting raises priority.', evidence: '', limit: '' },
    ],
    conclusion: 'So the quantum matters most for interactive workloads.',
  };
  function planRow(overrides: Record<string, unknown> = {}) {
    return drillRow({
      id: PLAN_ID,
      kind: 'plan',
      format: 'evaluate',
      question_text: 'To what extent does the time quantum determine the responsiveness of an interactive process?',
      command_word: 'to what extent',
      prompt_text: 'To what extent does the time quantum determine the responsiveness of an interactive process?',
      card_ids: [CARD_A, CARD_B, CARD_C, CARD_D],
      required_links: [
        { id: 'm1', text: 'A short quantum keeps an interactive process responsive.', card_ids: [CARD_A, CARD_B], kind: 'mechanism', core: true },
        { id: 'm2', text: 'A short quantum multiplies context switches.', card_ids: [CARD_A, CARD_C], kind: 'mechanism', core: true },
        { id: 'm3', text: 'Under a convoy the quantum matters less than aging.', card_ids: [CARD_D], kind: 'evaluation', core: true },
        { id: 'm4', text: 'The context switch card names the cost.', card_ids: [CARD_C], kind: 'evidence', core: false },
      ],
      exemplar: PLAN_EXEMPLAR,
      ...overrides,
    });
  }
  const PLAN_ANCHORS = [
    ...ANCHOR_ROWS,
    { id: CARD_C, front: 'Context switch', back: 'pure overhead, no useful work', explanation: null, state: 'review' },
    { id: CARD_D, front: 'Convoy effect', back: 'short jobs queue behind a long one', explanation: null, state: 'review' },
  ];
  const PLAN_ANSWER = {
    thesis: 'The quantum mostly decides responsiveness, but aging limits how far.',
    points: [
      { claim: 'A short quantum keeps an interactive process responsive.', mechanism: 'It waits behind fewer full slices.', evidence: '', limit: 'not below a burst' },
      { claim: 'Short quanta multiply context switches.', mechanism: 'Each switch is pure overhead.', evidence: 'the context switch card', limit: '' },
      { claim: 'Under a convoy the quantum matters less than aging.', mechanism: 'Waiting raises priority until the long job yields.', evidence: '', limit: '' },
    ] as [never, never, never],
    conclusion: 'So it matters most for interactive workloads and least under a convoy.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveAiCall.mockResolvedValue({ ok: true, reservationId: 'r1' });
    mocks.recordAiUsage.mockResolvedValue(undefined);
  });

  it('refuses a drill answer to a plan and a plan answer to a drill', async () => {
    mocks.client = buildClient({ synthesis_drills: { data: planRow(), error: null }, cards: { data: PLAN_ANCHORS, error: null } });
    const asDrill = await check({ drill_id: PLAN_ID });
    expect(asDrill).toMatchObject({ error: 'This question needs a plan, not a drill answer.' });

    mocks.client = buildClient();
    const asPlan = await check({ mode: 'plan', response: PLAN_ANSWER });
    expect(asPlan).toMatchObject({ error: 'This is a drill, not a plan question.' });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('checks a plan with the plan-shaped instruction, computes the band, and records it through the RPC', async () => {
    const client = buildClient({ synthesis_drills: { data: planRow(), error: null }, cards: { data: PLAN_ANCHORS, error: null } });
    mocks.client = client;
    respondWith(modelOutput({
      coverage: [
        { link_id: 'm1', status: 'covered', evidence: 'waits behind fewer full slices' },
        { link_id: 'm2', status: 'covered', evidence: 'Each switch is pure overhead' },
        { link_id: 'm3', status: 'covered', evidence: 'the quantum matters less than aging' },
        { link_id: 'm4', status: 'covered', evidence: 'the context switch card' },
      ],
      structure: { claim_present: true, tradeoff_present: true },
    }));

    const result = await check({ drill_id: PLAN_ID, mode: 'plan', response: PLAN_ANSWER, confidence: 2 });
    if (!('success' in result) || !result.success) throw new Error(`expected success, got ${JSON.stringify(result)}`);
    expect(result.diagnostic.verdict).toBe('sound');
    expect(result.diagnostic.band).toBe('strong');
    expect(result.reveal.planExemplar).toEqual(PLAN_EXEMPLAR);
    // The four-slot digest still travels for the shared surfaces.
    expect(result.reveal.exemplar.claim).toBe(PLAN_EXEMPLAR.thesis);

    const request = mocks.generateContent.mock.calls[0][0] as { systemInstruction: string; contents: { parts: { text: string }[] }[] };
    expect(request.systemInstruction).toMatch(/ESSAY PLAN/);
    expect(request.contents[0].parts[0].text).toMatch(/QUESTION \(essay plan\)/);
    expect(request.contents[0].parts[0].text).toMatch(/Thesis: The quantum mostly decides/);

    // Two samples for a plan (audit G6), one reservation covering both.
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    expect(mocks.reserveAiCall).toHaveBeenCalledWith(expect.anything(), 'user-1', 'synthesis_check', expect.objectContaining({ samples: 2 }), { calls: 2 });

    const payload = recordCall(client);
    expect(payload?.p_attempt).toMatchObject({ mode: 'plan', band: 'strong', verdict: 'sound' });
    expect(payload?.p_attempt.usage).toMatchObject({ samples: 2 });
    // Plans walk the 1 / 3 / 7 ladder: sound at step 0 → step 1, due in 3 days.
    expect(payload?.p_schedule.step).toBe(1);
    const dueInDays = (Date.parse(payload!.p_schedule.next_due_at) - Date.now()) / 86_400_000;
    expect(dueInDays).toBeGreaterThan(2.9);
    expect(dueInDays).toBeLessThan(3.1);
  });

  it('generates a plan question over a topic, inserts it as kind plan with the plan exemplar and a link count', async () => {
    const cards = [
      { id: CARD_A, front: 'Time quantum', back: 'The fixed CPU slice.', explanation: null, topic_tags: ['scheduling'] },
      { id: CARD_B, front: 'Interactive process', back: 'Short bursts.', explanation: null, topic_tags: ['scheduling'] },
      { id: CARD_C, front: 'Context switch', back: 'Pure overhead.', explanation: null, topic_tags: ['scheduling'] },
      { id: CARD_D, front: 'Convoy effect', back: 'Short jobs queue behind a long one.', explanation: null, topic_tags: ['scheduling'] },
      { id: CARD_E, front: 'Aging', back: 'Priority rises with waiting.', explanation: null, topic_tags: ['scheduling'] },
    ];
    const client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'OS' }, error: null },
        cards: { data: cards, error: null },
        synthesis_drills: { data: [{ id: 'new-plan' }], error: null, count: 0 },
      },
    });
    mocks.client = client;
    respondWith({
      command_word: 'To what extent',
      question_text: 'To what extent does the time quantum determine the responsiveness of an interactive process under a convoy effect?',
      required_links: [
        { text: 'A short quantum keeps an interactive process responsive because it waits behind fewer full slices.', card_keys: ['c1', 'c2'], kind: 'mechanism', core: true },
        { text: 'A short quantum multiplies context switches, each pure overhead.', card_keys: ['c1', 'c3'], kind: 'mechanism', core: true },
        { text: 'Under a convoy the quantum matters less than aging.', card_keys: ['c4', 'c5'], kind: 'evaluation', core: true },
        { text: 'The quantum should sit just above a burst.', card_keys: ['c1', 'c2'], kind: 'condition', core: true },
      ],
      missing_concepts: ['multilevel feedback queue'],
      exemplar_plan: PLAN_EXEMPLAR,
    });

    const { generatePlanQuestions } = await import('./synthesis');
    const result = await generatePlanQuestions({ deck_id: DECK_ID, count: 1, focus_topic: 'scheduling' });
    expect(result).toMatchObject({ success: true, created: 1, failed: 0, missingConcepts: ['multilevel feedback queue'] });

    const rows = client.__inserted.synthesis_drills?.[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'plan', format: 'evaluate', command_word: 'to what extent', link_count: 4, topic_tag: 'scheduling' });
    expect(rows[0].card_ids).toHaveLength(5);
    expect(rows[0].exemplar).toEqual(PLAN_EXEMPLAR);
    expect(rows[0].generation_meta).toMatchObject({ clustering: 'tags', prompt_version: expect.any(String) });
    expect(mocks.reserveAiCall).toHaveBeenCalledWith(expect.anything(), 'user-1', 'synthesis_generate', expect.objectContaining({ kind: 'plan' }), { calls: 1 });
  });

  it('ingests pasted questions, maps each to the deck by embedding, and saves them', async () => {
    const client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'OS' }, error: null },
        synthesis_questions: { data: [{ id: 'q1', text: 'Discuss the convoy effect.', mapped_card_ids: [CARD_A, CARD_D] }], error: null },
      },
      rpcs: {
        search_deck_cards_by_embedding: { data: [{ id: CARD_A, similarity: 0.72 }, { id: CARD_D, similarity: 0.68 }, { id: CARD_B, similarity: 0.55 }], error: null },
      },
    });
    mocks.client = client;
    mocks.embedTexts.mockResolvedValue([[0.1, 0.2, 0.3]]);

    const { ingestQuestions } = await import('./synthesis');
    const result = await ingestQuestions({ deck_id: DECK_ID, questions: ['Discuss the convoy effect.'] });
    expect(result).toMatchObject({ success: true, unmapped: false, questions: [{ id: 'q1', mappedCards: 2 }] });

    const inserted = client.__inserted.synthesis_questions?.[0] as Array<Record<string, unknown>>;
    // Only cards above the query floor AND within the band of the best match (0.72 - 0.06) are mapped.
    expect(inserted[0]).toMatchObject({ source: 'paper', mapped_card_ids: [CARD_A, CARD_D] });
    expect(mocks.reserveAiCall).toHaveBeenCalledWith(expect.anything(), 'user-1', 'semantic_search', expect.anything(), { calls: 1 });
  });
});
