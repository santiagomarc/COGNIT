import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FlashcardReviewClient } from '@/components/ui/shared/FlashcardReviewClient';
import { normalizeSessionCardCount, type StudySessionCard } from '@/lib/study';
import { DEFAULT_EASE_FACTOR } from '@/lib/sm2';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';

type StudyPageProps = {
  params: Promise<{
    deckId: string;
  }>;
  searchParams?: Promise<{
    count?: string | string[];
  }>;
};

export default async function DeckStudyPage({ params, searchParams }: StudyPageProps) {
  const { deckId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

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

  // Count total cards in the deck (for the empty-state message)
  const { count: totalInDeck } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);

  const sessionCardCount = normalizeSessionCardCount(resolvedSearchParams?.count, totalInDeck ?? 0);

  // Fetch cards that are due for review:
  //   • next_review_at <= now  (overdue / due today)
  //   • OR next_review_at IS NULL  (brand-new cards never reviewed)
  // Order: new cards first, then oldest-due first
  const now = new Date().toISOString();

  const { data: dueCards } = await supabase
    .from('cards')
    .select('id, front, back, state, interval, ease_factor, repetition_count, next_review_at, mcq_distractors, id_question, topic_tags, mnemonic')
    .eq('deck_id', deckId)
    .or(`next_review_at.is.null,next_review_at.lte.${now}`)
    .order('next_review_at', { ascending: true, nullsFirst: true })
    .limit(sessionCardCount);

  const cards: StudySessionCard[] = (dueCards ?? []).map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    state: (c.state ?? 'new') as 'new' | 'learning' | 'review' | 'relearning',
    interval: c.interval ?? 0,
    ease_factor: c.ease_factor ?? DEFAULT_EASE_FACTOR,
    repetition_count: c.repetition_count ?? 0,
    mcq_distractors: Array.isArray(c.mcq_distractors) ? c.mcq_distractors.filter((value): value is string => typeof value === 'string') : null,
    id_question: typeof c.id_question === 'string' ? c.id_question : null,
    topic_tags: Array.isArray(c.topic_tags) ? c.topic_tags.filter((value): value is string => typeof value === 'string') : null,
    mnemonic: typeof c.mnemonic === 'string' ? c.mnemonic : null,
  }));

  return (
    <FlashcardReviewClient
      deckId={deckId}
      deckTitle={removeDeckTagFromTitle(deck.title)}
      cards={cards}
      totalInDeck={totalInDeck ?? 0}
    />
  );
}
