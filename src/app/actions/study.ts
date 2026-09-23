'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { gradeCardSchema, GradeCardInput } from '@/lib/schemas';
import { sm2, GRADE_MAP, DEFAULT_EASE_FACTOR, type StudyGrade } from '@/lib/sm2';
import type { CardState } from '@/index';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { generateMnemonicForCard } from '@/lib/mnemonic';
import { logger } from '@/lib/logger';
import { requireOwnedDeck } from './_shared';
import { ensureSessionHeadroom } from '@/lib/supabase/session';

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

  // Fetch current card state. RLS scopes this to the caller's own decks, and
  // grade_owned_card re-checks ownership inside the transaction, so a separate
  // deck read here would only be a third round-trip saying the same thing.
  const { data: card, error: cardErr } = await supabase
    .from('cards')
    .select('id, front, back, state, interval, ease_factor, repetition_count, mnemonic')
    .eq('id', result.data.card_id)
    .eq('deck_id', result.data.deck_id)
    .single();

  if (cardErr || !card) {
    return { error: 'Card not found or access denied.' };
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

  // One RPC: card schedule + study_logs row, atomically, with the ownership
  // check inside. There is no TypeScript fallback any more — the one that
  // existed persisted the grade in two statements WITHOUT that check.
  const { error: gradePersistError } = await supabase.rpc('grade_owned_card', {
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
  });

  if (gradePersistError) {
    logger.error('gradeCard', 'grade_owned_card rpc failed', {
      code: gradePersistError.code,
      message: gradePersistError.message,
    });
    return { error: sanitizeDatabaseError(gradePersistError, 'Failed to save your review.') };
  }

  if (shouldGenerateMnemonic) {
    await ensureSessionHeadroom();
    // Off the response path: the grade returns now, the model call runs after
    // the response is sent. The student who just lapsed a card should never
    // wait on a mnemonic for it — the next card is what they need.
    after(() =>
      generateMnemonicForCard(supabase, user.id, result.data.deck_id, {
        id: card.id,
        front: card.front,
        back: card.back,
        mnemonic: card.mnemonic,
      }).catch((mnemonicError: unknown) => {
        logger.warn('gradeCard', 'mnemonic generation skipped', {
          error: mnemonicError instanceof Error ? mnemonicError.message : String(mnemonicError),
        });
      }),
    );
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

const deckIdSchema = z.uuid();

/**
 * Called once when a study session ends. It only busts caches, but it is
 * still authenticated and scoped to a deck the caller owns — it was the one
 * action in the codebase with no auth at all.
 */
export async function finishStudySession(deckId: string) {
  const parsed = deckIdSchema.safeParse(deckId);
  if (!parsed.success) {
    return { error: 'Invalid deck id.' };
  }

  const deckAccess = await requireOwnedDeck(parsed.data);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/${parsed.data}`);
  return { success: true };
}
