import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * generateCards works to a deadline: the deck page's function is killed at
 * 60 s, and a killed action reaches the browser as "Something went wrong".
 * Model latency is simulated with fake timers; everything else is the real
 * action — chunking, ranking, the retry layer, the failure copy.
 */

const generateJson = vi.fn();

vi.mock('@/lib/gemini', () => ({
  generateJson: (request: unknown) => generateJson(request),
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' },
}));

let pdfText = '';
vi.mock('pdf-parse/worker', () => ({ CanvasFactory: class {}, getData: () => 'data:text/javascript,' }));
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    static setWorker() { return ''; }
    async getText() { return { text: pdfText, pages: Array.from({ length: 10 }) }; }
    async destroy() {}
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

vi.mock('@/lib/supabase/session', () => {
  const deckQuery: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) deckQuery[method] = () => deckQuery;
  deckQuery.single = async () => ({ data: { id: 'deck-1' }, error: null });
  const supabase = {
    from: (table: string) => (table === 'cards'
      ? { insert: (rows: unknown[]) => ({ select: async () => ({ data: rows.map((_, i) => ({ id: `card-${i}` })), error: null }) }) }
      : deckQuery),
  };
  return { getRequestClient: async () => supabase, getSessionUser: async () => ({ id: 'user-1' }) };
});

vi.mock('@/app/actions/_shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/actions/_shared')>()),
  reserveAiCall: async () => ({ ok: true, reservationId: 'reservation-1' }),
  recordAiUsage: async () => undefined,
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

/** A model call that answers after `delayFor(section, attempt)`, or aborts at the request's own timeout. */
function modelAnswering(delayFor: (section: number, attempt: number) => number) {
  const attempts = new Map<number, number>();
  return (request: { timeoutMs?: number; contents: { parts: { text: string }[] }[] }) => {
    const prompt = request.contents[0].parts[0].text;
    const section = Number(prompt.match(/\(section (\d+) of/)?.[1] ?? 1);
    const attempt = (attempts.get(section) ?? 0) + 1;
    attempts.set(section, attempt);
    const cards = [0, 1, 2].map((k) => {
      const term = TERMS[((section - 1) * 3 + k) % TERMS.length];
      return { front: `${term} ${section}`, back: `${term} is explained in section ${section} of the operating systems notes.` };
    });
    return new Promise((resolve, reject) => {
      const answer = setTimeout(() => { clearTimeout(abort); resolve({ text: JSON.stringify({ cards }) }); }, delayFor(section, attempt));
      const abort = setTimeout(() => {
        clearTimeout(answer);
        reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
      }, request.timeoutMs ?? 10 * 60_000);
    });
  };
}

async function upload() {
  const { generateCards } = await import('./ai-generate');
  const form = new FormData();
  form.append('file', new File([new TextEncoder().encode('%PDF-1.4 test')], 'notes.pdf', { type: 'application/pdf' }));
  form.append('deck_id', '00000000-0000-4000-8000-000000000001');
  form.append('count', 'max');

  const started = Date.now();
  let settled: Record<string, unknown> | null = null;
  void generateCards(form).then((result) => { settled = result as Record<string, unknown>; });
  // Fake time for the model and the retry sleeps; a real macrotask each step
  // so the upload's own I/O (Blob.arrayBuffer) can finish.
  while (!settled && Date.now() - started < 5 * 60_000) {
    await vi.advanceTimersByTimeAsync(250);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { result: settled as unknown as Record<string, unknown>, elapsedMs: Date.now() - started };
}

describe('generateCards — the function-budget deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    generateJson.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns cards from every section when the model is fast', async () => {
    pdfText = documentText(4);
    generateJson.mockImplementation(modelAnswering(() => 2_000));
    const { result, elapsedMs } = await upload();
    expect(result.error).toBeUndefined();
    expect(result.chunkCount).toBe(4);
    expect(result.partial).toBe(false);
    expect(Number(result.count)).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(10_000);
  });

  it('answers with a timeout message, inside the budget, when the model hangs', async () => {
    pdfText = documentText(1);
    generateJson.mockImplementation(modelAnswering(() => 10 * 60_000));
    const { result, elapsedMs } = await upload();
    expect(result.error).toBe('Card generation took too long to respond. Please try again.');
    expect(elapsedMs).toBeLessThan(50_000);
    // The first call times out at 30 s; the retry only gets what is left.
    expect(generateJson).toHaveBeenCalledTimes(2);
  });

  it('keeps the finished sections when a later wave runs out of time', async () => {
    pdfText = documentText(4);
    // Wave one (sections 1-3) answers at 29 s; section 4 would take 25 s more.
    generateJson.mockImplementation(modelAnswering((section) => (section <= 3 ? 29_000 : 25_000)));
    const { result, elapsedMs } = await upload();
    expect(result.error).toBeUndefined();
    expect(result.partial).toBe(true);
    expect(result.failedChunks).toBe(1);
    expect(Number(result.count)).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(50_000);
  });

  it('skips a wave that would start without room for one call', async () => {
    pdfText = documentText(4);
    // Wave one's first calls time out at 30 s and their retries answer 11 s
    // later, so the wave ends near 41.5 s with under 8 s left: section 4 is
    // never sent.
    generateJson.mockImplementation(modelAnswering((section, attempt) => (attempt === 1 ? 10 * 60_000 : 11_000)));
    const { result, elapsedMs } = await upload();
    expect(result.error).toBeUndefined();
    expect(result.partial).toBe(true);
    expect(result.failedChunks).toBe(1);
    expect(generateJson).toHaveBeenCalledTimes(6);
    const sent = generateJson.mock.calls.map(([request]) => (request as { contents: { parts: { text: string }[] }[] }).contents[0].parts[0].text);
    expect(sent.some((prompt) => prompt.includes('(section 4 of 4)'))).toBe(false);
    expect(elapsedMs).toBeLessThan(50_000);
  });
});
