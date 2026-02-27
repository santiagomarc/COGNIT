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

  const { data: cards } = await supabase
    .from('cards')
    .select('id, front, back')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true });

  return (
    <StudyDeckClient
      deckId={deckId}
      deckTitle={deck.title}
      cards={cards ?? []}
    />
  );
}
