import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AddCardForm } from '@/components/ui/shared/AddCardForm';
import { PDFUploadZone } from '@/components/ui/shared/PDFUploadZone';
import { FlashcardWithActions } from '@/components/ui/shared/FlashcardWithActions';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FadeInUp, StaggerContainer, StaggerItem } from '@/components/motion';
import { Button } from '@/components/ui/button';

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
    <div className="container mx-auto space-y-8 p-6 md:p-8">
      <FadeInUp>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
            <ThemeToggle />
          </div>

          <div className="glass-card glow-border flex flex-col gap-4 rounded-2xl p-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h1 className="glow-title text-3xl font-bold tracking-tight">{deck.title}</h1>
              {deck.description ? (
                <p className="max-w-2xl text-sm text-muted-foreground">{deck.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground/60">No description yet.</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm text-primary font-medium">
                {cards?.length ?? 0} cards
              </div>
              <Link href={`/dashboard/${deckId}/study`}>
                <Button>Start Study</Button>
              </Link>
            </div>
          </div>
        </div>
      </FadeInUp>

      <FadeInUp delay={0.1}>
        <AddCardForm deckId={deckId} />
      </FadeInUp>

      <FadeInUp delay={0.15}>
        <PDFUploadZone deckId={deckId} />
      </FadeInUp>

      {cards && cards.length > 0 ? (
        <StaggerContainer className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <StaggerItem key={card.id}>
              <FlashcardWithActions
                cardId={card.id}
                deckId={deckId}
                question={card.front}
                answer={card.back}
              />
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <FadeInUp delay={0.2}>
          <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-card/30 backdrop-blur-md p-8 text-center">
            <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold tracking-tight">No cards in this deck yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Add your first flashcard above to start studying, or generate cards from your notes in the next step.
            </p>
          </div>
        </FadeInUp>
      )}
    </div>
  );
}
