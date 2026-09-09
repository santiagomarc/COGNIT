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

  // The deck page advertises "Force include all unproven cards (N)" with N =
  // every unproven card in the deck. Fetching a fixed small pool and filtering
  // inside it silently capped that promise, so in focus mode the limit is
  // derived from the real unproven count instead.
  let unprovenCardCount = 0;
  if (focusUnproven) {
    const [{ count: provenCount, error: provenCountError }] = await Promise.all([
      supabase
        .from('card_mastery_state')
        .select('card_id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('deck_id', deckId)
        .eq('correct', true),
    ]);

    if (provenCountError) {
      logger.error('quiz-page', 'failed to count proven cards', { message: provenCountError.message });
      unprovenCardCount = availableCardCount;
    } else {
      unprovenCardCount = Math.max(0, availableCardCount - (provenCount ?? 0));
    }
  }

  const limitToFetch = maxQuizCards === 0
    ? 0
    : focusUnproven
      // Cover every unproven card, plus room to top up to the session size.
      ? Math.min(Math.max(sessionCardCount, unprovenCardCount), availableCardCount, 500)
      : Math.min(Math.max(sessionCardCount * 2, 20), 100);

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

  const { data: rpcCards, error: rpcError } = await supabase.rpc('select_quiz_cards', {
    p_deck_id: deckId,
    p_limit: limitToFetch > 0 ? limitToFetch : 20,
    // Pushes the unproven-first ordering into Postgres, and randomises within
    // each priority tier so a repeat quiz is not the same cards in a new order.
    p_focus_unproven: focusUnproven,
  });

  let rawCards: QuizCardRow[] = [];
  let usedRpc = false;

  if (!rpcError && rpcCards && rpcCards.length > 0) {
    rawCards = rpcCards;
    usedRpc = true;
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
  const takeCount = maxQuizCards === 0
    ? 0
    : focusUnproven
      // Focus mode expands past the session size to cover the unproven set.
      ? Math.min(Math.max(sessionCardCount, unprovenCardCount), studyCards.length)
      : Math.min(sessionCardCount, studyCards.length);

  let cards: StudySessionCard[];

  if (usedRpc) {
    // The RPC already ordered by priority and randomised within each tier, so
    // slice FIRST (keeping the priority) and shuffle only the chosen cards for
    // presentation order. Shuffling before slicing would throw the priority away.
    cards = shuffleItems(studyCards.slice(0, takeCount));
  } else {
    // Fallback rows come back in deterministic created_at order, so shuffle the
    // pool to get variety, then apply the focus filter in TypeScript.
    const shuffledCards = shuffleItems(studyCards);
    cards = shuffledCards.slice(0, takeCount);

    if (focusUnproven && shuffledCards.length > 0) {
      const { data: provenMasteryRows, error: provenMasteryError } = await supabase
        .from('card_mastery_state')
        .select('card_id')
        .eq('user_id', user.id)
        .eq('deck_id', deckId)
        .eq('correct', true);

      if (provenMasteryError) {
        logger.error('quiz-page', 'failed to read mastery state for focus_unproven', { message: provenMasteryError.message });
      } else {
        const provenCardIds = new Set((provenMasteryRows ?? []).map((row) => row.card_id));
        const unproven = shuffledCards.filter((card) => !provenCardIds.has(card.id));
        const proven = shuffledCards.filter((card) => provenCardIds.has(card.id));

        cards = [...unproven, ...proven].slice(
          0,
          Math.min(Math.max(sessionCardCount, unproven.length), shuffledCards.length),
        );
      }
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