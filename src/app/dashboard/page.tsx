import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CreateDeckModal } from '@/components/ui/shared/CreateDeckModal';
import { DeckGrid } from '@/components/ui/shared/DeckGrid';
import { DueTodayCard } from '@/components/ui/shared/DueTodayCard';
import { StudyStreakCard } from '@/components/ui/shared/StudyStreakCard';
import { FadeInUp } from '@/components/motion';
import { Layers } from 'lucide-react';
import { computeDeckMasterySnapshots } from '@/lib/quiz-progress';

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // ── Fetch decks with card counts ──
  const { data: decks } = await supabase
    .from('decks')
    .select('id, title, created_at, cards(count)')
    .order('created_at', { ascending: false });

  const deckRows = (decks as { id: string; title: string; created_at: string; cards: { count: number }[] }[] | null) ?? [];
  const totalCardsByDeck = new Map(deckRows.map((deck) => [deck.id, deck.cards?.[0]?.count ?? 0]));

  // ── Fetch cards due today (next_review_at <= now) ──
  const now = new Date().toISOString();
  const { data: dueCards } = await supabase
    .from('cards')
    .select('id, deck_id')
    .lte('next_review_at', now);

  // Build "due today" per-deck breakdown
  const dueByDeck = new Map<string, number>();
  for (const card of dueCards ?? []) {
    dueByDeck.set(card.deck_id, (dueByDeck.get(card.deck_id) ?? 0) + 1);
  }

  const deckBreakdown = (decks ?? [])
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

  // ── Compute study streak from study_logs ──
  const { data: studyDays } = await supabase
    .from('study_logs')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5000);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);

  const { data: recentActivityLogs } = await supabase
    .from('study_logs')
    .select('created_at')
    .eq('user_id', user.id)
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('created_at', { ascending: true })
    .limit(10000);

  const { count: totalStudiedCards } = await supabase
    .from('study_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  let masteryByDeck = computeDeckMasterySnapshots({
    totalCardsByDeck,
    quizResults: [],
    quizCardResults: [],
  });

  const { data: quizResults, error: quizResultsError } = await supabase
    .from('quiz_results')
    .select('id, deck_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (!quizResultsError && quizResults && quizResults.length > 0) {
    const { data: quizCardResults, error: quizCardResultsError } = await supabase
      .from('quiz_card_results')
      .select('quiz_result_id, card_id, correct')
      .in('quiz_result_id', quizResults.map((row) => row.id))
      .limit(20000);

    if (!quizCardResultsError && quizCardResults) {
      masteryByDeck = computeDeckMasterySnapshots({
        totalCardsByDeck,
        quizResults,
        quizCardResults,
      });
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
            return {
              ...deck,
              masteryPercentage: mastery?.masteryPercentage ?? 0,
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