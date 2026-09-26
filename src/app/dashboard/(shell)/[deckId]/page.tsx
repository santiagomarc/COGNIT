import Link from 'next/link';
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { createClient } from '@/lib/supabase/server';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
import { AddContentPanel } from '@/components/ui/shared/AddContentPanel';
import { DeckCardsManager } from '@/components/ui/shared/DeckCardsManager';
import { DeckChatWidget } from '@/components/ui/shared/DeckChatWidget';
import { DeckReadings } from '@/components/ui/shared/DeckReadings';
import { DeckSegments, resolveDeckTab } from '@/components/ui/shared/DeckSegments';
import { DeckSessionLauncher } from '@/components/ui/shared/DeckSessionLauncher';
import { DrillHistory, DrillSignals, SynthesisInsightsSkeleton, WeakLinks } from '@/components/ui/shared/synthesis/SynthesisInsights';
import { QuestionBank, QuestionBankSkeleton } from '@/components/ui/shared/synthesis/QuestionBank';
import { QuizHistorySection, QuizHistorySkeleton } from '@/components/ui/shared/QuizHistorySection';
import { WeakestConcepts, WeakestConceptsSkeleton } from '@/components/ui/shared/WeakestConcepts';
import { ExportDeckMenu } from '@/components/ui/shared/ExportDeckMenu';
import { DeckListingToggle } from '@/components/ui/shared/DeckListingToggle';
import { MergeDeckDialog, type MergeTarget } from '@/components/ui/shared/MergeDeckDialog';
import { ConceptMapPanel } from '@/components/ui/shared/synthesis/ConceptMapPanel';
import { ShareDeckButton } from '@/components/ui/shared/ShareDeckButton';
import { StateTick, type TickState } from '@/components/ui/shared/StateTick';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { parseDeckTitleMetadata, removeDeckTagFromTitle } from '@/lib/deck-tags';
import { estimateSessionMinutes } from '@/lib/dashboard-forecast';
import { getSessionCardBounds } from '@/lib/study';
import { loadSynthesisReadings } from '@/lib/synthesis/loaders';
import type { SynthesisReadings } from '@/lib/synthesis/types';
import { logger } from '@/lib/logger';
import type { CardSource } from '@/index';

/**
 * Drill generation is invoked from this page: up to five parallel model calls
 * with a 12 s deadline each, retried once. The platform default (10–15 s
 * without Fluid compute) is below that worst case (audit R2).
 */
export const maxDuration = 60;

type DeckCardRow = {
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
  state: string | null;
  next_review_at: string | null;
};

type ScheduleBreakdown = {
  due: number;
  learning: number;
  scheduled: number;
  fresh: number;
};

type DeckDetailSnapshot = {
  deck: {
    id: string;
    title: string;
    description: string | null;
    created_at: string;
    share_token: string | null;
    exam_at: string | null;
    listed_at: string | null;
  } | null;
  deckErrorMessage: string | null;
  /** The user's other decks, for "Merge into" (Overview only). */
  mergeTargets: MergeTarget[];
  cards: DeckCardRow[];
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
  schedule: ScheduleBreakdown;
  synthesisReadings: SynthesisReadings;
};

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

