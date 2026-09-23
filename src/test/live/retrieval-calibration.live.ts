import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadLocalEnv } from './env';

const hasKey = loadLocalEnv();

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => { throw new Error('not used by the retrieval gate'); } }));

type Kind = 'covered' | 'partial' | 'near' | 'off';
type Fixture = {
  decks: Record<string, [term: string, definition: string][]>;
  questions: Record<string, { text: string; kind: Kind }[]>;
};

const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
};

/**
 * The retrieval gate (plan §3.5 / §6.5): the similarity floors in
 * src/lib/similarity.ts still separate what they are meant to separate, on
 * the production embedding model and request shape. Three embedding
 * requests. Run after any change to GEMINI_EMBEDDING_MODEL, the embedded
 * text, the task types or the floors.
 */
describe.skipIf(!hasKey)('live retrieval — the similarity floors still separate', () => {
  it('query → card and card ↔ card floors hold on the calibration set', async () => {
    const { embedTexts } = await import('@/lib/embeddings');
    const { NEIGHBOUR_FLOOR, QUERY_CARD_FLOOR } = await import('@/lib/similarity');
    const set = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/test/live/retrieval-calibration.json'), 'utf8')) as Fixture;

    const cards = Object.entries(set.decks).flatMap(([deck, rows]) => rows.map(([term, definition]) => ({ deck, text: `${term}\n${definition}` })));
    const questions = Object.entries(set.questions).flatMap(([deck, rows]) => rows.map((row) => ({ deck, ...row })));
    const cardVectors = await embedTexts(cards.map((card) => card.text), { taskType: 'RETRIEVAL_DOCUMENT' });
    const questionVectors = await embedTexts(questions.map((question) => question.text), { taskType: 'RETRIEVAL_QUERY' });

    const topByKind: Record<Kind, number[]> = { covered: [], partial: [], near: [], off: [] };
    questions.forEach((question, qi) => {
      const top = Math.max(...cards.flatMap((card, ci) => (card.deck === question.deck ? [cosine(questionVectors[qi], cardVectors[ci])] : [])));
      topByKind[question.kind].push(top);
    });

    const within: number[] = [];
    const across: number[] = [];
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        (cards[i].deck === cards[j].deck ? within : across).push(cosine(cardVectors[i], cardVectors[j]));
      }
    }

    const coveredMin = Math.min(...topByKind.covered);
    const offMax = Math.max(...topByKind.off);
    const nearGrounded = topByKind.near.filter((score) => score >= QUERY_CARD_FLOOR).length / topByKind.near.length;
    const crossRejected = across.filter((score) => score < NEIGHBOUR_FLOOR).length / across.length;
    const withinRejected = within.filter((score) => score < NEIGHBOUR_FLOOR).length / within.length;
    console.log(`retrieval · covered min ${coveredMin.toFixed(3)} · off-topic max ${offMax.toFixed(3)} · near grounded ${(nearGrounded * 100).toFixed(0)}% · neighbour floor rejects ${(crossRejected * 100).toFixed(0)}% cross / ${(withinRejected * 100).toFixed(0)}% within`);

    // Measured 2026-09-23: 0.678 / 0.544 / 20 % / 92 % / 2 %.
    expect(coveredMin).toBeGreaterThanOrEqual(QUERY_CARD_FLOOR + 0.02);
    expect(offMax).toBeLessThan(QUERY_CARD_FLOOR - 0.03);
    expect(nearGrounded).toBeLessThanOrEqual(0.3);
    expect(crossRejected).toBeGreaterThanOrEqual(0.85);
    expect(withinRejected).toBeLessThanOrEqual(0.05);
  });
});
