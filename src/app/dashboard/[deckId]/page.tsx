import Link from 'next/link';
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AddCardForm } from '@/components/ui/shared/AddCardForm';
import { BulkImportModal } from '@/components/ui/shared/BulkImportModal';
import { PDFUploadZone } from '@/components/ui/shared/PDFUploadZone';
import { DeckCardsManager } from '@/components/ui/shared/DeckCardsManager';
import { DeckChatWidget } from '@/components/ui/shared/DeckChatWidget';
import { QuizHistorySection, QuizHistorySkeleton } from '@/components/ui/shared/QuizHistorySection';
import { WeakestConcepts, WeakestConceptsSkeleton } from '@/components/ui/shared/WeakestConcepts';
import { ShareDeckButton } from '@/components/ui/shared/ShareDeckButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { Input } from '@/components/ui/input';
import { isMissingDatabaseFunctionError } from '@/lib/supabase-errors';
import { parseDeckTitleMetadata } from '@/lib/deck-tags';
import { getSessionCardBounds } from '@/lib/study';
import { logger } from '@/lib/logger';
import type { CardSource } from '@/index';

type DeckDetailSnapshot = {
  deck: {
    id: string;
    title: string;
    description: string | null;
    created_at: string;
    share_token: string | null;
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
  totalCards: number;
  /** Deck-wide, not derived from the paginated `cards` slice above. */
  quizReadyCards: number;
  topTopics: Array<[string, number]>;
  cardsErrorMessage: string | null;
  cardsErrorCode: string | null;
  masteryRows: Array<{
    correct: boolean;
    last_quiz_at: string;
  }>;
  masteryRowsErrorMessage: string | null;
};

/**
 * Mastery is the one thing on this page that reports SM-2 state, so it is the
 * one thing that gets a hue — and only at the threshold that means something.
 * The four-step sky/emerald/amber/red ramp this replaces invented three
 * boundaries the scheduler does not have (§2.2).
 */
function masteryBarColor(masteryPercentage: number) {
  return masteryPercentage >= 70 ? 'var(--state-mastered)' : 'var(--ink-dim)';
}

/** Compact age for the telemetry strip: `today`, `2d`, `3mo`. */
function formatLastQuizAge(lastQuizAt: string | null) {
  if (!lastQuizAt) {
    return '—';
  }

  const dayDiff = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastQuizAt).getTime()) / (1000 * 60 * 60 * 24)),
  );

  if (dayDiff === 0) return 'today';
  if (dayDiff < 30) return `${dayDiff}d`;
  if (dayDiff < 365) return `${Math.round(dayDiff / 30)}mo`;
  return `${Math.round(dayDiff / 365)}y`;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Deck-wide count of cards ready for MCQ. Uses an RPC so the count covers the
 * whole deck rather than the 60-card page the UI renders; falls back to a
 * bounded HEAD count when the migration has not been applied.
 */
async function loadQuizReadyCount(
  supabase: SupabaseServerClient,
  deckId: string,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('count_quiz_ready_cards', { p_deck_id: deckId });

    if (!error) {
      return Number(data ?? 0);
    }

    if (error?.message && !isMissingDatabaseFunctionError(error.message, 'count_quiz_ready_cards')) {
      logger.warn('deck-page', 'count_quiz_ready_cards rpc failed', { message: error.message });
    }

    const { count } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId)
      .not('id_question', 'is', null)
      .not('mcq_distractors', 'is', null);

    return count ?? 0;
  } catch (err) {
    logger.warn('deck-page', 'loadQuizReadyCount failed', { err });
    return 0;
  }
}

