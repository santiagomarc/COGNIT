import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CreateDeckModal } from '@/components/ui/shared/CreateDeckModal';
import { DeckGrid } from '@/components/ui/shared/DeckGrid';
import { DueTodayCard } from '@/components/ui/shared/DueTodayCard';
import { StudyStreakCard } from '@/components/ui/shared/StudyStreakCard';
import { FadeInUp } from '@/components/motion';
import { computeDeckMasterySnapshots } from '@/lib/quiz-progress';
import { isMissingTableError } from '@/lib/supabase-errors';
import { Layers } from 'lucide-react';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type DashboardDeckRow = { id: string; title: string; created_at: string; cards: { count: number }[] };

async function loadLegacyDeckMastery(
  supabase: SupabaseServerClient,
  userId: string,
  totalCardsByDeck: Map<string, number>,
) {
  const deckIds = Array.from(totalCardsByDeck.keys());
  if (deckIds.length === 0) {
    return new Map<string, { assessedCards: number; masteredCards: number; lastQuizAt: string | null }>();
  }

  const { data: quizResults, error: quizResultsError } = await supabase
    .from('quiz_results')
    .select('id, deck_id, created_at')
    .eq('user_id', userId)
    .in('deck_id', deckIds)
    .order('created_at', { ascending: false })
    .limit(20000);

  if (quizResultsError || !quizResults) {
    console.error('[dashboard] failed to read legacy quiz results:', quizResultsError?.message);
    return new Map();
  }

  if (quizResults.length === 0) {
    return new Map();
  }

  const quizCardResults: { quiz_result_id: string; card_id: string; correct: boolean }[] = [];
  const quizResultIds = quizResults.map((row) => row.id);
  const chunkSize = 500;

  for (let index = 0; index < quizResultIds.length; index += chunkSize) {
    const chunk = quizResultIds.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from('quiz_card_results')
      .select('quiz_result_id, card_id, correct')
      .in('quiz_result_id', chunk);

    if (error) {
      console.error('[dashboard] failed to read legacy quiz card results:', error.message);
      return new Map();
    }

    quizCardResults.push(...(data ?? []));
  }

  const snapshots = computeDeckMasterySnapshots({
    totalCardsByDeck,
    quizResults,
    quizCardResults,
  });

  const masteryByDeck = new Map<string, { assessedCards: number; masteredCards: number; lastQuizAt: string | null }>();
  for (const [deckId, snapshot] of snapshots.entries()) {
    masteryByDeck.set(deckId, {
      assessedCards: snapshot.assessedCards,
      masteredCards: snapshot.masteredCards,
      lastQuizAt: snapshot.lastQuizAt,
    });
  }

  return masteryByDeck;
}

