import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { CloneDeckButton } from '@/components/ui/shared/CloneDeckButton';
import { Flashcard } from '@/components/ui/shared/Flashcard';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Wordmark } from '@/components/ui/shared/Wordmark';
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
      {/*
        The header is the telemetry strip the rest of the product uses (§7.9),
        not a centred hero on a translucent card. Someone arriving from a link
        in Discord should recognise this as the same instrument they will get
        when they sign up — that recognition is the whole point of the screen.
      */}
      <header className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Wordmark href="/" size="sm" />
          <ThemeToggle />
        </div>

        <div className="h-px w-full bg-border" />

        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Shared deck
          </p>
          <h1 className="font-serif text-[3rem] font-medium leading-[1.08] tracking-[-0.02em] text-balance text-ink">
            {title}
          </h1>

          {deck.description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{deck.description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Telemetry label="Cards" value={cardCount} />
          <Telemetry label="Preview" value={`${previewCards?.length ?? 0}/${cardCount}`} />
          {cloneCount > 0 ? <Telemetry label="Saved by" value={cloneCount} /> : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user ? (
            <CloneDeckButton shareToken={token} deckTitle={title} />
          ) : (
            <>
              {/* The screen's one filled button (§7.2). */}
              <Button asChild variant="primary">
                <Link href={`/login?redirectTo=${encodeURIComponent(`/s/${token}`)}`}>
                  Save this deck — free
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                No account needed to preview. Flip any card below.
              </p>
            </>
          )}
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-[-.02em] text-ink">
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
