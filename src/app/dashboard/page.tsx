import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CreateDeckModal } from '@/components/ui/shared/CreateDeckModal';
import { DeckGrid } from '@/components/ui/shared/DeckGrid';
import { DueTodayCard } from '@/components/ui/shared/DueTodayCard';
import { StudyStreakCard } from '@/components/ui/shared/StudyStreakCard';
import { FadeInUp } from '@/components/motion';
import { Layers } from 'lucide-react';

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

  // ── Compute study streak from study_logs ──
  const { data: studyDays } = await supabase
    .from('study_logs')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(500);

  // Deduplicate by date (UTC)
  const uniqueDays = new Set<string>();
  for (const log of studyDays ?? []) {
    uniqueDays.add(log.created_at.slice(0, 10)); // YYYY-MM-DD
  }

  const sortedDays = Array.from(uniqueDays).sort((a, b) => b.localeCompare(a)); // newest first
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let streak = 0;
  let check = today;
  const studiedToday = sortedDays.includes(today);

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
            <CreateDeckModal />
            <ThemeToggle />
          </div>
        </div>
      </FadeInUp>

      {/* ── Stats Row: Due Today + Streak ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <DueTodayCard totalDue={totalDue} deckBreakdown={deckBreakdown} />
        <StudyStreakCard streak={streak} longestStreak={longestStreak} studiedToday={studiedToday} />
      </div>

      {/* ── Deck Grid with Search ── */}
      <FadeInUp delay={0.15}>
        <DeckGrid decks={(decks as { id: string; title: string; created_at: string; cards: { count: number }[] }[]) ?? []} />
      </FadeInUp>
    </div>
  );
}