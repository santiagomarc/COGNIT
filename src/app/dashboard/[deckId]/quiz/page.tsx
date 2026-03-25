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

type QuizPageProps = {
  params: Promise<{
    deckId: string;
  }>;
  searchParams?: Promise<{
    count?: string | string[];
    mode?: string | string[];
  }>;
};

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
}): StudySessionCard {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    state: (card.state ?? 'new') as StudySessionCard['state'],
    interval: card.interval ?? 0,
    ease_factor: card.ease_factor ?? 2.5,
    repetition_count: card.repetition_count ?? 0,
    mcq_distractors: Array.isArray(card.mcq_distractors)
      ? card.mcq_distractors.filter((value): value is string => typeof value === 'string')
      : null,
    id_question: typeof card.id_question === 'string' ? card.id_question : null,
  };
}

export default async function DeckQuizPage({ params, searchParams }: QuizPageProps) {
  const { deckId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const mode = normalizeQuizMode(resolvedSearchParams?.mode);

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

  const { data: allCards } = await supabase
    .from('cards')
    .select('id, front, back, state, interval, ease_factor, repetition_count, mcq_distractors, id_question')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true });

  const cards = shuffleItems((allCards ?? []).map(toStudyCard)).slice(0, maxQuizCards > 0 ? sessionCardCount : 0);

  return (
    <QuizAssessmentClient
      deckId={deckId}
      deckTitle={deck.title}
      cards={cards}
      totalInDeck={totalInDeck ?? 0}
      mode={mode as QuizMode}
    />
  );
}