/** When a card next comes up: `due` now, or `11h` / `4d` / `3mo` ahead. */
function formatNextReview(nextReviewAt: string | null): { label: string; state: TickState } {
  if (!nextReviewAt) return { label: '—', state: 'neutral' };

  const at = Date.parse(nextReviewAt);
  if (Number.isNaN(at)) return { label: '—', state: 'neutral' };

  const seconds = Math.round((at - Date.now()) / 1000);
  if (seconds <= 0) return { label: 'due', state: 'due' };
  if (seconds < 3600) return { label: `${Math.max(1, Math.round(seconds / 60))}m`, state: 'learning' };
  if (seconds < 86_400) return { label: `${Math.round(seconds / 3600)}h`, state: 'learning' };

  const days = Math.round(seconds / 86_400);
  if (days < 30) return { label: `${days}d`, state: days >= 21 ? 'mastered' : 'neutral' };
  if (days < 365) return { label: `${Math.round(days / 30)}mo`, state: 'mastered' };
  return { label: `${Math.round(days / 365)}y`, state: 'mastered' };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const EMPTY_READINGS: SynthesisReadings = { activeDrills: 0, due: 0, linksCovered: 0, linksTotal: 0, lastAttemptAt: null, plans: { active: 0, due: 0 } };

/** Deck-wide count of cards ready for MCQ — the whole deck, not the 60-card page. */
async function loadQuizReadyCount(supabase: SupabaseServerClient, deckId: string): Promise<number> {
  const { data, error } = await supabase.rpc('count_quiz_ready_cards', { p_deck_id: deckId });
  if (error) {
    logger.warn('deck-page', 'count_quiz_ready_cards rpc failed', { message: error.message });
    return 0;
  }
  return Number(data ?? 0);
}

/** Deck-wide topic-tag histogram, for the same pagination reason. */
async function loadTopTopics(supabase: SupabaseServerClient, deckId: string): Promise<Array<[string, number]>> {
  const { data, error } = await supabase.rpc('get_deck_topic_tag_counts', { p_deck_id: deckId, p_limit: 10 });
  if (error) {
    logger.warn('deck-page', 'get_deck_topic_tag_counts rpc failed', { message: error.message });
    return [];
  }
  return (data ?? []).map((row) => [row.topic_tag, Number(row.tag_count)] as [string, number]);
}

/**
 * The deck's SM-2 state, deck-wide, counted in Postgres by
 * `get_deck_schedule_breakdown`. `new` is a real bucket rather than a
 * leftover: the schema defaults `next_review_at` to `now()`, so a
 * never-studied card looks due unless its `state` is read alongside.
 */
async function loadScheduleBreakdown(supabase: SupabaseServerClient, deckId: string): Promise<ScheduleBreakdown> {
  const empty: ScheduleBreakdown = { due: 0, learning: 0, scheduled: 0, fresh: 0 };
  const { data, error } = await supabase.rpc('get_deck_schedule_breakdown', { p_deck_id: deckId });
  if (error) {
    logger.warn('deck-page', 'get_deck_schedule_breakdown rpc failed', { message: error.message });
    return empty;
  }
  const row = data?.[0];
  return row ? { due: row.due, learning: row.learning, scheduled: row.scheduled, fresh: row.fresh } : empty;
}

/**
 * Every read the deck workspace needs, in ONE wave. This used to be three:
 * the snapshot, then (quiz-ready, topics) once the count was known, then the
 * synthesis readings — each a full round-trip in front of first paint. None
 * of them depends on another's result; the `> 60` rule only decided which
 * result to USE, and the in-memory fallbacks for small decks just moved the
 * same arithmetic to Node.
 *
 * The 60-card page (with distractors and tags) is only read on the tabs that
 * render it; the chat and insights tabs still get the deck-wide count.
 */
async function loadDeckDetailSnapshot(
  supabase: SupabaseServerClient,
  userId: string,
  deckId: string,
  activeTab: string,
): Promise<DeckDetailSnapshot> {
  const wantsCards = activeTab === 'overview' || activeTab === 'cards';
  const wantsOverview = activeTab === 'overview';

  const [deckRes, cardsRes, masteryRes, schedule, quizReadyCards, topTopics, synthesisReadings, mergeTargetsRes] = await Promise.all([
    supabase
      .from('decks')
      .select('id, title, description, created_at, share_token, exam_at, listed_at')
      .eq('id', deckId)
      .single(),
    wantsCards
      ? supabase
        .from('cards')
        .select(
          'id, deck_id, front, back, created_at, source, imported_by, mcq_distractors, id_question, topic_tags, state, next_review_at',
          { count: 'exact' }
        )
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false })
        .range(0, 59)
      : supabase
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', deckId),
    supabase
      .from('card_mastery_state')
      .select('correct, last_quiz_at')
      .eq('user_id', userId)
      .eq('deck_id', deckId),
    loadScheduleBreakdown(supabase, deckId),
    loadQuizReadyCount(supabase, deckId),
    loadTopTopics(supabase, deckId),
    wantsOverview ? loadSynthesisReadings(supabase, { deckId, userId }) : Promise.resolve(EMPTY_READINGS),
    // `user_id` is not redundant: RLS also shows other people's shared decks.
    wantsOverview
      ? supabase
        .from('decks')
        .select('id, title, cards(count)')
        .eq('user_id', userId)
        .neq('id', deckId)
        .order('updated_at', { ascending: false })
        .limit(100)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; cards: Array<{ count: number }> }> }),
  ]);

  const { data: deck, error: deckError } = deckRes;
  const { error: cardsError, count: cardsCount } = cardsRes;
  const { data: masteryRows, error: masteryRowsError } = masteryRes;

  // The head-only branch returns `null` data; the page branch returns rows.
  const rawCards = (wantsCards ? (cardsRes.data as Array<Omit<DeckCardRow, 'source' | 'created_at'> & { source: string | null; created_at: string | null }> | null) : null) ?? [];
  const cards: DeckCardRow[] = rawCards.map((card) => ({
    ...card,
    created_at: card.created_at ?? new Date().toISOString(),
    source: card.source as CardSource,
  }));
  const totalCards = cardsCount ?? cards.length;

  return {
    deck: deck
      ? {
        ...deck,
        created_at: deck.created_at ?? new Date().toISOString(),
        share_token: deck.share_token ?? null,
        exam_at: deck.exam_at ?? null,
        listed_at: deck.listed_at ?? null,
      }
      : null,
    deckErrorMessage: deckError?.message ?? null,
    mergeTargets: (mergeTargetsRes.data ?? []).map((target) => ({
      id: target.id,
      title: removeDeckTagFromTitle(target.title),
      cardCount: target.cards?.[0]?.count ?? 0,
    })),
    cards,
    totalCards,
    quizReadyCards,
    topTopics,
    cardsErrorMessage: cardsError?.message ?? null,
    cardsErrorCode: cardsError?.code ?? null,
    masteryRows: masteryRows ?? [],
    masteryRowsErrorMessage: masteryRowsError?.message ?? null,
    schedule,
    synthesisReadings,
  };
}

