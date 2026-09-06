'use server';

import { createClient } from '@/lib/supabase/server';
import {
  createCardSchema, CreateCardInput,
  updateCardSchema, UpdateCardInput,
  bulkImportSchema, BulkImportInput,
} from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { isMissingDatabaseFunctionError } from '@/lib/supabase-errors';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { requireOwnedDeck, touchDeckUpdatedAt } from './_shared';
import { logger } from '@/lib/logger';

const BULK_DELETE_MAX_COUNT = 200;

function trimNullableString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createCard(data: CreateCardInput) {
  const result = createCardSchema.safeParse(data);

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error === 'You must be logged in.' ? 'You must be logged in to add a card.' : deckAccess.error };
  }

  const { supabase, user } = deckAccess;

  const { data: insertedCard, error } = await supabase
    .from('cards')
    .insert({
      deck_id: result.data.deck_id,
      front: result.data.front,
      back: result.data.back,
      source: result.data.source ?? 'manual',
      imported_by: trimNullableString(result.data.imported_by),
    })
    .select('id')
    .single();

  if (error) {
    logger.error('createCard', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to create card.') };
  }

  await touchDeckUpdatedAt(supabase, result.data.deck_id, user.id);

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');
  return { success: true, cardId: insertedCard?.id ?? null };
}

export async function updateCard(data: UpdateCardInput) {
  const result = updateCardSchema.safeParse(data);

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'You must be logged in to update a card.' };
  }

  // Verify deck ownership
  const { data: ownedDeck, error: deckError } = await supabase
    .from('decks')
    .select('id')
    .eq('id', result.data.deck_id)
    .eq('user_id', user.id)
    .single();

  if (deckError || !ownedDeck) {
    return { error: 'Deck not found or access denied.' };
  }

  const updatePayload = {
    front: result.data.front,
    back: result.data.back,
    mcq_distractors: null,
    id_question: null,
    ai_hint: null,
    topic_tags: null,
    mnemonic: null,
    embedding: null,
  };

  const { error } = await supabase
    .from('cards')
    .update(updatePayload)
    .eq('id', result.data.id)
    .eq('deck_id', result.data.deck_id);

  if (error) {
    logger.error('updateCard', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to update card.') };
  }

  await touchDeckUpdatedAt(supabase, result.data.deck_id, user.id);

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function bulkImportCards(data: BulkImportInput) {
  const result = bulkImportSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;
  const rows = result.data.cards.map((card) => ({
    deck_id: result.data.deck_id,
    front: card.front,
    back: card.back,
    source: 'bulk_import' as const,
    imported_by: trimNullableString(result.data.imported_by),
  }));

  const { data: insertedCards, error } = await supabase
    .from('cards')
    .insert(rows)
    .select('id');

  if (error) {
    logger.error('bulkImportCards', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to import cards.') };
  }

  await touchDeckUpdatedAt(supabase, result.data.deck_id, user.id);

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');

  return {
    success: true,
    count: insertedCards?.length ?? 0,
    cardIds: (insertedCards ?? []).map((card) => card.id),
  };
}

export async function deleteCard(cardId: string, deckId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  // Verify deck ownership
  const { data: ownedDeck, error: deckError } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single();

  if (deckError || !ownedDeck) {
    return { error: 'Deck not found or access denied.' };
  }

  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('id', cardId)
    .eq('deck_id', deckId);

  if (error) {
    logger.error('deleteCard', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to delete card.') };
  }

  await touchDeckUpdatedAt(supabase, deckId, user.id);

  revalidatePath(`/dashboard/${deckId}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function bulkDeleteCards(cardIds: string[], deckId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const normalizedIds = Array.from(
    new Set(
      cardIds
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id))
    )
  );

  if (normalizedIds.length === 0) {
    return { error: 'No cards selected.' };
  }

  if (normalizedIds.length > BULK_DELETE_MAX_COUNT) {
    return { error: `You can delete at most ${BULK_DELETE_MAX_COUNT} cards at once.` };
  }

  // Verify deck ownership before deleting cards.
  const { data: ownedDeck, error: deckError } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single();

  if (deckError || !ownedDeck) {
    return { error: 'Deck not found or access denied.' };
  }

  let deletedCount = 0;
  const { data: rpcDeletedCount, error: rpcError } = await supabase.rpc('delete_owned_cards_batch', {
    p_deck_id: deckId,
    p_card_ids: normalizedIds,
  });

  /**
   * @deprecated Fallback for pre-202609011200 environments.
   * Remove once `supabase migration list` confirms every environment is current.
   * Tracking: Phase 5 exit criteria.
   */
  if (rpcError && !isMissingDatabaseFunctionError(rpcError.message, 'delete_owned_cards_batch')) {
    logger.error('bulkDeleteCards', 'rpc error', { code: rpcError.code, message: rpcError.message });
    return { error: sanitizeDatabaseError(rpcError, 'Failed to delete selected cards.') };
  }

  if (!rpcError) {
    const parsedDeletedCount = typeof rpcDeletedCount === 'number'
      ? rpcDeletedCount
      : Number(rpcDeletedCount ?? 0);

    deletedCount = Number.isFinite(parsedDeletedCount) ? parsedDeletedCount : 0;
  } else {
    const { data: deletedRows, error } = await supabase
      .from('cards')
      .delete()
      .in('id', normalizedIds)
      .eq('deck_id', deckId)
      .select('id');

    if (error) {
      logger.error('bulkDeleteCards', 'fallback delete error', { code: error.code, message: error.message });
      return { error: sanitizeDatabaseError(error, 'Failed to delete selected cards.') };
    }

    deletedCount = deletedRows?.length ?? 0;
    if (deletedCount > 0) {
      await touchDeckUpdatedAt(supabase, deckId, user.id);
    }
  }

  revalidatePath(`/dashboard/${deckId}`);
  revalidatePath(`/dashboard/${deckId}/study`);
  revalidatePath(`/dashboard/${deckId}/quiz`);
  revalidatePath('/dashboard');
  return { success: true, deletedCount, requestedCount: normalizedIds.length };
}
