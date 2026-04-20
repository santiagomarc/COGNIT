import Link from 'next/link';
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BrainCircuit, Sparkles, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AddCardForm } from '@/components/ui/shared/AddCardForm';
import { BulkImportModal } from '@/components/ui/shared/BulkImportModal';
import { PDFUploadZone } from '@/components/ui/shared/PDFUploadZone';
import { DeckCardsManager } from '@/components/ui/shared/DeckCardsManager';
import { DeckChatWidget } from '@/components/ui/shared/DeckChatWidget';
import { QuizHistorySection, QuizHistorySkeleton } from '@/components/ui/shared/QuizHistorySection';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FadeInUp } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loadLegacyDeckMasterySnapshots } from '@/lib/legacy-mastery';
import { isMissingTableError } from '@/lib/supabase-errors';
import { parseDeckTitleMetadata } from '@/lib/deck-tags';
import { getSessionCardBounds } from '@/lib/study';
import type { CardSource } from '@/index';

type DeckDetailSnapshot = {
  deck: {
    id: string;
    title: string;
    description: string | null;
    created_at: string;
  } | null;
  deckErrorMessage: string | null;
  cards: Array<{
    id: string;
    deck_id: string;
    front: string;
    back: string;
    created_at: string;
    source: CardSource | null;
    imported_by: string | null;
    mcq_distractors: string[] | null;
    id_question: string | null;
    topic_tags: string[] | null;
  }>;
  cardsErrorMessage: string | null;
  cardsErrorCode: string | null;
  masteryRows: Array<{
    correct: boolean;
    last_quiz_at: string;
  }>;
  masteryRowsErrorMessage: string | null;
};

function getMasteryBarClass(masteryPercentage: number) {
  if (masteryPercentage >= 85) return 'bg-sky-400';
  if (masteryPercentage >= 60) return 'bg-emerald-400';
  if (masteryPercentage >= 30) return 'bg-amber-400';
  return 'bg-red-400';
}

function formatLastQuizLabel(lastQuizAt: string | null) {
  if (!lastQuizAt) {
    return 'Take your first quiz to start measuring mastery.';
  }

  const now = Date.now();
  const diffMs = now - new Date(lastQuizAt).getTime();
  const dayDiff = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (dayDiff === 0) {
    return 'Last quizzed today';
  }

  if (dayDiff === 1) {
    return 'Last quizzed 1 day ago';
  }

  return `Last quizzed ${dayDiff} days ago`;
}

