import type { TickState } from '@/components/ui/shared/StateTick';

/** What `deckState` reads from a deck row. */
export type DeckStateInput = {
  cardCount: number;
  dueCount: number;
  dueDrillCount: number;
  assessedCards: number;
};

/**
 * The deck's dominant state (design system §2.2).
 *
 * Order matters: work outranks progress. A deck with cards waiting reports
 * `due`, because the tick is there to say what to do next, not to award a
 * grade.
 *
 * It never reports `mastered`. That state means SM-2 mastery (interval ≥ 21
 * days), and the share this row carries is *quiz-proven*: cards whose last quiz
 * answer was correct. Painting the second in the first's hue is the "one
 * meaning per word" defect (UIUX plan COPY-02).
 */
export function deckState(deck: DeckStateInput): TickState {
  if (deck.cardCount === 0) return 'empty';
  if (deck.dueCount > 0 || deck.dueDrillCount > 0) return 'due';
  if (deck.assessedCards === 0) return 'neutral';
  return 'learning';
}
