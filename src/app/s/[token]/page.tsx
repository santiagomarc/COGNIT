import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Layers, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { CloneDeckButton } from '@/components/ui/shared/CloneDeckButton';
import { Flashcard } from '@/components/ui/shared/Flashcard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';

const PREVIEW_CARD_LIMIT = 12;

type SharedDeckPageProps = {
  params: Promise<{ token: string }>;
};

/**
 * A share link gets pasted into iMessage, Discord and Slack. The unfurl IS the
 * marketing, so it is worth a real generateMetadata.
 */
export async function generateMetadata({ params }: SharedDeckPageProps): Promise<Metadata> {
  const { token } = await params;
  const supabase = await createClient();

  const { data: deck } = await supabase
    .from('decks')
    .select('title, description')
    .eq('share_token', token)
    .eq('is_public', true)
    .single();

  if (!deck) {
    return { title: 'Deck not found · Cognit' };
  }

  const title = removeDeckTagFromTitle(deck.title);

  return {
    title: `${title} · Cognit`,
    description: deck.description ?? `Study "${title}" with AI-generated quizzes and spaced repetition.`,
    openGraph: {
      title: `${title} — a Cognit deck`,
      description: deck.description ?? 'Free flashcards with spaced repetition and AI quizzes.',
      type: 'article',
    },
    // Shared decks are user content. Keep them out of search indexes.
    robots: { index: false, follow: false },
  };
}

export default async function SharedDeckPage({ params }: SharedDeckPageProps) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: deck } = await supabase
    .from('decks')
    .select('id, title, description, clone_count')
    .eq('share_token', token)
    .eq('is_public', true)
    .single();

  if (!deck) {
    notFound();
  }

  const [
    { data: previewCards },
    { count: totalCards },
    { data: { user } },
  ] = await Promise.all([
    supabase
      .from('cards')
      .select('id, front, back')
      .eq('deck_id', deck.id)
      .order('created_at', { ascending: true })
      .limit(PREVIEW_CARD_LIMIT),
    supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', deck.id),
    supabase.auth.getUser(),
  ]);

  const title = removeDeckTagFromTitle(deck.title);
  const cardCount = totalCards ?? 0;
  const cloneCount = deck.clone_count ?? 0;
  const remaining = Math.max(0, cardCount - (previewCards?.length ?? 0));

  return (
    <div id="main-content" className="container mx-auto max-w-5xl space-y-8 p-6 md:p-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary">
          <Layers className="h-4 w-4 text-primary" />
          Cognit
        </Link>
        <ThemeToggle />
      </div>

      <header className="glass-card glow-border space-y-4 rounded-3xl p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Shared deck
        </p>
        <h1 className="glow-title text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>

        {deck.description ? (
          <p className="mx-auto max-w-xl text-muted-foreground">{deck.description}</p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {cardCount} card{cardCount === 1 ? '' : 's'}
          {cloneCount > 0
            ? ` · saved by ${cloneCount} ${cloneCount === 1 ? 'person' : 'people'}`
            : ''}
        </p>

        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row sm:flex-wrap">
          {user ? (
            <CloneDeckButton shareToken={token} deckTitle={title} />
          ) : (
            <>
              <Button asChild size="lg" className="gap-2">
                <Link href={`/login?redirectTo=${encodeURIComponent(`/s/${token}`)}`}>
                  <Sparkles className="h-4 w-4" />
                  Sign up free to save this deck
                </Link>
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                No account needed to preview — scroll down and flip the cards.
              </p>
            </>
          )}
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {cardCount === 0
            ? 'This deck has no cards yet'
            : `Preview ${previewCards?.length ?? 0} of ${cardCount} cards`}
        </h2>

        {cardCount > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Tap a card to flip it. Only the cards are shared — the owner&apos;s study
              history and scores stay private.
            </p>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(previewCards ?? []).map((card) => (
                <Flashcard key={card.id} question={card.back} answer={card.front} />
              ))}
            </div>

            {remaining > 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                + {remaining} more card{remaining === 1 ? '' : 's'} when you save this deck.
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