type DeckDetailPageProps = {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * The deck workspace (Run 6, Phase 3 — Option A).
 *
 * This page used to be 617 lines rendering six `.surface` containers and about
 * ten major components in one column at near-equal visual weight — the owner's
 * words were "so many card containers, too overwhelming to see". Nothing has
 * been deleted. What changed is that the components are now organised in two
 * dimensions instead of one:
 *
 *  · across, by segment — overview / cards / insights / chat, in the URL, so
 *    only the active one renders and only its data loads;
 *  · down, by plane — a `.raised` launcher, a flat `.surface` readings panel,
 *    and a recessed `.well` for the card list.
 *
 * The two together take ten same-weight blocks down to three or four objects
 * per view, at three different elevations.
 */
export default async function DeckDetailPage({ params, searchParams }: DeckDetailPageProps) {
  const { deckId } = await params;
  const activeTab = resolveDeckTab((await searchParams)?.tab);

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);

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
    schedule,
    synthesisReadings,
    mergeTargets,
  } = await loadDeckDetailSnapshot(supabase, user.id, deckId, activeTab);

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
  const recentCards = cards.slice(0, 5);

  return (
    <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
      {/* ═══ Persistent header — identity, state, progress ═══════════════ */}
      <header>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasCards ? <ExportDeckMenu deckId={deckId} /> : null}
          {/* Listing is off until the directory ships (plan §4.1d: EXPLORE_ENABLED, after moderation). */}
          {deck.share_token && process.env.EXPLORE_ENABLED === 'true' ? (
            <DeckListingToggle deckId={deckId} initialListedAt={deck.listed_at} />
          ) : null}
          <ShareDeckButton deckId={deckId} initialToken={deck.share_token} />
        </div>

        <div className="mt-3 flex flex-col gap-y-4 lg:flex-row lg:items-end lg:justify-between lg:gap-x-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-serif text-[1.8125rem] leading-[1.08] tracking-[-0.02em] text-balance text-ink sm:type-display">
                {deckTitleMeta.cleanTitle}
              </h1>
              {deckTitleMeta.tag ? (
                <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  {deckTitleMeta.tag}
                </span>
              ) : null}
            </div>
            {deck.description ? (
              <p className="mt-1.5 max-w-2xl text-[13px] text-ink-dim">{deck.description}</p>
            ) : null}
          </div>

          {/* Mastery is the one reading here that is a state, so it is the only
              one that can take a hue (§2.2). */}
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-6 gap-y-3 lg:pb-1">
            <Telemetry label="Cards" value={totalCards} />
            <Telemetry label="Due" value={schedule.due} tone={schedule.due > 0 ? 'due' : 'ink'} />
            <Telemetry
              label="Mastery"
              value={`${masteryPercentage}%`}
              tone={masteryPercentage >= 70 ? 'mastered' : 'ink'}
            />
            <Telemetry label="Proven" value={`${masteredCards}/${totalCards}`} />
            <Telemetry label="Quiz-ready" value={`${quizReadyCards}/${totalCards}`} />
            <Telemetry label="Last quiz" value={formatLastQuizAge(lastQuizAt)} />
          </div>
        </div>
      </header>

      <DeckSegments deckId={deckId} active={activeTab} cardCount={totalCards} />

      <AddContentPanel deckId={deckId} hasCards={hasCards} />

      {/* ═══ Overview ═══════════════════════════════════════════════════ */}
      {activeTab === 'overview' ? (
        <>
          {hasCards ? (
            <DeckSessionLauncher
              deckId={deckId}
              dueCount={schedule.due}
              totalCards={totalCards}
              quizReadyCards={quizReadyCards}
              unprovenCards={unprovenCards}
              estimatedMinutes={estimateSessionMinutes(schedule.due)}
              sessionBounds={sessionBounds}
              synthesisReadings={synthesisReadings}
              synthesisTopics={topTopics.map(([tag]) => tag)}
              examAt={deck.exam_at}
            />
          ) : null}

          {hasCards ? (
            <Suspense fallback={<QuestionBankSkeleton />}>
              <QuestionBank deckId={deckId} />
            </Suspense>
          ) : null}

          <DeckReadings
            totalCards={totalCards}
            dueCount={schedule.due}
            learningCount={schedule.learning}
            scheduledCount={schedule.scheduled}
            newCount={schedule.fresh}
            masteredCards={masteredCards}
            masteryPercentage={masteryPercentage}
            topTopics={topTopics}
          />

          {recentCards.length > 0 ? (
            <section>
              <div className="flex items-center gap-3.5 pb-2.5">
                <h2 className="shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Recent cards
                </h2>
                <span className="rule flex-1" aria-hidden="true" />
                <span className="shrink-0 font-mono text-[11px] tnum text-ink-dimmer">
                  {totalCards} in this deck
                </span>
                <Link
                  href={`/dashboard/${deckId}?tab=cards`}
                  scroll={false}
                  className="shrink-0 rounded-[var(--radius-sm)] text-xs text-ink underline underline-offset-[3px] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  View all
                </Link>
              </div>

              {/*
                The card list is the deck's body and it is subordinate to the
                launcher above it, so it sits in the recessed plane. Overview
                keeps a window onto every other segment — this list, the
                scheduler split, the top concepts — so the segments organise
                rather than hide.
              */}
              <ul className="well overflow-hidden px-3.5">
                {recentCards.map((card) => {
                  const next = formatNextReview(card.next_review_at);
                  // `front` is the answer and `back` is the question in this
                  // schema; the component boundary is where that stops leaking.
                  const prompt = card.id_question ?? card.back;
                  const answer = card.front;

                  return (
                    <li
                      key={card.id}
                      className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
                    >
                      <StateTick state={next.state} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{prompt}</span>
                        <span className="block truncate text-xs text-ink-dimmer">{answer}</span>
                      </span>
                      <span className="hidden shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer sm:block">
                        {card.source === 'ai_pdf' ? 'PDF' : card.source === 'bulk_import' ? 'Bulk' : card.source === 'synthesis_claim' ? 'Drill' : 'Manual'}
                      </span>
                      <span
                        className="w-12 shrink-0 text-right font-mono text-[13px] tnum"
                        style={{
                          color:
                            next.state === 'due'
                              ? 'var(--state-due)'
                              : next.state === 'learning'
                                ? 'var(--state-learning)'
                                : next.state === 'mastered'
                                  ? 'var(--state-mastered)'
                                  : 'var(--ink-dim)',
                        }}
                      >
                        {next.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {activeTab === 'overview' && mergeTargets.length > 0 ? (
        <section className="well px-3.5 py-3" aria-label="Merge this deck">
          <MergeDeckDialog sourceDeckId={deckId} sourceTitle={deckTitleMeta.cleanTitle} targets={mergeTargets} />
        </section>
      ) : null}

      {/* ═══ Cards ══════════════════════════════════════════════════════ */}
      {activeTab === 'cards' ? (
        <DeckCardsManager
          deckId={deckId}
          cards={cards}
          totalCards={totalCards}
          errorMessage={cardsErrorMessage}
        />
      ) : null}

      {/* ═══ Insights ═══════════════════════════════════════════════════ */}
      {activeTab === 'insights' ? (
        hasCards ? (
          <>
            {/* The segment's one .raised object (plan §4.3, DS-01). */}
            <Suspense fallback={<SynthesisInsightsSkeleton />}>
              <ConceptMapPanel deckId={deckId} />
            </Suspense>

            <Suspense fallback={<WeakestConceptsSkeleton />}>
              <WeakestConcepts deckId={deckId} />
            </Suspense>

            <Suspense fallback={<QuizHistorySkeleton />}>
              <QuizHistorySection deckId={deckId} />
            </Suspense>

            <Suspense fallback={<SynthesisInsightsSkeleton />}>
              <DrillSignals deckId={deckId} />
            </Suspense>

            <Suspense fallback={<SynthesisInsightsSkeleton />}>
              <WeakLinks deckId={deckId} />
            </Suspense>

            <Suspense fallback={<SynthesisInsightsSkeleton />}>
              <DrillHistory deckId={deckId} />
            </Suspense>
          </>
        ) : (
          <p className="surface p-5 text-sm text-ink-dim">
            Insights appear once this deck has cards and at least one quiz.
          </p>
        )
      ) : null}

      {/* ═══ Chat ═══════════════════════════════════════════════════════ */}
      {activeTab === 'chat' ? <DeckChatWidget deckId={deckId} /> : null}
    </div>
  );
}
