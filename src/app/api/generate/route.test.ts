import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSseStream } from '@/lib/sse-parsing';

/**
 * PDF generation, streamed (performance plan AI-18). The model is a fake
 * stream that writes one card object at a time on fake timers; everything
 * else is the real route: chunking, the card checks, the picker, saving,
 * waves, reservations, the deadline and the wire protocol.
 */

const DECK_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  pdfText: '',
  streamJson: vi.fn(),
  reserveAiCall: vi.fn(),
  recordAiUsage: vi.fn(),
  inserts: [] as Record<string, unknown>[],
  existingFronts: [] as string[],
  afterCallbacks: [] as (() => unknown)[],
  // The order things happened in: model output, saves.
  log: [] as string[],
}));

vi.mock('@/lib/gemini', () => ({
  streamJson: (request: unknown) => mocks.streamJson(request),
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' },
}));

vi.mock('pdf-parse/worker', () => ({ CanvasFactory: class {}, getData: () => 'data:text/javascript,' }));
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    static setWorker() { return ''; }
    async getText() { return { text: mocks.pdfText, pages: Array.from({ length: 10 }) }; }
    async destroy() {}
  },
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => { mocks.afterCallbacks.push(fn); },
}));
vi.mock('@/lib/card-derived', () => ({ fillDerivedCardData: async () => 'ok' }));

vi.mock('@/lib/supabase/session', () => {
  const deckQuery: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) deckQuery[method] = () => deckQuery;
  deckQuery.maybeSingle = async () => ({ data: { id: DECK_ID }, error: null });

  const existingQuery: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) existingQuery[method] = () => existingQuery;
  existingQuery.then = (resolve: (value: unknown) => void) => resolve({
    data: mocks.existingFronts.map((front) => ({ front })),
    error: null,
  });

  const supabase = {
    from: (table: string) => {
      if (table === 'decks') return deckQuery;
      return {
        ...existingQuery,
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              mocks.inserts.push(row);
              mocks.log.push(`insert:${String(row.front)}`);
              return { data: { id: `card-${mocks.inserts.length}` }, error: null };
            },
          }),
        }),
      };
    },
    rpc: async () => ({ data: [{ topic_tag: 'memory', card_count: 3 }], error: null }),
  };
  return {
    getRequestClient: async () => supabase,
    getSessionUser: async () => ({ id: 'user-1' }),
    ensureSessionHeadroom: async () => undefined,
  };
});

vi.mock('@/app/actions/_shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/actions/_shared')>()),
  reserveAiCall: (...args: unknown[]) => mocks.reserveAiCall(...args),
  recordAiUsage: (...args: unknown[]) => mocks.recordAiUsage(...args),
  touchDeckUpdatedAt: async () => undefined,
}));

const TERMS = [
  'Process scheduling', 'Time quantum', 'Context switch', 'Page fault', 'Working set',
  'Thrashing', 'Virtual memory', 'Page table', 'Round robin', 'Convoy effect',
  'Demand paging', 'Frame allocation',
];

/** Prose long enough for `sections` chunks of ~24k characters each. */
function documentText(sections: number) {
  const sentences: string[] = [];
  for (let i = 0; sentences.join(' ').length < sections * 23_000; i += 1) {
    sentences.push(`${TERMS[i % TERMS.length]} matters in operating systems because paragraph ${i} explains how the scheduler and memory manager interact under load.`);
  }
  return sentences.join(' ');
}

const cardsFor = (section: number, count = 3) => Array.from({ length: count }, (_, k) => {
  const term = `${TERMS[((section - 1) * 3 + k) % TERMS.length]} ${section}`;
  return {
    front: term,
    back: `${term} is explained in section ${section} of the operating systems notes.`,
    topic_tags: ['Operating Systems', 'memory'],
    mcq_distractors: ['Banker algorithm', 'Spin lock', 'Disk arm'],
  };
});

type Behaviour = 'ok' | 'hang' | 'fail';