async function loadDeckRowsWithFallback(supabase: SupabaseServerClient) {
  const { data: relationalDecks, error: relationalDecksError } = await supabase
    .from('decks')
    .select('id, title, created_at, cards(count)')
    .order('created_at', { ascending: false });

  if (!relationalDecksError) {
    return {
      deckRows: (relationalDecks as DashboardDeckRow[] | null) ?? [],
      usedFallback: false,
      errorMessage: null as string | null,
    };
  }

  const { data: decks, error: decksError } = await supabase
    .from('decks')
    .select('id, title, created_at')
    .order('created_at', { ascending: false });

  if (decksError || !decks) {
    return {
      deckRows: [] as DashboardDeckRow[],
      usedFallback: true,
      errorMessage: decksError?.message ?? relationalDecksError.message,
    };
  }

  const deckIdRows = decks.map((deck) => ({ id: deck.id }));
  const deckIds = deckIdRows.map((deck) => deck.id);

  let cardsByDeck = new Map<string, number>();
  if (deckIds.length > 0) {
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('deck_id')
      .in('deck_id', deckIds)
      .limit(50000);

    if (cardsError) {
      const deckRowsWithoutCounts: DashboardDeckRow[] = decks.map((deck) => ({
        id: deck.id,
        title: deck.title,
        created_at: deck.created_at,
        cards: [{ count: 0 }],
      }));

      return {
        deckRows: deckRowsWithoutCounts,
        usedFallback: true,
        errorMessage: cardsError.message,
      };
    }

    cardsByDeck = new Map<string, number>();
    for (const card of cards ?? []) {
      cardsByDeck.set(card.deck_id, (cardsByDeck.get(card.deck_id) ?? 0) + 1);
    }
  }

  const deckRows: DashboardDeckRow[] = decks.map((deck) => ({
    id: deck.id,
    title: deck.title,
    created_at: deck.created_at,
    cards: [{ count: cardsByDeck.get(deck.id) ?? 0 }],
  }));

  return {
    deckRows,
    usedFallback: true,
    errorMessage: relationalDecksError.message,
  };
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);

  const {
    deckRows,
    usedFallback: deckQueryUsedFallback,
    errorMessage: deckQueryErrorMessage,
  } = await loadDeckRowsWithFallback(supabase);

  const [
    { data: dueCards },
    { data: studyDays },
    { data: recentActivityLogs },
    { count: totalStudiedCards },
    { data: masteryStateRows, error: masteryStateError },
  ] = await Promise.all([
    supabase
      .from('cards')
      .select('id, deck_id')
      .lte('next_review_at', nowIso),
    supabase
      .from('study_logs')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('study_logs')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true })
      .limit(10000),
    supabase
      .from('study_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('card_mastery_state')
      .select('deck_id, correct, last_quiz_at')
      .eq('user_id', user.id)
      .limit(20000),
  ]);

  if (deckQueryUsedFallback && deckQueryErrorMessage) {
    console.warn('[dashboard] relational deck count query failed, fallback was used:', deckQueryErrorMessage);
  }

  // Build "due today" per-deck breakdown
  const dueByDeck = new Map<string, number>();
  for (const card of dueCards ?? []) {
    dueByDeck.set(card.deck_id, (dueByDeck.get(card.deck_id) ?? 0) + 1);
  }

  const deckBreakdown = deckRows
    .filter((d) => dueByDeck.has(d.id))
    .map((d) => ({
      deckId: d.id,
      deckTitle: d.title,
      dueCount: dueByDeck.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.dueCount - a.dueCount);

  const totalDue = dueCards?.length ?? 0;
  const totalDecks = deckRows.length;
  const totalCards = deckRows.reduce((sum, deck) => sum + (deck.cards?.[0]?.count ?? 0), 0);
  const totalCardsByDeck = new Map(deckRows.map((deck) => [deck.id, deck.cards?.[0]?.count ?? 0]));

  const masteryByDeck = new Map<string, { assessedCards: number; masteredCards: number; lastQuizAt: string | null }>();
  for (const row of masteryStateRows ?? []) {
    const existing = masteryByDeck.get(row.deck_id) ?? {
      assessedCards: 0,
      masteredCards: 0,
      lastQuizAt: null,
    };

    existing.assessedCards += 1;
    if (row.correct) {
      existing.masteredCards += 1;
    }

    if (!existing.lastQuizAt || existing.lastQuizAt < row.last_quiz_at) {
      existing.lastQuizAt = row.last_quiz_at;
    }

    masteryByDeck.set(row.deck_id, existing);
  }

  if (masteryStateError) {
    if (isMissingTableError(masteryStateError.message, 'card_mastery_state')) {
      const legacyMasteryByDeck = await loadLegacyDeckMastery(supabase, user.id, totalCardsByDeck);
      for (const [deckId, snapshot] of legacyMasteryByDeck.entries()) {
        masteryByDeck.set(deckId, snapshot);
      }
    } else {
      console.error('[dashboard] failed to read card mastery state:', masteryStateError.message);
    }
  }

  // Deduplicate by date (UTC)
  const uniqueDays = new Set<string>();
  for (const log of studyDays ?? []) {
    uniqueDays.add(log.created_at.slice(0, 10)); // YYYY-MM-DD
  }

  const sortedDays = Array.from(uniqueDays).sort((a, b) => b.localeCompare(a)); // newest first
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  let streak = 0;
  let check = today;
  const studiedToday = sortedDays.includes(today);

  const activityByDate = new Map<string, number>();
  for (const log of recentActivityLogs ?? []) {
    const day = log.created_at.slice(0, 10);
    activityByDate.set(day, (activityByDate.get(day) ?? 0) + 1);
  }

  const activity = Array.from(activityByDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayStudiedCount = activityByDate.get(today) ?? 0;

  // If the user hasn't studied today, start counting from yesterday
  if (!studiedToday && sortedDays.length > 0 && sortedDays[0] === yesterday) {
    check = yesterday;
  }

  for (const day of sortedDays) {
    if (day === check) {
      streak++;
      // Move check to previous day
      const d = new Date(check + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      check = d.toISOString().slice(0, 10);
    } else if (day < check) {
      break; // gap found
    }
  }

  // Longest streak (simple scan)
  let longestStreak = 0;
  let currentRun = 0;
  const allDaysSorted = Array.from(uniqueDays).sort(); // oldest first
  for (let i = 0; i < allDaysSorted.length; i++) {
    if (i === 0) {
      currentRun = 1;
    } else {
      const prev = new Date(allDaysSorted[i - 1] + 'T00:00:00Z');
      prev.setUTCDate(prev.getUTCDate() + 1);
      if (prev.toISOString().slice(0, 10) === allDaysSorted[i]) {
        currentRun++;
      } else {
        currentRun = 1;
      }
    }
    longestStreak = Math.max(longestStreak, currentRun);
  }

  return (
    <div className="container mx-auto p-6 md:p-8 pb-28 space-y-8">
      {/* ── Header ── */}
      <FadeInUp>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="glow-title text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Welcome back, {user.email}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </FadeInUp>

      {/* ── Stats Row: Due Today + Activity Board ── */}
      <div className="grid items-stretch gap-4 md:grid-cols-3">
        <div className="grid gap-4 md:h-full md:min-h-0 md:grid-rows-[7fr_5fr]">
          <DueTodayCard totalDue={totalDue} deckBreakdown={deckBreakdown} className="min-h-0" />

          <CreateDeckModal totalDecks={totalDecks} totalCards={totalCards} />
        </div>
        <div className="md:col-span-2 md:h-full">
          <StudyStreakCard
            streak={streak}
            longestStreak={longestStreak}
            studiedToday={studiedToday}
            totalStudiedCards={totalStudiedCards ?? 0}
            todayStudiedCount={todayStudiedCount}
            activity={activity}
          />
        </div>
      </div>

      {/* ── Deck Grid with Search ── */}
      <FadeInUp delay={0.15}>
        <div id="deck-collection" className="scroll-mt-24">
        <DeckGrid
          decks={deckRows.map((deck) => {
            const mastery = masteryByDeck.get(deck.id);
            const deckTotalCards = deck.cards?.[0]?.count ?? 0;
            const masteryPercentage = deckTotalCards > 0 && mastery
              ? Math.round((mastery.masteredCards / deckTotalCards) * 100)
              : 0;

            return {
              ...deck,
              masteryPercentage,
              assessedCards: mastery?.assessedCards ?? 0,
              lastQuizAt: mastery?.lastQuizAt ?? null,
            };
          })}
        />
        </div>
      </FadeInUp>
    </div>
  );
}