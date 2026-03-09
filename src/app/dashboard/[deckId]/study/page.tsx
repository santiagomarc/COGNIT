import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudyDeckClient } from '@/components/ui/shared/StudyDeckClient';

const DEFAULT_SESSION_CARD_COUNT = 10;
const MIN_SESSION_CARD_COUNT = 5;
const MAX_SESSION_CARD_COUNT = 50;

function normalizeSessionCardCount(rawCount: string | string[] | undefined): number {
  const countValue = Array.isArray(rawCount) ? rawCount[0] : rawCount;
  const parsedCount = Number.parseInt(countValue ?? '', 10);

  if (!Number.isFinite(parsedCount)) {
    return DEFAULT_SESSION_CARD_COUNT;
  }

  return Math.min(MAX_SESSION_CARD_COUNT, Math.max(MIN_SESSION_CARD_COUNT, parsedCount));
}

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
  const sessionCardCount = normalizeSessionCardCount(resolvedSearchParams?.count);

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
    .select('id, front, back, state, interval, ease_factor, repetition_count, next_review_at, mcq_distractors, id_question')
    .eq('deck_id', deckId)
    .or(`next_review_at.is.null,next_review_at.lte.${now}`)
    .order('next_review_at', { ascending: true, nullsFirst: true })
    .limit(sessionCardCount);

  const cards = (dueCards ?? []).map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    state: (c.state ?? 'new') as 'new' | 'learning' | 'review' | 'relearning',
    interval: c.interval ?? 0,
    ease_factor: c.ease_factor ?? 2.5,
    repetition_count: c.repetition_count ?? 0,
    mcq_distractors: Array.isArray(c.mcq_distractors) ? c.mcq_distractors.filter((value): value is string => typeof value === 'string') : null,
    id_question: typeof c.id_question === 'string' ? c.id_question : null,
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
