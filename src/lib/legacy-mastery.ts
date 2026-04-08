import { createClient } from './supabase/server';
import { computeDeckMasterySnapshots } from './quiz-progress';
import { isMissingDatabaseFunctionError } from './supabase-errors';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LegacyMasterySnapshot = {
  assessedCards: number;
  masteredCards: number;
  lastQuizAt: string | null;
};

type LegacyMasteryRpcRow = {
  deck_id: string;
  assessed_cards: number | string | null;
  mastered_cards: number | string | null;
  last_quiz_at: string | null;
};

async function loadLegacyMasteryFallback(
  supabase: SupabaseServerClient,
  userId: string,
  totalCardsByDeck: Map<string, number>,
): Promise<Map<string, LegacyMasterySnapshot>> {
  const deckIds = Array.from(totalCardsByDeck.keys());
  if (deckIds.length === 0) {
    return new Map<string, LegacyMasterySnapshot>();
  }

  const { data: quizResults, error: quizResultsError } = await supabase
    .from('quiz_results')
    .select('id, deck_id, created_at')
    .eq('user_id', userId)
    .in('deck_id', deckIds)
    .order('created_at', { ascending: false })
    .limit(20000);

  if (quizResultsError || !quizResults || quizResults.length === 0) {
    return new Map<string, LegacyMasterySnapshot>();
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
      console.error('[legacy-mastery] fallback quiz card results failed:', error.message);
      return new Map<string, LegacyMasterySnapshot>();
    }

    quizCardResults.push(...(data ?? []));
  }

  const snapshots = computeDeckMasterySnapshots({
    totalCardsByDeck,
    quizResults,
    quizCardResults,
  });

  const masteryByDeck = new Map<string, LegacyMasterySnapshot>();
  for (const [deckId, snapshot] of snapshots.entries()) {
    masteryByDeck.set(deckId, {
      assessedCards: snapshot.assessedCards,
      masteredCards: snapshot.masteredCards,
      lastQuizAt: snapshot.lastQuizAt,
    });
  }

  return masteryByDeck;
}

export async function loadLegacyDeckMasterySnapshots(
  supabase: SupabaseServerClient,
  userId: string,
  totalCardsByDeck: Map<string, number>,
): Promise<Map<string, LegacyMasterySnapshot>> {
  const deckIds = Array.from(totalCardsByDeck.keys());
  if (deckIds.length === 0) {
    return new Map<string, LegacyMasterySnapshot>();
  }

  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_legacy_mastery_snapshots', {
    p_deck_ids: deckIds,
  });

  if (rpcError && !isMissingDatabaseFunctionError(rpcError.message, 'get_legacy_mastery_snapshots')) {
    console.error('[legacy-mastery] rpc failed:', rpcError.code, rpcError.message);
    return loadLegacyMasteryFallback(supabase, userId, totalCardsByDeck);
  }

  if (!rpcError) {
    const masteryByDeck = new Map<string, LegacyMasterySnapshot>();
    for (const row of (rpcRows ?? []) as LegacyMasteryRpcRow[]) {
      masteryByDeck.set(row.deck_id, {
        assessedCards: Number(row.assessed_cards ?? 0),
        masteredCards: Number(row.mastered_cards ?? 0),
        lastQuizAt: row.last_quiz_at,
      });
    }

    return masteryByDeck;
  }

  return loadLegacyMasteryFallback(supabase, userId, totalCardsByDeck);
}
