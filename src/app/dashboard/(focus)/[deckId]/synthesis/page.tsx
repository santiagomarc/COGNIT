import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SynthesisDrillClient } from '@/components/ui/shared/synthesis/SynthesisDrillClient';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { loadSynthesisQueue, toCanvasDrill } from '@/lib/synthesis/loaders';
import type { CanvasAnchor, CanvasDrill } from '@/lib/synthesis/types';

/**
 * `checkSynthesisAttempt` is invoked from this page: one model call with an
 * 8 s deadline plus the reads and writes around it. The platform default
 * (10–15 s without Fluid compute) is below that worst case (audit R2); the
 * streaming chat route sets the same figure.
 */
export const maxDuration = 60;

type SynthesisPageProps = {
  params: Promise<{ deckId: string }>;
  searchParams?: Promise<{
    count?: string | string[];
    drill?: string | string[];
    pull?: string | string[];
    from?: string | string[];
  }>;
};

const DEFAULT_COUNT = 3;
const MAX_COUNT = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normaliseCount(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(first(value) ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(1, parsed));
}

function normaliseBoolean(value: string | string[] | undefined, fallback: boolean): boolean {
  const raw = first(value)?.toLowerCase();
  if (raw === undefined) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * The drill canvas route (spec §4.1). Chromeless like study and quiz. Serves
 * `count` drills, due first — never locking — and pins `?drill=` first.
 * `?from=study` is the capstone entry (§8.3): the offer promised one drill,
 * so it serves exactly the pinned one.
 */
export default async function DeckSynthesisPage({ params, searchParams }: SynthesisPageProps) {
  const { deckId } = await params;
  const resolved = searchParams ? await searchParams : undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const pinned = first(resolved?.drill);
  const fromStudy = first(resolved?.from) === 'study';

  // The ownership check and the queue read are independent (RLS already
  // scopes the drills); the deck row only decides `notFound` (audit P2).
  const [{ data: deck }, queue] = await Promise.all([
    supabase
      .from('decks')
      .select('id, title')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single(),
    loadSynthesisQueue(supabase, {
      deckId,
      userId: user.id,
      count: fromStudy ? 1 : normaliseCount(resolved?.count),
      drillId: pinned && UUID_PATTERN.test(pinned) ? pinned : null,
    }),
  ]);

  if (!deck) {
    notFound();
  }

  // The canvas never receives the answer key or the cards' definitions
  // before the answer is given; they come back with the check (audit P3).
  const drills: CanvasDrill[] = queue.drills.map(toCanvasDrill);
  const anchorsByDrill: Record<string, CanvasAnchor[]> = Object.fromEntries(
    Object.entries(queue.anchorsByDrill).map(([drillId, anchors]) => [
      drillId,
      anchors.map((anchor) => ({ id: anchor.id, key: anchor.key, term: anchor.term })),
    ]),
  );

  return (
    <SynthesisDrillClient
      deckId={deckId}
      deckTitle={removeDeckTagFromTitle(deck.title)}
      drills={drills}
      anchorsByDrill={anchorsByDrill}
      lastAttemptByDrill={queue.lastAttemptByDrill}
      pullForward={normaliseBoolean(resolved?.pull, true)}
      activeDrillCount={queue.activeDrillCount}
      from={fromStudy ? 'study' : undefined}
    />
  );
}
