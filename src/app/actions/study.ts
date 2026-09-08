'use server';

import { createClient } from '@/lib/supabase/server';
import { gradeCardSchema, GradeCardInput } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { sm2, GRADE_MAP, DEFAULT_EASE_FACTOR, type StudyGrade } from '@/lib/sm2';
import type { CardState } from '@/index';
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
    // No fallback path. The RPC does the card update and the study_logs insert
    // in one transaction; splitting them client-side is what let a broken RPC
    // look like success for months while every grade silently lost atomicity.
    logger.error('gradeCard', 'grade_owned_card failed', {
      code: gradePersistError.code,
      message: gradePersistError.message,
    });
    return { error: sanitizeDatabaseError(gradePersistError, 'Failed to update card schedule.') };
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

  // Deck path only. Revalidating /dashboard here fired once per graded card —
  // 40 times in a 40-card session, while the user is not even looking at it.
  // finishStudySession() handles the dashboard once, at the end.
  // Keeping the deck path means a mid-session back-navigation still shows
  // current data rather than a stale card list.
  revalidatePath(`/dashboard/${result.data.deck_id}`);

  return {
    success: true,
    nextReviewAt: sm2Result.nextReviewAt.toISOString(),
    interval: sm2Result.interval,
    state: sm2Result.state,
  };
}

export async function finishStudySession(deckId: string) {
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/${deckId}`);
  return { success: true };
}

