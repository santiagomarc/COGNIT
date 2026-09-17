import { notFound, redirect } from 'next/navigation';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
import { QuizAssessmentClient } from '@/components/ui/shared/QuizAssessmentClient';
import {
  getSessionCardBounds,
  normalizeQuizMode,
  normalizeSessionCardCount,
  shuffleItems,
  type QuizMode,
  type StudySessionCard,
} from '@/lib/study';
import { DEFAULT_EASE_FACTOR } from '@/lib/sm2';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { logger } from '@/lib/logger';

type QuizPageProps = {
  params: Promise<{
    deckId: string;
  }>;
  searchParams?: Promise<{
    count?: string | string[];
    mode?: string | string[];
    focus_unproven?: string | string[];
  }>;
};

function normalizeBooleanQueryParam(rawValue: string | string[] | undefined): boolean {
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function toStudyCard(card: {
  id: string;
  front: string;
  back: string;
  state: string | null;
  interval: number | null;
  ease_factor: number | null;
  repetition_count: number | null;
  mcq_distractors: unknown;
  id_question: string | null;
  topic_tags: unknown;
  mnemonic: string | null;
}): StudySessionCard {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    state: (card.state ?? 'new') as StudySessionCard['state'],
    interval: card.interval ?? 0,
    ease_factor: card.ease_factor ?? DEFAULT_EASE_FACTOR,
    repetition_count: card.repetition_count ?? 0,
    mcq_distractors: Array.isArray(card.mcq_distractors)
      ? card.mcq_distractors.filter((value): value is string => typeof value === 'string')
      : null,
    id_question: typeof card.id_question === 'string' ? card.id_question : null,
    topic_tags: Array.isArray(card.topic_tags)
      ? card.topic_tags.filter((value): value is string => typeof value === 'string')
      : null,
    mnemonic: typeof card.mnemonic === 'string' ? card.mnemonic : null,
  };
}

export default async function DeckQuizPage({ params, searchParams }: QuizPageProps) {
  const { deckId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const mode = normalizeQuizMode(resolvedSearchParams?.mode);
  const focusUnproven = normalizeBooleanQueryParam(resolvedSearchParams?.focus_unproven);

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);

  if (!user) {
    redirect('/login');
  }

  // One wave: the deck, the deck-wide count and — in focus mode — the proven
  // count are independent reads. This page used to await them in sequence.
  const [{ data: deck }, { count: totalInDeck }, provenResult] = await Promise.all([
    supabase.from('decks').select('id, title').eq('id', deckId).eq('user_id', user.id).single(),
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('deck_id', deckId),
    focusUnproven
      ? supabase
        .from('card_mastery_state')
        .select('card_id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('deck_id', deckId)
        .eq('correct', true)
      : Promise.resolve(null),
  ]);

  if (!deck) {
    notFound();
  }

  const availableCardCount = totalInDeck ?? 0;
  const { max: maxQuizCards } = getSessionCardBounds(availableCardCount);
  const sessionCardCount = normalizeSessionCardCount(resolvedSearchParams?.count, availableCardCount);

  // The deck page advertises "Force include all unproven cards (N)" with N =
  // every unproven card in the deck. Fetching a fixed small pool and filtering
  // inside it silently capped that promise, so in focus mode the limit is
  // derived from the real unproven count instead.
  let unprovenCardCount = 0;
  if (focusUnproven) {
    if (!provenResult || provenResult.error) {
      logger.error('quiz-page', 'failed to count proven cards', { message: provenResult?.error?.message ?? 'no result' });
      unprovenCardCount = availableCardCount;
    } else {
      unprovenCardCount = Math.max(0, availableCardCount - (provenResult.count ?? 0));
    }
  }

  const limitToFetch = maxQuizCards === 0
    ? 0
    : focusUnproven
      // Cover every unproven card, plus room to top up to the session size.
      ? Math.min(Math.max(sessionCardCount, unprovenCardCount), availableCardCount, 500)
      : Math.min(Math.max(sessionCardCount * 2, 20), 100);

  // select_quiz_cards orders by priority (due → unproven → rest, or unproven
  // first in focus mode) and randomises within each tier. No fallback: the
  // RPC is live and verified; a failure is an error, not a silently different
  // selection policy.
  const { data: rpcCards, error: rpcError } = await supabase.rpc('select_quiz_cards', {
    p_deck_id: deckId,
    p_limit: limitToFetch > 0 ? limitToFetch : 20,
    p_focus_unproven: focusUnproven,
  });

  if (rpcError) {
    logger.error('quiz-page', 'select_quiz_cards rpc failed', { message: rpcError.message });
    throw new Error('Failed to load quiz cards.');
  }

  const studyCards = (rpcCards ?? []).map(toStudyCard);
  const takeCount = maxQuizCards === 0
    ? 0
    : focusUnproven
      // Focus mode expands past the session size to cover the unproven set.
      ? Math.min(Math.max(sessionCardCount, unprovenCardCount), studyCards.length)
      : Math.min(sessionCardCount, studyCards.length);

  // The RPC already ordered by priority and randomised within each tier, so
  // slice FIRST (keeping the priority) and shuffle only the chosen cards for
  // presentation order. Shuffling before slicing would throw the priority away.
  const cards: StudySessionCard[] = shuffleItems(studyCards.slice(0, takeCount));

  return (
    <QuizAssessmentClient
      deckId={deckId}
      deckTitle={removeDeckTagFromTitle(deck.title)}
      cards={cards}
      totalInDeck={totalInDeck ?? 0}
      mode={mode as QuizMode}
    />
  );
}