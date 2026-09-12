import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SynthesisDrillClient } from '@/components/ui/shared/synthesis/SynthesisDrillClient';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { loadSynthesisQueue } from '@/lib/synthesis/loaders';

type SynthesisPageProps = {
  params: Promise<{ deckId: string }>;
  searchParams?: Promise<{
    count?: string | string[];
    drill?: string | string[];
    pull?: string | string[];
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
 */
export default async function DeckSynthesisPage({ params, searchParams }: SynthesisPageProps) {
  const { deckId } = await params;
  const resolved = searchParams ? await searchParams : undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: deck } = await supabase
    .from('decks')
    .select('id, title')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single();

  if (!deck) {
    notFound();
  }

  const pinned = first(resolved?.drill);
  const queue = await loadSynthesisQueue(supabase, {
    deckId,
    userId: user.id,
    count: normaliseCount(resolved?.count),
    drillId: pinned && UUID_PATTERN.test(pinned) ? pinned : null,
  });

  return (
    <SynthesisDrillClient
      deckId={deckId}
      deckTitle={removeDeckTagFromTitle(deck.title)}
      drills={queue.drills}
      anchorsByDrill={queue.anchorsByDrill}
      lastAttemptByDrill={queue.lastAttemptByDrill}
      pullForward={normaliseBoolean(resolved?.pull, true)}
      activeDrillCount={queue.activeDrillCount}
    />
  );
}