/**
 * A model that streams `{"cards":[…]}` one object at a time: the first after
 * `firstMs`, then one every `perCardMs`. Aborting the request's signal stops
 * it, as the SDK does.
 */
function modelStreaming(options: {
  firstMs?: number | ((section: number) => number);
  perCardMs?: number;
  cardsPerSection?: number;
  behaviour?: (section: number, attempt: number) => Behaviour;
} = {}) {
  const attempts = new Map<number, number>();
  return async (request: { signal?: AbortSignal; contents: { parts: { text: string }[] }[] }) => {
    const prompt = request.contents[0].parts[0].text;
    const section = Number(prompt.match(/\(section (\d+) of/)?.[1] ?? 1);
    const attempt = (attempts.get(section) ?? 0) + 1;
    attempts.set(section, attempt);
    mocks.log.push(`call:${section}`);

    const behaviour = options.behaviour?.(section, attempt) ?? 'ok';
    if (behaviour === 'fail') throw Object.assign(new Error('503 Service Unavailable'), { status: 503 });

    const wait = (ms: number) => new Promise<void>((resolve, reject) => {
      if (request.signal?.aborted) return reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      const timer = setTimeout(resolve, ms);
      request.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }, { once: true });
    });
    const firstMs = typeof options.firstMs === 'function' ? options.firstMs(section) : options.firstMs ?? 1_000;
    const cards = cardsFor(section, options.cardsPerSection ?? 3);

    return (async function* stream() {
      await wait(firstMs);
      if (behaviour === 'hang') await wait(10 * 60_000);
      yield { text: '{"cards":[' };
      for (const [index, card] of cards.entries()) {
        await wait(options.perCardMs ?? 400);
        yield { text: `${index > 0 ? ',' : ''}${JSON.stringify(card)}` };
        mocks.log.push(`model:${section}:${index}`);
      }
      yield { text: ']}', usageMetadata: { promptTokenCount: 6_000, candidatesTokenCount: 450 } };
      mocks.log.push(`model:${section}:end`);
    })();
  };
}

type Frame = { event: string; payload: Record<string, unknown>; at: number };

