import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CreateDeckModal } from '@/components/ui/shared/CreateDeckModal';
import { SemanticSearchModal } from '@/components/ui/shared/SemanticSearchModal';
import { DeckGrid } from '@/components/ui/shared/DeckGrid';
import { DashboardOnboarding } from '@/components/ui/shared/DashboardOnboarding';
import { DueTodayCard } from '@/components/ui/shared/DueTodayCard';
import { StudyStreakCard } from '@/components/ui/shared/StudyStreakCard';
import { FadeInUp } from '@/components/motion';
import { loadDueByDeckRows, type DueCardsByDeckRow } from '@/lib/dashboard-due';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { Layers } from 'lucide-react';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type DashboardDeckRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  cards: { count: number }[];
};

type ActivityDayRow = { activity_date: string; review_count: number };
type DeckMasterySummaryRow = { deck_id: string; assessed_cards: number; mastered_cards: number; last_quiz_at: string };

type DashboardSnapshot = {
  deckRows: DashboardDeckRow[];
  deckQueryUsedFallback: boolean;
  deckQueryErrorMessage: string | null;
  dueByDeckRows: DueCardsByDeckRow[];
  activityDays: ActivityDayRow[];
  totalStudiedCards: number;
  masterySummaryRows: DeckMasterySummaryRow[];
};

// One row per distinct day ever studied, with that day's review count —
// replaces two raw study_logs fetches (capped at 5,000 and 10,000 rows) that
// existed only to compute this same grouping in Node.
async function loadActivityDays(supabase: SupabaseServerClient, userId: string): Promise<ActivityDayRow[]> {
  const rpcResult = await supabase.rpc('get_study_activity_days', { p_user_id: userId });

  if (rpcResult.error) {
    console.error('[dashboard] get_study_activity_days rpc failed:', rpcResult.error.message);
    return [];
  }

  return rpcResult.data ?? [];
}

// Per-deck mastery totals grouped server-side — replaces fetching every
// card_mastery_state row (up to 20,000) just to group them in Node.
async function loadMasterySummary(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<DeckMasterySummaryRow[]> {
  const rpcResult = await supabase.rpc('get_deck_mastery_summary', { p_user_id: userId });

  if (rpcResult.error) {
    console.error('[dashboard] get_deck_mastery_summary rpc failed:', rpcResult.error.message);
    return [];
  }

  return rpcResult.data ?? [];
}


async function loadDeckRowsWithFallback(supabase: SupabaseServerClient) {
  const { data: relationalDecks, error: relationalDecksError } = await supabase
    .from('decks')
    .select('id, title, description, created_at, updated_at, cards!cards_deck_id_fkey(count)')
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
    .select('id, title, description, created_at, updated_at')
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
        description: deck.description,
        created_at: deck.created_at ?? new Date().toISOString(),
        updated_at: deck.updated_at ?? new Date().toISOString(),
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
    description: deck.description,
    created_at: deck.created_at ?? new Date().toISOString(),
    updated_at: deck.updated_at ?? new Date().toISOString(),
    cards: [{ count: cardsByDeck.get(deck.id) ?? 0 }],
  }));

  return {
    deckRows,
    usedFallback: true,
    errorMessage: relationalDecksError.message,
  };
}

async function loadDashboardSnapshot(userId: string): Promise<DashboardSnapshot> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const {
    deckRows,
    usedFallback: deckQueryUsedFallback,
    errorMessage: deckQueryErrorMessage,
  } = await loadDeckRowsWithFallback(supabase);

  const [dueByDeckRows, activityDays, { count: totalStudiedCards }, masterySummary] = await Promise.all([
    loadDueByDeckRows(supabase, userId, nowIso),
    loadActivityDays(supabase, userId),
    supabase
      .from('study_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    loadMasterySummary(supabase, userId),
  ]);

  return {
    deckRows,
    deckQueryUsedFallback,
    deckQueryErrorMessage,
    dueByDeckRows,
    activityDays,
    totalStudiedCards: totalStudiedCards ?? 0,
    masterySummaryRows: masterySummary,
  };
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const {
    deckRows,
    deckQueryUsedFallback,
    deckQueryErrorMessage,
    dueByDeckRows,
    activityDays,
    totalStudiedCards,
    masterySummaryRows,
  } = await loadDashboardSnapshot(user.id);

  if (deckQueryUsedFallback && deckQueryErrorMessage) {
    console.warn('[dashboard] relational deck count query failed, fallback was used:', deckQueryErrorMessage);
  }

  // Build "due today" per-deck breakdown
  const dueByDeck = new Map(dueByDeckRows.map((row) => [row.deck_id, row.due_count]));

  const deckBreakdown = deckRows
    .filter((d) => dueByDeck.has(d.id))
    .map((d) => ({
      deckId: d.id,
      deckTitle: removeDeckTagFromTitle(d.title),
      dueCount: dueByDeck.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.dueCount - a.dueCount);

  const totalDue = dueByDeckRows.reduce((total, row) => total + row.due_count, 0);
  const totalDecks = deckRows.length;
  const totalCards = deckRows.reduce((sum, deck) => sum + (deck.cards?.[0]?.count ?? 0), 0);

  const masteryByDeck = new Map<string, { assessedCards: number; masteredCards: number; lastQuizAt: string | null }>();
  for (const row of masterySummaryRows) {
    masteryByDeck.set(row.deck_id, {
      assessedCards: row.assessed_cards,
      masteredCards: row.mastered_cards,
      lastQuizAt: row.last_quiz_at,
    });
  }

  // Already deduplicated by day (the RPC groups by activity_date)
  const uniqueDays = new Set<string>(activityDays.map((row) => row.activity_date));

  const sortedDays = Array.from(uniqueDays).sort((a, b) => b.localeCompare(a)); // newest first
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  let streak = 0;
  let check = today;
  const studiedToday = sortedDays.includes(today);

  const activityByDate = new Map<string, number>(
    activityDays.map((row) => [row.activity_date, row.review_count])
  );

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
          <div className="flex items-center gap-3">
            <SemanticSearchModal />
            <ThemeToggle />
          </div>
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
            totalStudiedCards={totalStudiedCards}
            todayStudiedCount={todayStudiedCount}
            todayIso={today}
            activity={activity}
          />
        </div>
      </div>

      {/* ── Deck Grid with Search ── */}
      {deckRows.length === 0 ? (
        <FadeInUp delay={0.15}>
          <DashboardOnboarding />
        </FadeInUp>
      ) : (
      <FadeInUp delay={0.15}>
        <div id="deck-collection" className="scroll-mt-24">
        <DeckGrid
          decks={deckRows
            .map((deck) => {
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
      )}
    </div>
  );
}