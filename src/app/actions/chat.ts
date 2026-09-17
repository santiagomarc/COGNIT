'use server';

import { createClient } from '@/lib/supabase/server';
import {
  syncEmbeddingsSchema, SyncEmbeddingsInput,
  createDeckChatSessionSchema, CreateDeckChatSessionInput,
  getDeckChatMessagesSchema, GetDeckChatMessagesInput,
  semanticSearchSchema, SemanticSearchInput,
} from '@/lib/schemas';
import { isMissingTableError } from '@/lib/supabase-errors';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import {
  recordAiUsage, requireOwnedDeck, reserveAiCall, sanitizeAiInputText,
} from './_shared';
import { logger } from '@/lib/logger';
import { guardAction } from '@/lib/action-guard';
import { embedTexts, toVectorLiteral } from '@/lib/embeddings';

// Bounds each syncEmbeddings invocation so a large deck can't run past the
// server action's execution limit; the client re-invokes until pending is 0.
const CARDS_PER_SYNC_BATCH = 200;

const DECK_CHAT_MIGRATION_ERROR = 'Deck chat is not available yet. Please apply the latest database migrations first.';

/** Two COUNT queries. No AI calls, so no rate-limit consumption. */
export async function getDeckIndexStatus(deckId: string) {
  return guardAction('Deck indexing', async () => {
    const deckAccess = await requireOwnedDeck(deckId);
    if ('error' in deckAccess) return { error: deckAccess.error };
    const { supabase } = deckAccess;

    const [{ count: total }, { count: pending }] = await Promise.all([
      supabase.from('cards').select('id', { count: 'exact', head: true }).eq('deck_id', deckId),
      supabase.from('cards').select('id', { count: 'exact', head: true })
        .eq('deck_id', deckId).is('embedding', null),
    ]);

    return { success: true as const, total: total ?? 0, pending: pending ?? 0 };
  });
}

export async function syncEmbeddings(data: SyncEmbeddingsInput) {
  return guardAction('Embedding sync', async () => {
    const parsed = syncEmbeddingsSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }

    const { supabase, user } = deckAccess;
    const reservation = await reserveAiCall(supabase, user.id, 'sync_embeddings');
    if (!reservation.ok) {
      return { error: reservation.error };
    }

    // Two cheap COUNT queries instead of fetching every embedding vector (up to
    // ~6MB for a large deck) just to test which rows are null.
    const { count: totalCardCount, error: totalCountError } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', parsed.data.deck_id);

    if (totalCountError) {
      return { error: sanitizeDatabaseError(totalCountError, 'Failed to load cards for embedding sync.') };
    }

    const { count: totalPendingCount, error: pendingCountError } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', parsed.data.deck_id)
      .is('embedding', null);

    if (pendingCountError) {
      return { error: sanitizeDatabaseError(pendingCountError, 'Failed to load cards for embedding sync.') };
    }

    if (!totalPendingCount) {
      return { success: true as const, synced: 0, pending: 0, total: totalCardCount ?? 0 };
    }

    // Cap and window each invocation so a large deck can't run past the server
    // action's execution limit — the caller re-invokes until `pending` is 0.
    const { data: pendingCards, error: pendingCardsError } = await supabase
      .from('cards')
      .select('id, front, back')
      .eq('deck_id', parsed.data.deck_id)
      .is('embedding', null)
      .order('created_at', { ascending: true })
      .limit(CARDS_PER_SYNC_BATCH);

    if (pendingCardsError) {
      return { error: sanitizeDatabaseError(pendingCardsError, 'Failed to load cards for embedding sync.') };
    }

    let synced = 0;
    const validCards = (pendingCards ?? [])
      .map((card) => ({ card, payload: sanitizeAiInputText(`${card.front}\n${card.back}`, 2_000) }))
      .filter((entry) => entry.payload.length > 0);

    if (validCards.length > 0) {
      const vectors = await embedTexts(
        validCards.map((entry) => entry.payload),
        { taskType: 'RETRIEVAL_DOCUMENT' },
      );

      const updates = validCards
        .map((entry, index) => ({ card_id: entry.card.id, vector: vectors[index] }))
        .filter((entry): entry is { card_id: string; vector: number[] } => Boolean(entry.vector))
        .map((entry) => ({ card_id: entry.card_id, embedding: toVectorLiteral(entry.vector) }));

      // One statement instead of up to 200 UPDATEs (P-4).
      const { data: appliedCount, error: applyError } = await supabase.rpc('apply_card_embeddings_batch', {
        p_deck_id: parsed.data.deck_id,
        p_updates: updates,
      });

      if (applyError) {
        // No per-card fallback. That loop skipped failed rows and still
        // reported success, leaving the deck silently under-retrievable.
        logger.error('syncEmbeddings', 'apply_card_embeddings_batch failed', {
          code: applyError.code,
          message: applyError.message,
        });
        return { error: sanitizeDatabaseError(applyError, 'Failed to save card embeddings.') };
      }

      synced = Number(appliedCount ?? 0);
    }

    const remainingPending = Math.max(0, totalPendingCount - synced);
    const metadataPayload = {
      deck_id: parsed.data.deck_id,
      user_id: user.id,
      total_cards: totalCardCount ?? 0,
      embedded_cards: (totalCardCount ?? 0) - remainingPending,
      last_sync_at: new Date().toISOString(),
      sync_error_message: null,
      updated_at: new Date().toISOString(),
    };

    const { error: metadataError } = await supabase
      .from('deck_chat_embedding_metadata')
      .upsert(metadataPayload, { onConflict: 'deck_id,user_id' });

    if (metadataError) {
      logger.warn('syncEmbeddings', 'metadata upsert failed', { message: metadataError.message });
    }

    await recordAiUsage(
      supabase,
      user.id,
      'sync_embeddings',
      {
        deck_id: parsed.data.deck_id,
        total_cards: totalCardCount ?? 0,
        synced_cards: synced,
      },
      reservation.reservationId,
    );

    return { success: true as const, synced, pending: remainingPending, total: totalCardCount ?? 0 };
  });
}

