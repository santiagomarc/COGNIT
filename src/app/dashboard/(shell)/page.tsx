import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DeckGrid } from '@/components/ui/shared/DeckGrid';
import { DashboardOnboarding } from '@/components/ui/shared/DashboardOnboarding';
import { GreetingHeader } from '@/components/ui/shared/GreetingHeader';
import { DueNowBand } from '@/components/ui/shared/DueNowBand';
import { CreateDeckPanel } from '@/components/ui/shared/CreateDeckPanel';
import { SignalPanel } from '@/components/ui/shared/SignalPanel';
import { resolveDisplayName } from '@/lib/display-name';
import { loadDueByDeckRows, type DueCardsByDeckRow } from '@/lib/dashboard-due';
import {
  buildSevenDayForecast,
  estimateSessionMinutes,
  meanEaseByDeck,
  oldestOverdueDays,
  type CardScheduleRow,
} from '@/lib/dashboard-forecast';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
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

type DashboardSnapshot = {
  deckRows: DashboardDeckRow[];
  deckQueryUsedFallback: boolean;
  deckQueryErrorMessage: string | null;
  dueByDeckRows: DueCardsByDeckRow[];
  activityDays: ActivityDayRow[];
  totalStudiedCards: number;
  masterySummaryRows: DeckMasterySummaryRow[];
  cardSchedule: CardScheduleRow[];
  cardScheduleTruncated: boolean;
  dueDrills: DueDrillsByDeck;
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


/*
 * One projection of every card's schedule, used for two things: the seven-day
 * forecast and each deck's mean ease factor.
 *
 * There is no RPC for either — `get_due_cards_by_deck` reports a single "due
 * now" count per deck, `get_study_activity_days` is retrospective, and
 * `get_deck_mastery_summary` carries no scheduling state — so both are derived
 * here rather than added as two more round-trips. Three narrow columns and a
 * bounded row count keeps it cheap, and it runs inside the existing
 * `Promise.all` alongside the other dashboard reads.
 */
const CARD_SCHEDULE_ROW_CAP = 20_000;

async function loadCardSchedule(
  supabase: SupabaseServerClient
): Promise<{ rows: CardScheduleRow[]; truncated: boolean }> {
  const { data, error } = await supabase
    .from('cards')
    .select('deck_id, ease_factor, next_review_at')
    .limit(CARD_SCHEDULE_ROW_CAP);

  if (error) {
    console.error('[dashboard] card schedule query failed:', error.message);
    return { rows: [], truncated: false };
  }

  const rows = (data as CardScheduleRow[] | null) ?? [];
  return { rows, truncated: rows.length >= CARD_SCHEDULE_ROW_CAP };
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

  const [dueByDeckRows, activityDays, { count: totalStudiedCards }, masterySummary, cardSchedule, dueDrills] =
    await Promise.all([
      loadDueByDeckRows(supabase, userId, nowIso),
      loadActivityDays(supabase, userId),
      supabase
        .from('study_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      loadMasterySummary(supabase, userId),
      loadCardSchedule(supabase),
      loadDueDrillsByDeck(supabase, { userId, now: new Date(nowIso) }),
    ]);

  return {
    deckRows,
    deckQueryUsedFallback,
    deckQueryErrorMessage,
    dueByDeckRows,
    activityDays,
    totalStudiedCards: totalStudiedCards ?? 0,
    masterySummaryRows: masterySummary,
    cardSchedule: cardSchedule.rows,
    cardScheduleTruncated: cardSchedule.truncated,
    dueDrills,
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
    cardSchedule,
    cardScheduleTruncated,
    dueDrills,
  } = await loadDashboardSnapshot(user.id);

  if (cardScheduleTruncated) {
    console.warn(
      `[dashboard] card schedule hit the ${CARD_SCHEDULE_ROW_CAP}-row cap; forecast and per-deck ease are partial.`
    );
  }

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

  const forecastDays = buildSevenDayForecast(cardSchedule);
  const easeByDeck = meanEaseByDeck(cardSchedule);
  const overdueDays = oldestOverdueDays(cardSchedule);
  const estimatedMinutes = estimateSessionMinutes(totalDue);

  const masteryByDeck = new Map<string, { assessedCards: number; masteredCards: number; lastQuizAt: string | null }>();
  for (const row of masterySummaryRows) {
    masteryByDeck.set(row.deck_id, {
      assessedCards: row.assessed_cards,
      masteredCards: row.mastered_cards,
      lastQuizAt: row.last_quiz_at,
    });
  }

  const assessedCards = masterySummaryRows.reduce((sum, row) => sum + row.assessed_cards, 0);
  const masteredCards = masterySummaryRows.reduce((sum, row) => sum + row.mastered_cards, 0);
  const retentionPercentage =
    assessedCards > 0 ? Math.round((masteredCards / assessedCards) * 100) : null;

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

  // The fallback session target when nothing is due. It used to also be where
  // an "import PDF" without a chosen target landed; that button is gone from
  // this page entirely (Run 6, requirement 3).
  const mostRecentDeck = [...deckRows].sort((a, b) =>
    (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)
  )[0];

  /*
   * Resolved on the server so the greeting never round-trips an address to the
   * client. `null` is a real answer and GreetingHeader renders correctly for
   * it — see resolveDisplayName and audit finding F-06.
   */
  const greetingName = resolveDisplayName(user);

  const sessionHref = deckBreakdown[0]
    ? `/dashboard/${deckBreakdown[0].deckId}/study`
    : mostRecentDeck
      ? `/dashboard/${mostRecentDeck.id}/study?scope=include_reviewed`
      : null;

  // The drills reading leads to a deck launcher (micro-synthesis spec §4.1):
  // the deck with the most due, restricted to decks this page knows about.
  const knownDeckIds = new Set(deckRows.map((deck) => deck.id));
  const topDrillDeck = dueDrills.decks.find((deck) => knownDeckIds.has(deck.deckId));
  const dueDrillsReading = {
    total: dueDrills.total,
    deckCount: dueDrills.decks.length,
    href: topDrillDeck ? `/dashboard/${topDrillDeck.deckId}` : null,
  };

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
                  easeFactor: easeByDeck.get(deck.id) ?? null,
                };
              })}
            />
          </div>
        </>
      )}
    </div>
  );
}