async function loadDeckDetailSnapshot(userId: string, deckId: string): Promise<DeckDetailSnapshot> {
  const supabase = await createClient();

  const [
    { data: deck, error: deckError },
    { data: cards, error: cardsError },
    { data: masteryRows, error: masteryRowsError },
  ] = await Promise.all([
    supabase
      .from('decks')
      .select('id, title, description, created_at')
      .eq('id', deckId)
      .single(),
    supabase
      .from('cards')
      .select('id, deck_id, front, back, created_at, source, imported_by, mcq_distractors, id_question, topic_tags')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false }),
    supabase
      .from('card_mastery_state')
      .select('correct, last_quiz_at')
      .eq('user_id', userId)
      .eq('deck_id', deckId),
  ]);

  return {
    deck,
    deckErrorMessage: deckError?.message ?? null,
    cards: cards ?? [],
    cardsErrorMessage: cardsError?.message ?? null,
    cardsErrorCode: cardsError?.code ?? null,
    masteryRows: masteryRows ?? [],
    masteryRowsErrorMessage: masteryRowsError?.message ?? null,
  };
}

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

  const [
    {
      deck,
      deckErrorMessage,
      cards,
      cardsErrorMessage,
      cardsErrorCode,
      masteryRows,
      masteryRowsErrorMessage,
    },
  ] = await Promise.all([loadDeckDetailSnapshot(user.id, deckId)]);

  if (deckErrorMessage || !deck) {
    notFound();
  }

  if (cardsErrorMessage) {
    console.error('[deck-page] failed to read cards:', cardsErrorCode, cardsErrorMessage);
    throw new Error('Failed to load deck cards.');
  }

  const totalCards = cards.length;
  const deckTitleMeta = parseDeckTitleMetadata(deck.title);
  const sessionBounds = getSessionCardBounds(totalCards);
  const quizReadyCards = cards.filter(
    (card) => Boolean(card.id_question) && Array.isArray(card.mcq_distractors) && card.mcq_distractors.length >= 2
  ).length;

  let lastQuizAt: string | null = null;
  let masteredCards = 0;
  for (const row of masteryRows) {
    if (row.correct) {
      masteredCards += 1;
    }

    if (!lastQuizAt || lastQuizAt < row.last_quiz_at) {
      lastQuizAt = row.last_quiz_at;
    }
  }

  if (masteryRowsErrorMessage) {
    if (isMissingTableError(masteryRowsErrorMessage, 'card_mastery_state')) {
      const legacyMasteryByDeck = await loadLegacyDeckMasterySnapshots(
        supabase,
        user.id,
        new Map([[deckId, totalCards]])
      );
      const fallback = legacyMasteryByDeck.get(deckId);
      masteredCards = fallback?.masteredCards ?? 0;
      lastQuizAt = fallback?.lastQuizAt ?? null;
    } else {
      console.error('[deck-page] failed to read card mastery state:', masteryRowsErrorMessage);
    }
  }

  const masteryPercentage = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;
  const unprovenCards = Math.max(totalCards - masteredCards, 0);
  const hasCards = totalCards > 0;
  const topTopics = Object.entries(
    cards.reduce<Record<string, number>>((acc, card) => {
      if (!Array.isArray(card.topic_tags)) {
        return acc;
      }

      for (const rawTag of card.topic_tags) {
        const tag = rawTag.trim();
        if (!tag) {
          continue;
        }

        acc[tag] = (acc[tag] ?? 0) + 1;
      }

      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const addContentSection = (
    <>
      <FadeInUp delay={0.1}>
        <div id="add-content" className="flex flex-wrap items-center justify-between gap-3 scroll-mt-28">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {hasCards ? 'Add Content' : 'Start Here: Add Your First Cards'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {hasCards
                ? 'Add individual cards, bulk-import structured notes, or generate cards from a PDF.'
                : 'Add individual cards, bulk-import notes, or generate cards from a PDF to unlock study and quiz modes.'}
            </p>
          </div>
          <BulkImportModal deckId={deckId} />
        </div>
      </FadeInUp>

      <FadeInUp delay={0.12}>
        <AddCardForm deckId={deckId} />
      </FadeInUp>

      <FadeInUp delay={0.15}>
        <PDFUploadZone deckId={deckId} />
      </FadeInUp>

      <FadeInUp delay={0.18}>
        <DeckChatWidget deckId={deckId} />
      </FadeInUp>
    </>
  );

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

          <div className="glass-card glow-border space-y-6 rounded-2xl p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="glow-title text-3xl font-bold tracking-tight">{deckTitleMeta.cleanTitle}</h1>
                  {deckTitleMeta.tag ? (
                    <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {deckTitleMeta.tag}
                    </span>
                  ) : null}
                </div>
                {deck.description ? (
                  <p className="max-w-2xl text-sm text-muted-foreground">{deck.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground/60">No description yet.</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
                  {totalCards} cards
                </div>
                <div className="inline-flex items-center rounded-full border border-primary/20 bg-card/50 px-3 py-1 text-sm text-muted-foreground">
                  {quizReadyCards}/{totalCards} quiz-ready
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-card/30 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Trophy className="h-4 w-4 text-primary" />
                    Deck Mastery
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatLastQuizLabel(lastQuizAt)}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-3xl font-bold tracking-tight text-foreground">{masteryPercentage}%</p>
                  <p className="text-xs text-muted-foreground">
                    {masteredCards}/{totalCards} cards currently proven in quizzes
                  </p>
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted/50">
                <div
                  className={`h-full rounded-full transition-all ${getMasteryBarClass(masteryPercentage)}`}
                  style={{ width: `${Math.min(masteryPercentage, 100)}%` }}
                />
              </div>
            </div>

            {topTopics.length > 0 ? (
              <div className="rounded-2xl border border-primary/15 bg-card/25 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Top Concepts</p>
                  <p className="text-xs text-muted-foreground">From AI topic tags</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {topTopics.map(([topic, count]) => (
                    <span
                      key={topic}
                      className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-xs text-sky-200"
                    >
                      <span>{topic}</span>
                      <span className="text-sky-300/80">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {hasCards ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <form action={`/dashboard/${deckId}/study`} method="get" className="rounded-2xl border border-primary/15 bg-card/25 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <BrainCircuit className="h-4 w-4 text-primary" />
                        Review Flashcards
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Build recall with spaced repetition. This is the flow that advances your daily review count, streak, and heatmap.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-end gap-3">
                    <label className="space-y-1 text-left">
                      <span className="block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Session cards
                      </span>
                      <Input
                        name="count"
                        type="number"
                        min={sessionBounds.min || undefined}
                        max={sessionBounds.max || undefined}
                        step={1}
                        defaultValue={sessionBounds.defaultCount || undefined}
                        className="w-28"
                        aria-label="Number of flashcards to review"
                      />
                    </label>
                    <Button type="submit">Review Flashcards</Button>
                  </div>
                </form>

                <form action={`/dashboard/${deckId}/quiz`} method="get" className="rounded-2xl border border-primary/15 bg-card/25 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Take Quiz
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Test what you know in a dedicated assessment flow. Quiz results update this deck&apos;s mastery score.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
                    <label className="space-y-1 text-left">
                      <span className="block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Quiz cards
                      </span>
                      <Input
                        name="count"
                        type="number"
                        min={sessionBounds.min || undefined}
                        max={sessionBounds.max || undefined}
                        step={1}
                        defaultValue={sessionBounds.defaultCount || undefined}
                        className="w-28"
                        aria-label="Number of quiz cards"
                      />
                    </label>

                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Mode</legend>
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/40 px-3 py-2 text-sm text-foreground">
                          <input type="radio" name="mode" value="mcq" defaultChecked className="accent-primary" />
                          MCQ
                        </label>
                        <label className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/40 px-3 py-2 text-sm text-foreground">
                          <input type="radio" name="mode" value="identification" className="accent-primary" />
                          Identification
                        </label>
                      </div>
                    </fieldset>
                  </div>

                  <div className="mt-4 space-y-2 rounded-xl border border-primary/10 bg-background/30 p-3">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        name="focus_unproven"
                        value="1"
                        className="accent-primary"
                      />
                      Force include all unproven cards ({unprovenCards})
                    </label>
                    <p className="text-xs text-muted-foreground">
                      If enabled, quiz size auto-expands to include every card not yet proven in quiz mastery.
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {quizReadyCards < totalCards
                        ? 'Some cards still need AI enrichment. The quiz route will prepare missing prompts automatically.'
                        : 'All cards are ready for both quiz modes.'}
                    </p>
                    <Button type="submit" variant="outline">Start Quiz</Button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">This deck is empty. Add your first cards to unlock Study and Quiz.</p>
                    <p className="text-sm text-muted-foreground">
                      Start by writing one card, bulk importing your notes, or generating cards from a PDF.
                    </p>
                  </div>
                  <Button asChild>
                    <Link href="#add-content">Add Cards Now</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </FadeInUp>

      {!hasCards ? addContentSection : null}

      {hasCards ? addContentSection : null}

      <DeckCardsManager deckId={deckId} cards={cards} />

      <FadeInUp delay={0.2}>
        <Suspense fallback={<QuizHistorySkeleton />}>
          <QuizHistorySection deckId={deckId} />
        </Suspense>
      </FadeInUp>
    </div>
  );
}
