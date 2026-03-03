import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudyDeckClient } from '@/components/ui/shared/StudyDeckClient';

type StudyPageProps = {
  params: Promise<{
    deckId: string;
  }>;
};

export default async function DeckStudyPage({ params }: StudyPageProps) {
  const { deckId } = await params;

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
    .single();

  if (!deck) {
    notFound();
  }

  // Count total cards in the deck (for the empty-state message)
  const { count: totalInDeck } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);

  // Fetch cards that are due for review:
  //   • next_review_at <= now  (overdue / due today)
  //   • OR next_review_at IS NULL  (brand-new cards never reviewed)
  // Order: new cards first, then oldest-due first
  const now = new Date().toISOString();

  const { data: dueCards } = await supabase
    .from('cards')
    .select('id, front, back, state, interval, ease_factor, repetition_count, next_review_at')
    .eq('deck_id', deckId)
    .or(`next_review_at.is.null,next_review_at.lte.${now}`)
    .order('next_review_at', { ascending: true, nullsFirst: true })
    .limit(50); // cap a single session at 50 cards

  const cards = (dueCards ?? []).map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    state: (c.state ?? 'new') as 'new' | 'learning' | 'review' | 'relearning',
    interval: c.interval ?? 0,
    ease_factor: c.ease_factor ?? 2.5,
    repetition_count: c.repetition_count ?? 0,
  }));

  return (
    <StudyDeckClient
      deckId={deckId}
      deckTitle={deck.title}
      cards={cards}
      totalInDeck={totalInDeck ?? 0}
    />
  );
}
