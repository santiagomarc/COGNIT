import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
import { isMissingTableError } from '@/lib/supabase-errors';
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: deck } = await supabase
    .from('decks')
    .select('id, title')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single();

  if (!deck) {
    notFound();
  }

  const { count: totalInDeck } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);

  const availableCardCount = totalInDeck ?? 0;
  const { max: maxQuizCards } = getSessionCardBounds(availableCardCount);
  const sessionCardCount = normalizeSessionCardCount(resolvedSearchParams?.count, availableCardCount);
  const limitToFetch = maxQuizCards > 0 ? Math.min(Math.max(sessionCardCount * 2, 20), 100) : 0;

  type QuizCardRow = {
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
  };

  const rpcCaller = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: QuizCardRow[] | null; error: { message: string } | null }>;

  const { data: rpcCards, error: rpcError } = await rpcCaller('select_quiz_cards', {
    p_deck_id: deckId,
    p_limit: limitToFetch > 0 ? limitToFetch : 20,
  });

  let rawCards: QuizCardRow[] = [];

  if (!rpcError && rpcCards && rpcCards.length > 0) {
    rawCards = rpcCards;
  } else {
    // Fallback: bounded card fetch (P-2)
    const { data: fallbackCards } = await supabase
      .from('cards')
      .select('id, front, back, state, interval, ease_factor, repetition_count, mcq_distractors, id_question, topic_tags, mnemonic')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true })
      .limit(limitToFetch > 0 ? limitToFetch : 20);

    rawCards = (fallbackCards ?? []) as QuizCardRow[];
  }

  const studyCards = rawCards.map(toStudyCard);
  const shuffledCards = shuffleItems(studyCards);

  let cards = shuffledCards.slice(0, maxQuizCards > 0 ? sessionCardCount : 0);

  if (focusUnproven && shuffledCards.length > 0) {
    const { data: provenMasteryRows, error: provenMasteryError } = await supabase
      .from('card_mastery_state')
      .select('card_id')
      .eq('user_id', user.id)
      .eq('deck_id', deckId)
      .eq('correct', true);

    if (provenMasteryError) {
      /**
       * @deprecated Fallback for pre-202609011200 environments.
       * Remove once `supabase migration list` confirms every environment is current.
       * Tracking: Phase 5 exit criteria.
       */
      if (!isMissingTableError(provenMasteryError.message, 'card_mastery_state')) {
        logger.error('quiz-page', 'failed to read mastery state for focus_unproven', { message: provenMasteryError.message });
      }
    } else {
      const provenCardIds = new Set((provenMasteryRows ?? []).map((row) => row.card_id));
      const unprovenCards = shuffledCards.filter((card) => !provenCardIds.has(card.id));
      const provenCards = shuffledCards.filter((card) => provenCardIds.has(card.id));
      const desiredCount = Math.max(sessionCardCount, unprovenCards.length);
      const takeCount = Math.min(desiredCount, shuffledCards.length);

      cards = [...unprovenCards, ...provenCards].slice(0, takeCount);
    }
  }

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