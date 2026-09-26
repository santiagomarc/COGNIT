import type { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDueByDeck, getRequestClient, getRequestNow, getSessionUser } from '@/lib/supabase/session';
import { DeckGrid } from '@/components/ui/shared/DeckGrid';
import { TrashPanel } from '@/components/ui/shared/TrashPanel';
import { DashboardOnboarding } from '@/components/ui/shared/DashboardOnboarding';
import { GreetingHeader } from '@/components/ui/shared/GreetingHeader';
import { DueNowBand } from '@/components/ui/shared/DueNowBand';
import { CreateDeckPanel } from '@/components/ui/shared/CreateDeckPanel';
import { SignalPanel } from '@/components/ui/shared/SignalPanel';
import { resolveDisplayName } from '@/lib/display-name';
import type { DueCardsByDeckRow } from '@/lib/dashboard-due';
import {
  buildSevenDayForecast,
  estimateSessionMinutes,
  forecastFromDayCounts,
  overdueDaysSince,
  parseCardScheduleSummary,
  type ForecastDay,
} from '@/lib/dashboard-forecast';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { logger } from '@/lib/logger';
import { loadDueDrillsByDeck, type DueDrillsByDeck } from '@/lib/synthesis/loaders';

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

type ScheduleSummary = {
  forecastDays: ForecastDay[];
  easeByDeck: Map<string, number>;
  overdueDays: number | null;
};

type DashboardSnapshot = {
  deckRows: DashboardDeckRow[];
  deckQueryUsedFallback: boolean;
  deckQueryErrorMessage: string | null;
  dueByDeckRows: DueCardsByDeckRow[];
  activityDays: ActivityDayRow[];
  totalStudiedCards: number;
  masterySummaryRows: DeckMasterySummaryRow[];
  schedule: ScheduleSummary;
  dueDrills: DueDrillsByDeck;
};

// One row per distinct day ever studied, with that day's review count —
// replaces two raw study_logs fetches (capped at 5,000 and 10,000 rows) that
// existed only to compute this same grouping in Node.
async function loadActivityDays(supabase: SupabaseServerClient, userId: string): Promise<ActivityDayRow[]> {
  const rpcResult = await supabase.rpc('get_study_activity_days', { p_user_id: userId });

  if (rpcResult.error) {
    logger.error('dashboard', 'get_study_activity_days rpc failed', { message: rpcResult.error.message });
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
    logger.error('dashboard', 'get_deck_mastery_summary rpc failed', { message: rpcResult.error.message });
    return [];
  }

  return rpcResult.data ?? [];
}


/*
 * The seven-day forecast, each deck's mean ease, and the oldest overdue card —
 * aggregated in Postgres by `get_card_schedule_summary` and returned as
 * ~(7 + decks + 1) values. The row-based fallback that used to sit here read
 * up to 20,000 card rows per dashboard load; the RPC is live and verified by
 * `npm run verify:deployment`, so a failure is logged and rendered as empty.
 */
