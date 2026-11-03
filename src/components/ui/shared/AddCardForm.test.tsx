import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/app/actions/card', () => ({ createCard: vi.fn() }));

import { checkCreateCard } from '@/lib/form-checks';
import { AddCardForm } from './AddCardForm';

const DECK_ID = '00000000-0000-4000-8000-000000000000';

/** The label text bound to each field, in document order. */
function labels(html: string) {
  return [...html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([^<]+)<\/label>/g)].map(([, field, text]) => ({ field, text }));
}

describe('AddCardForm field mapping (COPY-07)', () => {
  // Study shows `back` as the prompt and `front` as the answer, so a card typed
  // here must land the same way round or it studies upside down.
  it('asks for the question first and saves it to `back`', () => {
    const html = renderToStaticMarkup(<AddCardForm deckId={DECK_ID} />);
    expect(labels(html)).toEqual([
      { field: 'back', text: 'Question' },
      { field: 'front', text: 'Answer' },
    ]);
  });

  it('names the empty field by what the user typed into it', () => {
    const empty = checkCreateCard({ deck_id: DECK_ID, front: '', back: '' });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.fieldErrors.back).toContain('Question is required');
    expect(empty.fieldErrors.front).toContain('Answer is required');
  });
});