async function generate(options: {
  sections: number;
  count?: string;
  offset?: number;
  cancelWhen?: (frames: Frame[]) => boolean;
}) {
  mocks.pdfText = documentText(options.sections);
  const { POST } = await import('./route');
  const controller = new AbortController();
  const form = new FormData();
  form.append('file', new File([new TextEncoder().encode('%PDF-1.4 test')], 'notes.pdf', { type: 'application/pdf' }));
  form.append('deck_id', DECK_ID);
  form.append('count', options.count ?? 'max');
  form.append('offset', String(options.offset ?? 0));

  const started = Date.now();
  const response = await POST(new Request('http://localhost/api/generate', {
    method: 'POST',
    body: form,
    signal: controller.signal,
  }) as never);
  if (!response.body || response.headers.get('content-type')?.startsWith('application/json')) {
    return { status: response.status, json: await response.json() as Record<string, unknown>, frames: [] as Frame[], elapsedMs: 0 };
  }

  const frames: Frame[] = [];
  let finished = false;
  void readSseStream(response.body as ReadableStream<Uint8Array<ArrayBuffer>>, (event, payload) => {
    frames.push({ event, payload, at: Date.now() - started });
    if (options.cancelWhen?.(frames)) controller.abort();
  }).catch(() => undefined).finally(() => { finished = true; });

  // Fake time for the model, the deadline and retry sleeps; a real macrotask
  // each step so the stream's own I/O can move.
  while (!finished && Date.now() - started < 5 * 60_000) {
    await vi.advanceTimersByTimeAsync(250);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { status: response.status, json: null, frames, elapsedMs: Date.now() - started };
}

const ofType = (frames: Frame[], event: string) => frames.filter((frame) => frame.event === event);

describe('POST /api/generate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.clearAllMocks();
    mocks.inserts.length = 0;
    mocks.log.length = 0;
    mocks.afterCallbacks.length = 0;
    mocks.existingFronts = [];
    mocks.reserveAiCall.mockImplementation(async () => ({ ok: true, reservationId: `r-${mocks.reserveAiCall.mock.calls.length}`, startedAt: Date.now() }));
    mocks.recordAiUsage.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves and sends each card as soon as the model finishes writing it', async () => {
    mocks.streamJson.mockImplementation(modelStreaming({ cardsPerSection: 5 }));
    const { frames } = await generate({ sections: 1 });

    expect(frames.map((frame) => frame.event)).toEqual(['start', 'card', 'card', 'card', 'card', 'card', 'section', 'done']);
    expect(ofType(frames, 'done')[0].payload).toEqual({ saved: 5, failedSections: 0 });
    // The first card is saved while the model is still writing the rest.
    const firstFront = String(ofType(frames, 'card')[0].payload.front);
    expect(mocks.log.indexOf(`insert:${firstFront}`)).toBeLessThan(mocks.log.indexOf('model:1:2'));
    expect(ofType(frames, 'card')[0].at).toBeLessThan(2_000);
    expect(ofType(frames, 'card')[0].payload.id).toBe('card-1');
  });

  it('writes tags and distractors with each card, so it needs no enrichment call', async () => {
    mocks.streamJson.mockImplementation(modelStreaming());
    await generate({ sections: 1 });

    expect(mocks.inserts).toHaveLength(3);
    for (const row of mocks.inserts) {
      expect(row).toMatchObject({
        deck_id: DECK_ID,
        source: 'ai_pdf',
        topic_tags: ['operating systems', 'memory'],
        mcq_distractors: ['Banker algorithm', 'Spin lock', 'Disk arm'],
      });
    }
    // The deck's existing tags are offered for reuse.
    const [request] = mocks.streamJson.mock.calls[0] as [{ systemInstruction: string }];
    expect(request.systemInstruction).toContain('reuse them where they fit: memory');
  });

  it('stops reading the model once the request has its cards', async () => {
    mocks.streamJson.mockImplementation(modelStreaming({ cardsPerSection: 8 }));
    const { frames } = await generate({ sections: 1, count: '5' });

    expect(ofType(frames, 'card')).toHaveLength(5);
    expect(mocks.log).not.toContain('model:1:end');
    expect(ofType(frames, 'done')[0].payload).toMatchObject({ saved: 5 });
  });

  it('records each wave with its time to the first card', async () => {
    mocks.streamJson.mockImplementation(modelStreaming());
    await generate({ sections: 1 });

    expect(mocks.recordAiUsage).toHaveBeenCalledTimes(1);
    const [, , action, metadata, reservation, outcome] = mocks.recordAiUsage.mock.calls[0];
    expect(action).toBe('generate_cards');
    expect(metadata).toMatchObject({ sections: 1, taken: 3, failed_chunks: 0 });
    expect(reservation).toMatchObject({ reservationId: 'r-1' });
    expect(outcome.usage).toEqual({ input: 6_000, output: 450, thoughts: 0 });
    expect(outcome.ttftMs).toBeGreaterThan(0);
    expect(outcome.ttftMs).toBeLessThan(2_000);
  });

  it('cancel stops at the current wave: no further reservations, and the cards shown stay saved', async () => {
    mocks.streamJson.mockImplementation(modelStreaming());
    const { frames } = await generate({
      sections: 6,
      count: 'max',
      cancelWhen: (seen) => ofType(seen, 'card').length === 1,
    });

    expect(ofType(frames, 'card').length).toBeGreaterThanOrEqual(1);
    expect(mocks.reserveAiCall).toHaveBeenCalledTimes(1);
    expect(mocks.log.some((entry) => /^call:[456]$/.test(entry))).toBe(false);
    expect(mocks.inserts.length).toBeGreaterThanOrEqual(ofType(frames, 'card').length);
    expect(ofType(frames, 'done')).toHaveLength(0);
  });

  it('reserves each wave of three sections separately', async () => {
    mocks.streamJson.mockImplementation(modelStreaming());
    await generate({ sections: 5 });

    expect(mocks.reserveAiCall).toHaveBeenCalledTimes(2);
    expect(mocks.reserveAiCall.mock.calls[0][4]).toEqual({ calls: 3 });
    expect(mocks.reserveAiCall.mock.calls[1][4]).toEqual({ calls: 2 });
  });

  it('asks the client to continue when time runs out, from the next unread section', async () => {
    // Wave one answers at ~45 s: too late to start wave two inside the budget.
    mocks.streamJson.mockImplementation(modelStreaming({ firstMs: 44_000 }));
    const { frames, elapsedMs } = await generate({ sections: 6, count: '20' });

    const more = ofType(frames, 'more');
    expect(more).toHaveLength(1);
    expect(more[0].payload).toEqual({ nextOffset: 3, remaining: 20 - ofType(frames, 'card').length });
    expect(mocks.log.some((entry) => /^call:[456]$/.test(entry))).toBe(false);
    expect(elapsedMs).toBeLessThan(55_000);
  });

  it('continues from an offset, and skips terms the deck already has', async () => {
    mocks.streamJson.mockImplementation(modelStreaming());
    mocks.existingFronts = ['Convoy effect 4'];
    const { frames } = await generate({ sections: 6, offset: 3 });

    expect(ofType(frames, 'start')[0].payload).toEqual({ sections: 6, offset: 3 });
    expect(mocks.log.filter((entry) => entry.startsWith('call:'))).toEqual(['call:4', 'call:5', 'call:6']);
    expect(mocks.inserts.map((row) => row.front)).not.toContain('Convoy effect 4');
    expect(ofType(frames, 'done')[0].payload).toMatchObject({ saved: 8 });
  });

  it('cuts a hanging section at the deadline and ends with a timeout, not a loop', async () => {
    mocks.streamJson.mockImplementation(modelStreaming({ behaviour: () => 'hang' }));
    const { frames, elapsedMs } = await generate({ sections: 1 });

    expect(ofType(frames, 'more')).toHaveLength(0);
    expect(ofType(frames, 'error')[0].payload).toEqual({
      message: 'Card generation took too long to respond. Please try again.',
      retryable: true,
    });
    expect(elapsedMs).toBeLessThan(55_000);
  });

  it('keeps the other sections when one fails', async () => {
    mocks.streamJson.mockImplementation(modelStreaming({ behaviour: (section) => (section === 2 ? 'fail' : 'ok') }));
    const { frames } = await generate({ sections: 3 });

    expect(ofType(frames, 'section').map((frame) => frame.payload.status).sort()).toEqual(['done', 'done', 'failed']);
    expect(ofType(frames, 'done')[0].payload).toEqual({ saved: 6, failedSections: 1 });
  });

  it('schedules embeddings for the new cards after the response', async () => {
    mocks.streamJson.mockImplementation(modelStreaming());
    await generate({ sections: 1 });
    expect(mocks.afterCallbacks).toHaveLength(1);
  });

  it('spends no reservation on an unreadable PDF', async () => {
    mocks.pdfText = '';
    const { POST } = await import('./route');
    const form = new FormData();
    form.append('file', new File([new TextEncoder().encode('%PDF-1.4 test')], 'notes.pdf', { type: 'application/pdf' }));
    form.append('deck_id', DECK_ID);
    form.append('count', '10');
    const response = await POST(new Request('http://localhost/api/generate', { method: 'POST', body: form }) as never);

    expect(response.status).toBe(422);
    expect(mocks.reserveAiCall).not.toHaveBeenCalled();
  });

  it('answers a refused reservation with 429 before streaming', async () => {
    mocks.reserveAiCall.mockResolvedValue({ ok: false, error: 'AI limit reached for generate cards. Try again in about 60 minutes.' });
    const { status, json } = await generate({ sections: 1 });

    expect(status).toBe(429);
    expect(json).toEqual({ error: 'AI limit reached for generate cards. Try again in about 60 minutes.' });
  });
});