/** Deck-wide topic-tag histogram, for the same pagination reason. */
async function loadTopTopics(
  supabase: SupabaseServerClient,
  deckId: string,
): Promise<Array<[string, number]>> {
  try {
    const { data, error } = await supabase.rpc('get_deck_topic_tag_counts', {
      p_deck_id: deckId,
      p_limit: 10,
    });

    if (!error) {
      return (data ?? []).map((row) => [row.topic_tag, Number(row.tag_count)] as [string, number]);
    }

    if (error?.message && !isMissingDatabaseFunctionError(error.message, 'get_deck_topic_tag_counts')) {
      logger.warn('deck-page', 'get_deck_topic_tag_counts rpc failed', { message: error.message });
    }

    const { data: taggedCards } = await supabase
      .from('cards')
      .select('topic_tags')
      .eq('deck_id', deckId)
      .not('topic_tags', 'is', null)
      .limit(2000);

    const counts = new Map<string, number>();
    for (const card of taggedCards ?? []) {
      if (!Array.isArray(card.topic_tags)) continue;
      for (const rawTag of card.topic_tags) {
        const tag = (rawTag ?? '').trim();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  } catch (err) {
    logger.warn('deck-page', 'loadTopTopics failed', { err });
    return [];
  }
}

async function loadDeckDetailSnapshot(
  supabase: SupabaseServerClient,
  userId: string,
  deckId: string
): Promise<DeckDetailSnapshot> {
  const fetchSnapshot = async () => {
    return Promise.all([
      supabase
        .from('decks')
        .select('id, title, description, created_at, share_token')
        .eq('id', deckId)
        .single(),
      supabase
        .from('cards')
        .select('id, deck_id, front, back, created_at, source, imported_by, mcq_distractors, id_question, topic_tags', { count: 'exact' })
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false })
        .range(0, 59),
      supabase
        .from('card_mastery_state')
        .select('correct, last_quiz_at')
        .eq('user_id', userId)
        .eq('deck_id', deckId),
    ]);
  };

  let [deckRes, cardsRes, masteryRes] = await fetchSnapshot();

  // Retry once if there was a transient network/fetch failure
  if ((deckRes.error?.message?.includes('fetch failed') || cardsRes.error?.message?.includes('fetch failed')) && !deckRes.data) {
    await new Promise((r) => setTimeout(r, 250));
    [deckRes, cardsRes, masteryRes] = await fetchSnapshot();
  }

  const { data: deck, error: deckError } = deckRes;
  const { data: rawCards, error: cardsError, count: cardsCount } = cardsRes;
  const { data: masteryRows, error: masteryRowsError } = masteryRes;

  const cards = (rawCards ?? []).map((card) => ({
    ...card,
    created_at: card.created_at ?? new Date().toISOString(),
    source: card.source as CardSource,
  }));
  const totalCards = cardsCount ?? cards.length;

  let quizReadyCards = 0;
  let topTopics: Array<[string, number]> = [];

  // If the deck has more than 60 cards, use the database RPCs for deck-wide stats.
  // For 0-60 cards, compute in-memory instantly to avoid redundant round-trips.
  if (totalCards > 60) {
    const [rpcQuizReady, rpcTopTopics] = await Promise.all([
      loadQuizReadyCount(supabase, deckId),
      loadTopTopics(supabase, deckId),
    ]);
    quizReadyCards = rpcQuizReady;
    topTopics = rpcTopTopics;
  } else if (cards.length > 0) {
    quizReadyCards = cards.filter(
      (c) => Boolean(c.id_question) && Array.isArray(c.mcq_distractors) && c.mcq_distractors.length >= 3
    ).length;

    const counts = new Map<string, number>();
    for (const card of cards) {
      if (!Array.isArray(card.topic_tags)) continue;
      for (const rawTag of card.topic_tags) {
        const tag = (rawTag ?? '').trim();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    topTopics = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }

  return {
    deck: deck
      ? {
        ...deck,
        created_at: deck.created_at ?? new Date().toISOString(),
        share_token: deck.share_token ?? null,
      }
      : null,
    deckErrorMessage: deckError?.message ?? null,
    cards,
    totalCards,
    quizReadyCards,
    topTopics,
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

  const {
    deck,
    deckErrorMessage,
    cards,
    totalCards,
    quizReadyCards,
    topTopics,
    cardsErrorMessage,
    cardsErrorCode,
    masteryRows,
    masteryRowsErrorMessage,
  } = await loadDeckDetailSnapshot(supabase, user.id, deckId);

  if (deckErrorMessage || !deck) {
    notFound();
  }

  if (cardsErrorMessage) {
    logger.error('deck-page', 'failed to read cards', { code: cardsErrorCode, message: cardsErrorMessage });
  }

  const deckTitleMeta = parseDeckTitleMetadata(deck.title);
  const sessionBounds = getSessionCardBounds(totalCards);

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
    logger.error('deck-page', 'failed to read card mastery state', { message: masteryRowsErrorMessage });
  }

  const masteryPercentage = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;
  const unprovenCards = Math.max(totalCards - masteredCards, 0);
  const hasCards = totalCards > 0;

  const scopeOptions = [
    { value: 'due', label: 'Due only', defaultChecked: true },
    { value: 'include_reviewed', label: 'Include reviewed', defaultChecked: false },
    { value: 'unmastered_only', label: 'Unmastered only', defaultChecked: false },
  ];

  const modeOptions = [
    { value: 'mcq', label: 'Multiple choice', defaultChecked: true },
    { value: 'identification', label: 'Identification', defaultChecked: false },
  ];

  const addContentSection = (
    <>
      <div id="add-content" className="flex flex-wrap items-end justify-between gap-3 scroll-mt-28">
        <div>
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            {hasCards ? 'Add content' : 'Start here'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasCards
              ? 'Add individual cards, bulk-import structured notes, or generate cards from a PDF.'
              : 'Add cards, bulk-import notes, or generate from a PDF to unlock study and quiz modes.'}
          </p>
        </div>
        <BulkImportModal deckId={deckId} />
      </div>

      <AddCardForm deckId={deckId} />
      <PDFUploadZone deckId={deckId} />
      <DeckChatWidget deckId={deckId} />
    </>
  );

  return (
    <div className="container mx-auto space-y-8 p-6 md:p-8">
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Button asChild variant="ghost" size="sm" className="gap-2 px-2">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <ShareDeckButton deckId={deckId} initialToken={deck.share_token} />
            <ThemeToggle />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-.03em]">
              {deckTitleMeta.cleanTitle}
            </h1>
            {deckTitleMeta.tag ? (
              <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                {deckTitleMeta.tag}
              </span>
            ) : null}
          </div>

          {deck.description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{deck.description}</p>
          ) : null}
        </div>

        {/* Deck telemetry (§7.9). Mastery is the only reading here that is a
            state, so it is the only one that can take a hue. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Telemetry label="Cards" value={totalCards} />
          <Telemetry label="Quiz-ready" value={`${quizReadyCards}/${totalCards}`} />
          <Telemetry
            label="Mastery"
            value={`${masteryPercentage}%`}
            tone={masteryPercentage >= 70 ? 'mastered' : 'ink'}
          />
          <Telemetry label="Proven" value={`${masteredCards}/${totalCards}`} />
          <Telemetry label="Last quiz" value={formatLastQuizAge(lastQuizAt)} />
        </div>

        <div className="h-[3px] w-full bg-border" aria-hidden="true">
          <div
            className="h-full"
            style={{
              width: `${Math.min(masteryPercentage, 100)}%`,
              backgroundColor: masteryBarColor(masteryPercentage),
            }}
          />
        </div>

        {lastQuizAt === null ? (
          <p className="text-sm text-muted-foreground">
            Take your first quiz to start measuring mastery.
          </p>
        ) : null}
      </header>

      {topTopics.length > 0 ? (
        <section className="surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Top concepts
            </h2>
            <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              From AI topic tags
            </p>
          </div>
          {/* A count is a better badge than a tint (§6), and a topic is not an
              SM-2 state, so it gets no colour at all. */}
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {topTopics.map(([topic, count]) => (
              <li key={topic} className="flex items-baseline gap-2 text-sm">
                <span className="text-ink">{topic}</span>
                <span className="font-mono text-[13px] tnum text-ink-dimmer">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasCards ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── Review ── */}
          <form action={`/dashboard/${deckId}/study`} method="get" className="surface flex flex-col p-5">
            <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Review flashcards
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Spaced repetition. This is the flow that advances your daily review count, streak and
              heatmap.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
              <label className="space-y-1.5 text-left">
                <span className="block font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
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

              <fieldset className="space-y-1.5">
                <legend className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Card scope
                </legend>
                <div className="flex flex-wrap gap-2">
                  {scopeOptions.map((option) => (
                    <label
                      key={option.value}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-control)] px-3 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-raised has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]"
                    >
                      <input
                        type="radio"
                        name="scope"
                        value={option.value}
                        defaultChecked={option.defaultChecked}
                        className="accent-[var(--accent)]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <p className="mt-4 border-l-2 border-border-strong pl-3 text-xs leading-relaxed text-muted-foreground">
              Due mode keeps normal SM-2 scheduling. Include reviewed fills the session with
              scheduled cards even when they are not due yet. Unmastered covers cards still in new,
              learning or relearning states.
            </p>

            <div className="mt-5 flex justify-end pt-1">
              {/* The deck page's one filled button (§7.2): review is the flow
                  the whole product is built around. */}
              <Button type="submit" variant="primary">
                Review flashcards
              </Button>
            </div>
          </form>

          {/* ── Quiz ── */}
          <form action={`/dashboard/${deckId}/quiz`} method="get" className="surface flex flex-col p-5">
            <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Take quiz
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Test what you know in a dedicated assessment. Quiz results update this deck&apos;s
              mastery score.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
              <label className="space-y-1.5 text-left">
                <span className="block font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
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

              <fieldset className="space-y-1.5">
                <legend className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Mode
                </legend>
                <div className="flex flex-wrap gap-2">
                  {modeOptions.map((option) => (
                    <label
                      key={option.value}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-control)] px-3 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-raised has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]"
                    >
                      <input
                        type="radio"
                        name="mode"
                        value={option.value}
                        defaultChecked={option.defaultChecked}
                        className="accent-[var(--accent)]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="mt-4 space-y-1.5">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  name="focus_unproven"
                  value="1"
                  className="accent-[var(--accent)]"
                />
                Include all unproven cards (<span className="font-mono tnum">{unprovenCards}</span>)
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Expands the quiz to cover every card not yet proven in quiz mastery.
              </p>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
              <p className="text-xs text-muted-foreground">
                {quizReadyCards < totalCards
                  ? 'Some cards still need AI enrichment. The quiz route prepares missing prompts automatically.'
                  : 'All cards are ready for both quiz modes.'}
              </p>
              <Button type="submit">Start quiz</Button>
            </div>
          </form>
        </div>
      ) : (
        <section className="surface flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              This deck is empty. Add your first cards to unlock study and quiz.
            </p>
            <p className="text-sm text-muted-foreground">
              Write one card, bulk-import your notes, or generate cards from a PDF.
            </p>
          </div>
          <Button asChild variant="primary">
            <Link href="#add-content">Add cards now</Link>
          </Button>
        </section>
      )}

      {addContentSection}

      <DeckCardsManager
        deckId={deckId}
        cards={cards}
        totalCards={totalCards}
        errorMessage={cardsErrorMessage}
      />

      {hasCards ? (
        <>
          <Suspense fallback={<WeakestConceptsSkeleton />}>
            <WeakestConcepts deckId={deckId} />
          </Suspense>

          <Suspense fallback={<QuizHistorySkeleton />}>
            <QuizHistorySection deckId={deckId} />
          </Suspense>
        </>
      ) : null}
    </div>
  );
}
