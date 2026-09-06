'use server';

import { createClient } from '@/lib/supabase/server';
import { gradeCardSchema, GradeCardInput } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { sm2, GRADE_MAP, DEFAULT_EASE_FACTOR, type StudyGrade } from '@/lib/sm2';
import type { CardState } from '@/index';
import { isMissingDatabaseFunctionError } from '@/lib/supabase-errors';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { generateMnemonicForCard } from './ai-assist';
import { logger } from '@/lib/logger';

export async function gradeCard(data: GradeCardInput) {
  const result = gradeCardSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  // Verify deck ownership
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', result.data.deck_id)
    .eq('user_id', user.id)
    .single();

  if (deckErr || !deck) {
    return { error: 'Deck not found or access denied.' };
  }

  // Fetch current card state
  const { data: card, error: cardErr } = await supabase
    .from('cards')
    .select('id, front, back, state, interval, ease_factor, repetition_count, mnemonic')
    .eq('id', result.data.card_id)
    .eq('deck_id', result.data.deck_id)
    .single();

  if (cardErr || !card) {
    return { error: 'Card not found.' };
  }

  // Run SM-2 algorithm
  const numericGrade = GRADE_MAP[result.data.grade as StudyGrade];
  const sm2Result = sm2(numericGrade, {
    repetitionCount: card.repetition_count ?? 0,
    easeFactor: card.ease_factor ?? DEFAULT_EASE_FACTOR,
    interval: card.interval ?? 0,
    state: (card.state as CardState) ?? 'new',
  });

  const shouldGenerateMnemonic =
    sm2Result.state === 'relearning'
    && ((card.state as CardState) ?? 'new') !== 'relearning'
    && !(typeof card.mnemonic === 'string' && card.mnemonic.trim().length > 0);

  const nowIso = new Date().toISOString();
  const rpcGradePayload = {
    p_deck_id: result.data.deck_id,
    p_card_id: card.id,
    p_state: sm2Result.state,
    p_interval: sm2Result.interval,
    p_ease_factor: sm2Result.easeFactor,
    p_repetition_count: sm2Result.repetitionCount,
    p_next_review_at: sm2Result.nextReviewAt.toISOString(),
    p_last_review_at: nowIso,
    p_grade: numericGrade,
    p_review_duration_ms: result.data.duration_ms ?? 0,
  };

  const { error: gradePersistError } = await supabase.rpc('grade_owned_card', rpcGradePayload);

  if (gradePersistError) {
    /**
     * @deprecated Fallback for pre-202609011200 environments.
     * Remove once `supabase migration list` confirms every environment is current.
     * Tracking: Phase 5 exit criteria.
     */
    const missingRpcFunction = isMissingDatabaseFunctionError(gradePersistError.message, 'grade_owned_card');
    if (missingRpcFunction) {
      logger.warn('gradeCard', 'rpc unavailable, using fallback persistence path', { message: gradePersistError.message });
    } else {
      logger.warn('gradeCard', 'rpc failed, using fallback persistence path', { code: gradePersistError.code, message: gradePersistError.message });
    }

    const { error: updateErr } = await supabase
      .from('cards')
      .update({
        state: sm2Result.state,
        interval: sm2Result.interval,
        ease_factor: sm2Result.easeFactor,
        repetition_count: sm2Result.repetitionCount,
        next_review_at: sm2Result.nextReviewAt.toISOString(),
        last_review_at: nowIso,
      })
      .eq('id', card.id)
      .eq('deck_id', result.data.deck_id);

    if (updateErr) {
      logger.error('gradeCard', 'fallback update error', { code: updateErr.code, message: updateErr.message });
      return { error: sanitizeDatabaseError(updateErr, 'Failed to update card schedule.') };
    }

    const { error: logErr } = await supabase.from('study_logs').insert({
      user_id: user.id,
      card_id: card.id,
      grade: numericGrade,
      review_duration_ms: result.data.duration_ms ?? 0,
    });

    if (logErr) {
      logger.error('gradeCard', 'fallback log error', { code: logErr.code, message: logErr.message });
      return { error: sanitizeDatabaseError(logErr, 'Card was graded, but history log failed to save.') };
    }
  }


  if (shouldGenerateMnemonic) {
    try {
      await generateMnemonicForCard(supabase, user.id, result.data.deck_id, {
        id: card.id,
        front: card.front,
        back: card.back,
        mnemonic: card.mnemonic,
      });
    } catch (mnemonicError) {
      logger.warn('gradeCard', 'mnemonic generation skipped', { error: mnemonicError });
    }
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/${result.data.deck_id}`);

  return {
    success: true,
    nextReviewAt: sm2Result.nextReviewAt.toISOString(),
    interval: sm2Result.interval,
    state: sm2Result.state,
  };
}
