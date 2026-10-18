import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/embeddings', () => ({ embedTexts: vi.fn(), toVectorLiteral: vi.fn() }));

const { buildDeckChatSystemInstruction, wholeDeckContext } = await import('./rag');

describe('wholeDeckContext', () => {
  it('is grounded, never degraded, and carries word-ranked chips without a similarity', () => {
    const result = wholeDeckContext([
      { id: 'a', front: 'Mitosis', back: 'Cell division.' },
      { id: 'b', front: 'Osmosis', back: 'Water transport.' },
    ], 'explain mitosis');
    expect(result).toEqual({
      cards: [{ id: 'a', front: 'Mitosis', back: 'Cell division.', similarity: null }],
      grounded: true,
      degraded: false,
      topSimilarity: null,
    });
  });
});

describe('buildDeckChatSystemInstruction', () => {
  it('tells the model it has the whole deck and must not answer from general knowledge', () => {
    const text = buildDeckChatSystemInstruction({ deckTitle: 'Bio', contextText: '1. A: B', grounded: true, wholeDeck: true, nonce: 'n' });
    expect(text).toContain('The cards below are the whole deck');
    expect(text).toContain('Do NOT answer from general knowledge');
  });

  it('keeps the retrieved-context wording otherwise', () => {
    const text = buildDeckChatSystemInstruction({ deckTitle: 'Bio', contextText: '1. A: B', grounded: true, nonce: 'n' });
    expect(text).toContain('Answer using ONLY the deck context below');
  });
});
