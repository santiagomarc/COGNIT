import { notFound, redirect } from 'next/navigation';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
import { FlashcardReviewClient } from '@/components/ui/shared/FlashcardReviewClient';
import {
  MAX_SESSION_CARD_COUNT,
  NEW_CARDS_PER_SESSION,
  NEW_CARD_INTERLEAVE_EVERY,
  interleaveNewCards,
  normalizeSessionCardCount,
  normalizeStudyScope,
  parseSessionCardIds,
  type StudyScope,
  type StudySessionCard,
} from '@/lib/study';
import { DEFAULT_EASE_FACTOR } from '@/lib/sm2';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { loadCapstoneCandidates } from '@/lib/synthesis/loaders';

/**
 * `gradeCard` queues the lapse mnemonic with `after()`, and that work shares
 * this route's budget. Pinned rather than left to the platform default, which
 * is 10–15 s without Fluid compute.
 */
export const maxDuration = 60;

type StudyPageProps = {
  params: Promise<{
    deckId: string;
  }>;
  searchParams?: Promise<{
    count?: string | string[];
    scope?: string | string[];
    /** Comma-separated card ids: an explicit session, e.g. the cards a drill pulled forward. */
    cards?: string | string[];
  }>;
};

export default async function DeckStudyPage({ params, searchParams }: StudyPageProps) {
  const { deckId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);

  if (!user) {
    redirect('/login');
  }

  const explicitCardIds = parseSessionCardIds(resolvedSearchParams?.cards);
  // An explicit card list is a review of exactly those cards, due or not.
  const studyScope: StudyScope = explicitCardIds.length > 0 ? 'include_reviewed' : normalizeStudyScope(resolvedSearchParams?.scope);
  const now = new Date().toISOString();

  /*
   * One wave. The deck read, the deck-wide count (for the empty state), the
   * session's cards and the capstone candidates are independent; this page
   * used to await them in three steps.
   *
   * Session composition (improvement plan §4.6): reviews and (re)learning
   * cards that are due come first — they are the ones decaying — and new
   * cards are interleaved one per three so a session never opens with a run
   * of unseen terms. `next_review_at` is NOT NULL (default now()), so the old
   * `is.null` clause matched nothing and a never-studied card sorted by its
   * creation time, ahead of every overdue review.
   */
  const SELECT = 'id, front, back, state, interval, ease_factor, repetition_count, next_review_at, mcq_distractors, id_question, topic_tags, mnemonic';
  const base = () => supabase.from('cards').select(SELECT).eq('deck_id', deckId);
  // Bounded by the maximum session so the count query is never the limiter.
  const readCap = MAX_SESSION_CARD_COUNT;

  const [{ data: deck }, { count: totalInDeck }, capstoneDrills, ...cardReads] = await Promise.all([
    supabase.from('decks').select('id, title').eq('id', deckId).eq('user_id', user.id).single(),
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('deck_id', deckId),
    loadCapstoneCandidates(supabase, { deckId, userId: user.id }),
    ...(explicitCardIds.length > 0
      ? [base().in('id', explicitCardIds).order('next_review_at', { ascending: true }).limit(readCap)]
      : studyScope === 'due'
        ? [
          // Due reviews and (re)learning steps, most overdue first.
          base().neq('state', 'new').lte('next_review_at', now).order('next_review_at', { ascending: true }).limit(readCap),
          // Unseen cards, oldest first; the per-session allowance is applied below.
          base().eq('state', 'new').order('created_at', { ascending: true }).limit(readCap),
        ]
        : studyScope === 'unmastered_only'
          ? [
            base().in('state', ['learning', 'relearning']).order('next_review_at', { ascending: true }).limit(readCap),
            base().eq('state', 'new').order('created_at', { ascending: true }).limit(readCap),
          ]
          : [
            // include_reviewed: everything, soonest review first, new cards after.
            base().neq('state', 'new').order('next_review_at', { ascending: true }).limit(readCap),
            base().eq('state', 'new').order('created_at', { ascending: true }).limit(readCap),
          ]),
  ]);

  if (!deck) {
    notFound();
  }

  const sessionCardCount = explicitCardIds.length > 0
    ? explicitCardIds.length
    : normalizeSessionCardCount(resolvedSearchParams?.count, totalInDeck ?? 0);

  const [scheduledRows, freshRows] = [cardReads[0]?.data ?? [], cardReads[1]?.data ?? []];
  // New cards trickle in beside reviews, but never displace them; when there
  // is nothing scheduled (a brand-new deck) they fill the session instead.
  const newAllowance = Math.max(NEW_CARDS_PER_SESSION, sessionCardCount - scheduledRows.length);
  const dueCards = explicitCardIds.length > 0
    ? scheduledRows
    : interleaveNewCards(scheduledRows, freshRows.slice(0, newAllowance), { every: NEW_CARD_INTERLEAVE_EVERY })
      .slice(0, sessionCardCount);

  const cards: StudySessionCard[] = (dueCards ?? []).map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    state: (c.state ?? 'new') as 'new' | 'learning' | 'review' | 'relearning',
    interval: c.interval ?? 0,
    ease_factor: c.ease_factor ?? DEFAULT_EASE_FACTOR,
    repetition_count: c.repetition_count ?? 0,
    mcq_distractors: Array.isArray(c.mcq_distractors) ? c.mcq_distractors.filter((value): value is string => typeof value === 'string') : null,
    id_question: typeof c.id_question === 'string' ? c.id_question : null,
    topic_tags: Array.isArray(c.topic_tags) ? c.topic_tags.filter((value): value is string => typeof value === 'string') : null,
    mnemonic: typeof c.mnemonic === 'string' ? c.mnemonic : null,
  }));

  return (
    <FlashcardReviewClient
      deckId={deckId}
      deckTitle={removeDeckTagFromTitle(deck.title)}
      cards={cards}
      totalInDeck={totalInDeck ?? 0}
      studyScope={studyScope}
      capstoneDrills={capstoneDrills}
    />
  );
}