export async function createDeckChatSession(data: CreateDeckChatSessionInput) {
  const parsed = createDeckChatSessionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;
  const title = parsed.data.title?.trim() || 'New chat';

  const { data: session, error } = await supabase
    .from('deck_chat_sessions')
    .insert({
      deck_id: parsed.data.deck_id,
      user_id: user.id,
      title,
    })
    .select('id, title, created_at, updated_at')
    .single();

  if (error) {
    if (isMissingTableError(error.message, 'deck_chat_sessions')) {
      return { error: DECK_CHAT_MIGRATION_ERROR };
    }
    return { error: sanitizeDatabaseError(error, 'Failed to create chat session.') };
  }

  return { success: true, session };
}

export async function getDeckChatSessions(deckId: string) {
  const deckAccess = await requireOwnedDeck(deckId);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;
  const { data: sessions, error } = await supabase
    .from('deck_chat_sessions')
    .select('id, title, created_at, updated_at')
    .eq('deck_id', deckId)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error.message, 'deck_chat_sessions')) {
      return { error: DECK_CHAT_MIGRATION_ERROR };
    }
    return { error: sanitizeDatabaseError(error, 'Failed to load chat sessions.') };
  }

  return { success: true, sessions: sessions ?? [] };
}

export async function getDeckChatMessages(data: GetDeckChatMessagesInput) {
  const parsed = getDeckChatMessagesSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;

  const { data: session, error: sessionError } = await supabase
    .from('deck_chat_sessions')
    .select('id')
    .eq('id', parsed.data.session_id)
    .eq('deck_id', parsed.data.deck_id)
    .eq('user_id', user.id)
    .single();

  if (sessionError || !session) {
    if (sessionError && isMissingTableError(sessionError.message, 'deck_chat_sessions')) {
      return { error: DECK_CHAT_MIGRATION_ERROR };
    }
    return { error: 'Chat session not found.' };
  }

  const limit = parsed.data.limit ?? 50;
  const { data: messages, error } = await supabase
    .from('deck_chat_messages')
    .select('id, role, content, followup_suggestions, referenced_card_ids, created_at')
    .eq('session_id', parsed.data.session_id)
    .eq('deck_id', parsed.data.deck_id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error.message, 'deck_chat_messages')) {
      return { error: DECK_CHAT_MIGRATION_ERROR };
    }
    return { error: sanitizeDatabaseError(error, 'Failed to load chat messages.') };
  }

  return { success: true, messages: messages ?? [] };
}

export type SemanticSearchResult = {
  id: string;
  deck_id: string;
  deck_title: string;
  front: string;
  back: string;
  similarity: number;
};

export async function semanticSearchCards(data: SemanticSearchInput) {
  return guardAction('Search', async () => {
    const parsed = semanticSearchSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'You must be logged in.' };
    }

    const reservation = await reserveAiCall(supabase, user.id, 'semantic_search');
    if (!reservation.ok) {
      return { error: reservation.error };
    }

    const sanitizedQuery = sanitizeAiInputText(parsed.data.query, 300);
    if (!sanitizedQuery) {
      return { error: 'Search query is empty after sanitization.' };
    }

    const [queryVector] = await embedTexts([sanitizedQuery], { taskType: 'RETRIEVAL_QUERY' });
    if (!queryVector) {
      return { error: 'Failed to generate query embedding.' };
    }
    const queryVectorLiteral = toVectorLiteral(queryVector);

    const { data: results, error } = await supabase.rpc('search_user_cards_by_embedding', {
      p_user_id: user.id,
      p_query_embedding: queryVectorLiteral,
      p_limit: parsed.data.limit ?? 8,
    });

    if (error) {
      return { error: sanitizeDatabaseError(error, 'Search failed. Please try again.') };
    }

    await recordAiUsage(
      supabase,
      user.id,
      'semantic_search',
      {
        query_chars: sanitizedQuery.length,
        result_count: results?.length ?? 0,
      },
      reservation.reservationId,
    );

    return { success: true as const, results: (results ?? []) as SemanticSearchResult[] };
  });
}
