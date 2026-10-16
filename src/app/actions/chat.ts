'use server';

import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
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
import { guardAction } from '@/lib/action-guard';
import { embedTexts, toVectorLiteral } from '@/lib/embeddings';
import { embedPendingCards } from '@/lib/card-embeddings';

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

    // The same job the background fills run (src/lib/card-embeddings.ts);
    // this is the chat widget's manual "Index" button.
    const { supabase, user } = deckAccess;
    const result = await embedPendingCards(supabase, user.id, parsed.data.deck_id, {
      limit: CARDS_PER_SYNC_BATCH,
      trigger: 'chat_index',
    });
    if (!result.ok) {
      return { error: result.error };
    }

    return { success: true as const, synced: result.synced, pending: result.pending, total: result.total };
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

    const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
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
      reservation,
    );

    return { success: true as const, results: (results ?? []) as SemanticSearchResult[] };
  });
}