async function loadScheduleSummary(
  supabase: SupabaseServerClient,
  userId: string,
  now: Date
): Promise<ScheduleSummary> {
  const empty: ScheduleSummary = {
    forecastDays: buildSevenDayForecast([], now),
    easeByDeck: new Map(),
    overdueDays: null,
  };

  const rpcResult = await supabase.rpc('get_card_schedule_summary', {
    p_user_id: userId,
    p_now: now.toISOString(),
    p_days: 7,
  });

  if (rpcResult.error) {
    logger.error('dashboard', 'get_card_schedule_summary rpc failed', { message: rpcResult.error.message });
    return empty;
  }

  const summary = parseCardScheduleSummary(rpcResult.data);
  if (!summary) {
    logger.error('dashboard', 'get_card_schedule_summary returned an unexpected shape');
    return empty;
  }

  return {
    forecastDays: forecastFromDayCounts(summary.forecast, now),
    easeByDeck: new Map(summary.ease_by_deck.map((row) => [row.deck_id, row.mean_ease])),
    overdueDays: overdueDaysSince(summary.oldest_overdue_at, now),
  };
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
  const supabase = await getRequestClient();
  const now = getRequestNow();

  // Every read here is independent of the others, so they all run in one
  // wave. The deck-rows query used to be awaited on its own first, which put a
  // full extra round-trip in front of everything else on every dashboard load.
  const [
    { deckRows, usedFallback: deckQueryUsedFallback, errorMessage: deckQueryErrorMessage },
    dueByDeckRows,
    activityDays,
    { count: totalStudiedCards },
    masterySummary,
    schedule,
    dueDrills,
  ] = await Promise.all([
    loadDeckRowsWithFallback(supabase),
    getDueByDeck(userId),   // shared with the shell layout via React.cache
    loadActivityDays(supabase, userId),
    supabase
      .from('study_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    loadMasterySummary(supabase, userId),
    loadScheduleSummary(supabase, userId, now),
    loadDueDrillsByDeck(supabase, { userId, now }),
  ]);

  return {
    deckRows,
    deckQueryUsedFallback,
    deckQueryErrorMessage,
    dueByDeckRows,
    activityDays,
    totalStudiedCards: totalStudiedCards ?? 0,
    masterySummaryRows: masterySummary,
    schedule,
    dueDrills,
  };
}

export default async function Dashboard() {
  const user = await getSessionUser();

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
    schedule,
    dueDrills,
  } = await loadDashboardSnapshot(user.id);

  if (deckQueryUsedFallback && deckQueryErrorMessage) {
    logger.warn('dashboard', 'relational deck count query failed, fallback was used', { message: deckQueryErrorMessage });
  }

  // Build "due today" per-deck breakdown. Due means studied and owed; a deck
  // with only never-studied cards is a study-ahead target, not a due one.
  const dueByDeck = new Map(dueByDeckRows.map((row) => [row.deck_id, row.due_count]));
  const newByDeck = new Map(dueByDeckRows.map((row) => [row.deck_id, row.new_count]));

  const deckBreakdown = deckRows
    .filter((d) => (dueByDeck.get(d.id) ?? 0) > 0)
    .map((d) => ({
      deckId: d.id,
      deckTitle: removeDeckTagFromTitle(d.title),
      dueCount: dueByDeck.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.dueCount - a.dueCount);

  const totalDue = dueByDeckRows.reduce((total, row) => total + row.due_count, 0);
  const totalNew = dueByDeckRows.reduce((total, row) => total + row.new_count, 0);

  const { forecastDays, easeByDeck, overdueDays } = schedule;
  const estimatedMinutes = estimateSessionMinutes(totalDue);

  // card_mastery_state is keyed on the user, not resolved through decks, so a
  // trashed deck's rows still come back; count only decks the user can see (plan §4.1a).
  const visibleDeckIds = new Set(deckRows.map((deck) => deck.id));
  const visibleMasteryRows = masterySummaryRows.filter((row) => visibleDeckIds.has(row.deck_id));

  const masteryByDeck = new Map<string, { assessedCards: number; masteredCards: number; lastQuizAt: string | null }>();
  for (const row of visibleMasteryRows) {
    masteryByDeck.set(row.deck_id, {
      assessedCards: row.assessed_cards,
      masteredCards: row.mastered_cards,
      lastQuizAt: row.last_quiz_at,
    });
  }

  const assessedCards = visibleMasteryRows.reduce((sum, row) => sum + row.assessed_cards, 0);
  const masteredCards = visibleMasteryRows.reduce((sum, row) => sum + row.mastered_cards, 0);
  const retentionPercentage =
    assessedCards > 0 ? Math.round((masteredCards / assessedCards) * 100) : null;

  // Already deduplicated by day (the RPC groups by activity_date)
  const uniqueDays = new Set<string>(activityDays.map((row) => row.activity_date));

  const sortedDays = Array.from(uniqueDays).sort((a, b) => b.localeCompare(a)); // newest first
  const todayDate = getRequestNow();
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

  // The fallback session target when nothing is due. It used to also be where
  // an "import PDF" without a chosen target landed; that button is gone from
  // this page entirely (Run 6, requirement 3).
  const knownDeckIds = new Set(deckRows.map((deck) => deck.id));
  const mostRecentDeck = [...deckRows].sort((a, b) =>
    (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)
  )[0];

  /*
   * Resolved on the server so the greeting never round-trips an address to the
   * client. `null` is a real answer and GreetingHeader renders correctly for
   * it — see resolveDisplayName and audit finding F-06.
   */
  const greetingName = resolveDisplayName(user);

  // With nothing due, prefer the deck holding the most unseen cards over the
  // most recently touched one: that is where studying ahead does the most.
  const mostNewDeck = [...dueByDeckRows].sort((a, b) => b.new_count - a.new_count)[0];
  const sessionHref = deckBreakdown[0]
    ? `/dashboard/${deckBreakdown[0].deckId}/study`
    : mostNewDeck && mostNewDeck.new_count > 0 && knownDeckIds.has(mostNewDeck.deck_id)
      ? `/dashboard/${mostNewDeck.deck_id}/study?scope=include_reviewed`
      : mostRecentDeck
        ? `/dashboard/${mostRecentDeck.id}/study?scope=include_reviewed`
        : null;

  // The drills reading leads straight to the drill canvas (micro-synthesis
  // spec §4.1): the deck with the most due, restricted to decks this page knows about.
  const topDrillDeck = dueDrills.decks.find((deck) => knownDeckIds.has(deck.deckId));
  const dueDrillsReading = {
    total: dueDrills.total,
    deckCount: dueDrills.decks.length,
    href: topDrillDeck
      ? `/dashboard/${topDrillDeck.deckId}/synthesis?count=${Math.min(3, Math.max(1, topDrillDeck.dueCount))}&pull=1`
      : null,
  };
  const dueDrillsByDeck = new Map(dueDrills.decks.map((deck) => [deck.deckId, deck.dueCount]));

  return (
    /*
     * No bottom padding here, and none in any other page under /dashboard:
     * `dashboard/layout.tsx` is the single owner of bottom clearance, via
     * `var(--dock-clearance)` (F-03 closed).
     *
     * Four full-width bands, not a two-column split (Run 6, Task 2.4). The
     * 320px right rail is gone: it cost the deck table a fifth of its width at
     * deck names where that width is not spare, and the two readings it held
     * lose nothing by sitting in the signal panel instead.
     *
     * The band heights below are load-bearing. Requirement 1 — heatmap and
     * activity visible at first paint at 1440x900 — holds at these values;
     * anything added above the deck index pushes the heatmap under the fold.
     */
    <div className="container mx-auto flex flex-col gap-4 p-4 md:gap-4 md:px-8 md:py-6">
      <GreetingHeader
        name={greetingName}
        totalDue={totalDue}
        retentionPercentage={retentionPercentage}
        streakDays={streak}
        reviewedToday={todayStudiedCount}
        dueDeckCount={deckBreakdown.length}
        deckCount={deckRows.length}
      />

      {deckRows.length === 0 ? (
        <DashboardOnboarding />
      ) : (
        <>
          <section className="flex flex-col items-stretch gap-4 lg:flex-row">
            <div className="min-w-0 flex-1">
              <DueNowBand
                totalDue={totalDue}
                totalNew={totalNew}
                dueDecks={deckBreakdown}
                oldestOverdueDays={overdueDays}
                estimatedMinutes={estimatedMinutes}
                sessionHref={sessionHref}
                forecastDays={forecastDays}
                dueDrills={dueDrillsReading}
              />
            </div>

            <CreateDeckPanel deckCount={deckRows.length} />
          </section>

          <SignalPanel
            retentionPercentage={retentionPercentage}
            assessedCards={assessedCards}
            streak={streak}
            longestStreak={longestStreak}
            studiedToday={studiedToday}
            activity={activity}
            todayIso={today}
            totalStudiedCards={totalStudiedCards}
          />

          <div id="deck-collection" className="scroll-mt-24">
            <DeckGrid
              decks={deckRows.map((deck) => {
                const mastery = masteryByDeck.get(deck.id);
                const deckTotalCards = deck.cards?.[0]?.count ?? 0;
                const masteryPercentage =
                  deckTotalCards > 0 && mastery
                    ? Math.round((mastery.masteredCards / deckTotalCards) * 100)
                    : 0;

                return {
                  ...deck,
                  masteryPercentage,
                  assessedCards: mastery?.assessedCards ?? 0,
                  lastQuizAt: mastery?.lastQuizAt ?? null,
                  dueCount: dueByDeck.get(deck.id) ?? 0,
                  newCount: newByDeck.get(deck.id) ?? 0,
                  dueDrillCount: dueDrillsByDeck.get(deck.id) ?? 0,
                  easeFactor: easeByDeck.get(deck.id) ?? null,
                };
              })}
            />
          </div>
        </>
      )}

      {/* Outside the branch above: trashing your only deck must not hide the way back (plan §4.1a). */}
      <TrashPanel />
    </div>
  );
}
