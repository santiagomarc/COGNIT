import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadLocalEnv } from './env';

const hasKey = loadLocalEnv();

/**
 * The PDF upload gate: the real `generateCards` action — PDF parsing through
 * pdf-parse's serverless worker, chunking, the live model, ranking — under
 * production's environment (NODE_ENV=production, no CRON_SECRET, default
 * model and token cap), with only the database stubbed. It must return cards
 * inside the deck page's function budget. One model call per PDF section.
 */

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

vi.mock('@/lib/supabase/session', () => {
  const chain = (result: unknown) => {
    const node: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit']) node[method] = () => node;
    node.single = async () => result;
    return node;
  };
  const supabase = {
    from: (table: string) => (table === 'cards'
      ? { insert: (rows: unknown[]) => ({ select: async () => ({ data: rows.map((_, i) => ({ id: `card-${i}` })), error: null }) }) }
      : chain({ data: { id: 'deck-1' }, error: null })),
  };
  return {
    getRequestClient: async () => supabase,
    getSessionUser: async () => ({ id: 'user-1' }),
  };
});

vi.mock('@/app/actions/_shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/actions/_shared')>()),
  reserveAiCall: async () => ({ ok: true, reservationId: 'reservation-1' }),
  recordAiUsage: async () => undefined,
  touchDeckUpdatedAt: async () => undefined,
}));

/** A text PDF of real prose: one Helvetica text object per page, ASCII only. */
function buildPdf(text: string, charsPerPage = 4_500): Uint8Array<ArrayBuffer> {
  const ascii = text.replace(/[^\x20-\x7E\n]/g, ' ');
  const pages: string[][] = [];
  let lines: string[] = [];
  let size = 0;
  for (const paragraph of ascii.split('\n')) {
    for (let i = 0; i < paragraph.length || i === 0; i += 95) {
      const line = paragraph.slice(i, i + 95);
      lines.push(line);
      size += line.length;
      if (size >= charsPerPage) { pages.push(lines); lines = []; size = 0; }
      if (paragraph.length === 0) break;
    }
  }
  if (lines.length > 0) pages.push(lines);

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let next = 4;
  for (const pageLines of pages) {
    const stream = `BT /F1 9 Tf 11 TL 36 806 Td ${pageLines.map((l) => `(${esc(l)}) '`).join(' ')} ET`;
    const contentId = next++;
    const pageId = next++;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    pageIds.push(pageId);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(out);
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(out, 'latin1'));
}

/** Prose from the repo's own long specs: unique lines, real sentences, no page furniture. */
function sourceText(chars: number): string {
  const text = fs.readFileSync(path.resolve(process.cwd(), 'COGNIT_MICRO_SYNTHESIS_SPEC.md'), 'utf8')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`|>_-]{2,}/g, ' ');
  return text.slice(0, chars);
}

const FUNCTION_BUDGET_MS = Number(process.env.PDF_GATE_BUDGET_MS ?? 60_000);

describe.skipIf(!hasKey)('live PDF generation — the upload action returns cards inside the function budget', () => {
  it.each([
    ['a short handout (one section)', 18_000],
    ['a long lecture PDF (several sections)', 95_000],
  ])('%s', async (_label, chars) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('GEMINI_MODEL', '');
    vi.resetModules();
    delete process.env.GEMINI_MODEL;
    const { generateCards } = await import('@/app/actions/ai-generate');

    const pdf = buildPdf(sourceText(chars));
    const form = new FormData();
    form.append('file', new File([pdf], 'lecture.pdf', { type: 'application/pdf' }));
    form.append('deck_id', '00000000-0000-4000-8000-000000000001');
    form.append('count', 'max');

    const started = Date.now();
    const result = await generateCards(form) as Record<string, unknown>;
    const elapsed = Date.now() - started;
    console.log(`  ${chars} chars · ${elapsed} ms · ${'error' in result && result.error ? `error: ${JSON.stringify(result.error)}` : `${result.count} cards from ${result.chunkCount} sections · partial ${Boolean(result.partial)} · failed sections ${result.failedChunks ?? 0}`}`);
    vi.unstubAllEnvs();

    expect(result.error ?? null).toBeNull();
    expect(Number(result.count)).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(FUNCTION_BUDGET_MS);
  });
});
