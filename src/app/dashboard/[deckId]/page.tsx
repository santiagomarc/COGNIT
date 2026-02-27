import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AddCardForm } from '@/components/ui/shared/AddCardForm';
import { Flashcard } from '@/components/ui/shared/Flashcard';

type DeckDetailPageProps = {
  params: Promise<{
    deckId: string;
  }>;
};

export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const { deckId } = await params;

  // Data fetching logic:
  // 1) authenticate user on the server
  // 2) fetch the deck by id
  // 3) fetch all cards linked to this deck
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, title, description, created_at')
    .eq('id', deckId)
    .single();

  if (deckError || !deck) {
    notFound();
  }

  const { data: cards, error: cardsError } = await supabase
    .from('cards')
    .select('id, deck_id, front, back, created_at')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false });

  if (cardsError) {
    throw new Error(cardsError.message);
  }

  return (
    <div className="container mx-auto space-y-8 p-8">
      <div className="space-y-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{deck.title}</h1>
            {deck.description ? (
              <p className="max-w-2xl text-sm text-muted-foreground">{deck.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description yet.</p>
            )}
          </div>

          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm text-muted-foreground">
            {cards?.length ?? 0} cards
          </div>
        </div>
      </div>

      <AddCardForm deckId={deckId} />

      {cards && cards.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Flashcard key={card.id} question={card.front} answer={card.back} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/30 p-8 text-center">
          <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-xl font-semibold tracking-tight">No cards in this deck yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Add your first flashcard above to start studying, or generate cards from your notes in the next step.
          </p>
        </div>
      )}
    </div>
  );
}
