'use server';

import { logQuizResultSchema, LogQuizResultInput } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { sm2, DEFAULT_EASE_FACTOR } from '@/lib/sm2';
import { similarity } from '@/lib/fuzzy';
import type { CardState, QuizHistoryEntry, QuizMode } from '@/index';
import { isMissingDatabaseFunctionError, isMissingTableError } from '@/lib/supabase-errors';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { normalizeForMatch, requireOwnedDeck } from './_shared';
import { logger } from '@/lib/logger';

type QuizCardHistoryRow = {
  quiz_result_id: string;
  card_id: string;
  correct: boolean;
  prompt_text: string | null;
  correct_answer_text: string | null;
  user_answer_text: string | null;
};

export async function logQuizResult(data: LogQuizResultInput) {
  const result = logQuizResultSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;
  const uniqueCardIds = [...new Set(result.data.results.map((entry) => entry.card_id))];
  const { data: ownedCards, error: ownedCardsError } = await supabase
    .from('cards')
    .select('id, front, back, id_question, mcq_distractors, state, interval, ease_factor, repetition_count')
    .eq('deck_id', result.data.deck_id)
    .in('id', uniqueCardIds);

  if (ownedCardsError) {
    logger.error('logQuizResult', 'owned cards fetch error', { code: ownedCardsError.code, message: ownedCardsError.message });
    return { error: sanitizeDatabaseError(ownedCardsError, 'Failed to validate quiz cards.') };
  }

  const cardsById = new Map((ownedCards ?? []).map((card) => [card.id, card]));
  const ownedCardIds = new Set(cardsById.keys());
  if (ownedCardIds.size !== uniqueCardIds.length) {
    return { error: 'One or more quiz results referenced cards outside this deck.' };
  }

  const evaluatedResults = result.data.results.map((entry) => {
    const card = cardsById.get(entry.card_id);
    if (!card) {
      return null;
    }

    const userAnswer = entry.user_answer;
    const correct = result.data.mode === 'identification'
      ? similarity(userAnswer, card.front) >= 0.7
      : normalizeForMatch(userAnswer) === normalizeForMatch(card.front);

    return {
      card_id: entry.card_id,
      correct,
      prompt_text: card.id_question ?? card.back,
      correct_answer_text: card.front,
      user_answer_text: userAnswer,
    };
  }).filter((entry): entry is {
    card_id: string;
    correct: boolean;
    prompt_text: string;
    correct_answer_text: string;
    user_answer_text: string;
  } => entry !== null);

  if (evaluatedResults.length !== result.data.results.length) {
    return { error: 'Failed to evaluate one or more quiz answers.' };
  }

  // ── SM-2: Update card scheduling from quiz outcomes ─────────────────────
  // Map quiz correctness to SM-2 grades: correct → 4 (Good), incorrect → 0 (Again)
  const now = new Date();
  const sm2Updates = evaluatedResults.map((entry) => {
    const card = cardsById.get(entry.card_id);
    const grade = entry.correct ? 4 : 0;
    const sm2Result = sm2(grade as Parameters<typeof sm2>[0], {
      repetitionCount: card?.repetition_count ?? 0,
      easeFactor: card?.ease_factor ?? DEFAULT_EASE_FACTOR,
      interval: card?.interval ?? 0,
      state: (card?.state as CardState) ?? 'new',
    });
    return {
      card_id: entry.card_id,
      sm2Result,
      grade,
    };
  });

  // Apply every card's scheduling update and study_logs row atomically in one
  // round trip via the RPC. Falls back to the sequential per-card path if the
  // migration hasn't been applied yet, matching the pattern used elsewhere in
  // this codebase (e.g. grade_owned_card, search_deck_cards_by_embedding).
  const batchRpcResult = await supabase.rpc('apply_quiz_sm2_batch', {
    p_deck_id: result.data.deck_id,
    p_updates: sm2Updates.map(({ card_id, sm2Result, grade }) => ({
      card_id,
      state: sm2Result.state,
      interval: sm2Result.interval,
      ease_factor: sm2Result.easeFactor,
      repetition_count: sm2Result.repetitionCount,
      next_review_at: sm2Result.nextReviewAt.toISOString(),
      grade,
    })),
  });

  if (batchRpcResult.error) {
    /**
     * @deprecated Fallback for pre-202609011200 environments.
     * Remove once `supabase migration list` confirms every environment is current.
     * Tracking: Phase 5 exit criteria.
     */
    const missingRpcFunction = isMissingDatabaseFunctionError(batchRpcResult.error.message, 'apply_quiz_sm2_batch');
    if (missingRpcFunction) {
      logger.warn('logQuizResult', 'rpc unavailable, using fallback persistence path', { message: batchRpcResult.error.message });
    } else {
      logger.warn('logQuizResult', 'rpc failed, using fallback persistence path', { message: batchRpcResult.error.message });
    }

    for (const { card_id, sm2Result } of sm2Updates) {
      const { error: cardUpdateErr } = await supabase
        .from('cards')
        .update({
          state: sm2Result.state,
          interval: sm2Result.interval,
          ease_factor: sm2Result.easeFactor,
          repetition_count: sm2Result.repetitionCount,
          next_review_at: sm2Result.nextReviewAt.toISOString(),
          last_review_at: now.toISOString(),
        })
        .eq('id', card_id)
        .eq('deck_id', result.data.deck_id);

      if (cardUpdateErr) {
        // Non-fatal: log and continue — quiz result should still be saved
        logger.warn('logQuizResult', 'SM-2 card update failed for card', { card_id, message: cardUpdateErr.message });
      }
    }

    const studyLogRows = sm2Updates.map(({ card_id, grade }) => ({
      user_id: user.id,
      card_id,
      grade,
      review_duration_ms: 0,
    }));

    const { error: studyLogErr } = await supabase.from('study_logs').insert(studyLogRows);
    if (studyLogErr) {
      logger.warn('logQuizResult', 'study_logs batch insert failed', { message: studyLogErr.message });
    }
  }
  // ────────────────────────────────────────────────────────────────────────


  const correctCards = evaluatedResults.filter((entry) => entry.correct).length;
  const insertQuizResultBase = {
    user_id: user.id,
    deck_id: result.data.deck_id,
    mode: result.data.mode,
    total_cards: evaluatedResults.length,
    correct_cards: correctCards,
    duration_ms: result.data.duration_ms,
  };

  const { data: insertedQuizResult, error: quizResultError } = await supabase
    .from('quiz_results')
    .insert({
      ...insertQuizResultBase,
      include_in_history: result.data.include_in_history,
    })
    .select('id, created_at')
    .single();

  if (quizResultError || !insertedQuizResult) {
    if (quizResultError) {
      logger.error('logQuizResult', 'quiz result insert error', { code: quizResultError.code, message: quizResultError.message });
    }
    return { error: sanitizeDatabaseError(quizResultError, 'Failed to save quiz result.') };
  }

  const { error: quizCardResultsError } = await supabase
    .from('quiz_card_results')
    .insert(
      evaluatedResults.map((entry) => ({
        quiz_result_id: insertedQuizResult.id,
        card_id: entry.card_id,
        correct: entry.correct,
        prompt_text: entry.prompt_text,
        correct_answer_text: entry.correct_answer_text,
        user_answer_text: entry.user_answer_text,
      }))
    );

  if (quizCardResultsError) {
    logger.error('logQuizResult', 'quiz card results insert error', { code: quizCardResultsError.code, message: quizCardResultsError.message });
    return { error: sanitizeDatabaseError(quizCardResultsError, 'Failed to save quiz details.') };
  }

  const attemptTimestamp = insertedQuizResult.created_at ?? new Date().toISOString();
  const { data: existingMasteryRows, error: existingMasteryError } = await supabase
    .from('card_mastery_state')
    .select('card_id, correct')
    .eq('user_id', user.id)
    .eq('deck_id', result.data.deck_id)
    .in('card_id', evaluatedResults.map((entry) => entry.card_id));

  /**
   * @deprecated Fallback for pre-202609011200 environments.
   * Remove once `supabase migration list` confirms every environment is current.
   * Tracking: Phase 5 exit criteria.
   */
  if (existingMasteryError && !isMissingTableError(existingMasteryError.message, 'card_mastery_state')) {
    logger.error('card_mastery_state', 'failed to read existing rows', { message: existingMasteryError.message });
  }

  const existingMasteryByCardId = new Map(
    (existingMasteryRows ?? []).map((row) => [row.card_id, row.correct])
  );

  const { error: masteryStateError } = await supabase
    .from('card_mastery_state')
    .upsert(
      evaluatedResults.map((entry) => ({
        user_id: user.id,
        deck_id: result.data.deck_id,
        card_id: entry.card_id,
        // Persist the highest-ever quiz mastery for this card.
        correct: Boolean(existingMasteryByCardId.get(entry.card_id)) || entry.correct,
        last_quiz_at: attemptTimestamp,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,deck_id,card_id' }
    );

  /**
   * @deprecated Fallback for pre-202609011200 environments.
   * Remove once `supabase migration list` confirms every environment is current.
   * Tracking: Phase 5 exit criteria.
   */
  if (masteryStateError && !isMissingTableError(masteryStateError.message, 'card_mastery_state')) {
    logger.error('card_mastery_state', 'failed to upsert rows', { message: masteryStateError.message });
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/${result.data.deck_id}`);

  return {
    success: true,
    quizResultId: insertedQuizResult.id,
    correctCards,
    totalCards: evaluatedResults.length,
  };
}

export async function getQuizHistory(deckId: string) {
  const deckAccess = await requireOwnedDeck(deckId);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;

  const { data: quizResults, error: quizResultsError } = await supabase
    .from('quiz_results')
    .select('id, deck_id, mode, total_cards, correct_cards, duration_ms, created_at')
    .eq('deck_id', deckId)
    .eq('user_id', user.id)
    .eq('include_in_history', true)
    .order('created_at', { ascending: false })
    .limit(200);

  if (quizResultsError) {
    logger.error('getQuizHistory', 'quiz results error', { code: quizResultsError.code, message: quizResultsError.message });
    return { error: 'Failed to fetch quiz history.' };
  }

  if (!quizResults || quizResults.length === 0) {
    return { history: [] as QuizHistoryEntry[] };
  }

  const { data: quizCardRows, error: quizCardRowsError } = await supabase
    .from('quiz_card_results')
    .select('quiz_result_id, card_id, correct, prompt_text, correct_answer_text, user_answer_text')
    .in('quiz_result_id', quizResults.map((row) => row.id))
    .limit(20000);

  if (quizCardRowsError) {
    logger.error('getQuizHistory', 'quiz card rows error', { code: quizCardRowsError.code, message: quizCardRowsError.message });
    return { error: 'Failed to fetch quiz history details.' };
  }

  const rowsByQuizResultId = new Map<string, QuizCardHistoryRow[]>();
  for (const row of quizCardRows ?? []) {
    const existing = rowsByQuizResultId.get(row.quiz_result_id) ?? [];
    existing.push(row);
    rowsByQuizResultId.set(row.quiz_result_id, existing);
  }

  const history: QuizHistoryEntry[] = quizResults.map((result) => {
    const details = rowsByQuizResultId.get(result.id) ?? [];
    const incorrectAnswers = details
      .filter((detail) => !detail.correct)
      .map((detail) => {
        return {
          card_id: detail.card_id,
          card_number: null,
          prompt: detail.prompt_text ?? 'Card content unavailable',
          correct_answer: detail.correct_answer_text ?? 'Card term unavailable',
          user_answer:
            typeof detail.user_answer_text === 'string' && detail.user_answer_text.trim().length > 0
              ? detail.user_answer_text
              : null,
        };
      });

    const totalCards = result.total_cards > 0 ? result.total_cards : 1;
    const scorePercentage = Math.round((result.correct_cards / totalCards) * 100);

    return {
      id: result.id,
      deck_id: result.deck_id,
      // The `mode` CHECK constraint guarantees this is 'mcq' | 'identification';
      // Postgres reports the column type as plain text.
      mode: result.mode as QuizMode,
      total_cards: result.total_cards,
      correct_cards: result.correct_cards,
      score_percentage: scorePercentage,
      wrong_count: incorrectAnswers.length,
      duration_ms: result.duration_ms,
      created_at: result.created_at,
      incorrect_answers: incorrectAnswers,
    };
  });

  return { history };
}

export type WeakestConcept = {
  topic_tag: string;
  attempts: number;
  misses: number;
  error_rate: number;
};

export async function getWeakestConcepts(deckId: string, limit = 8) {
  const deckAccess = await requireOwnedDeck(deckId);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;

  const { data, error } = await supabase.rpc('get_weakest_concepts', {
    p_user_id: user.id,
    p_deck_id: deckId,
    p_limit: limit,
  });

  if (error) {
    if (isMissingDatabaseFunctionError(error.message, 'get_weakest_concepts')) {
      // Migration not applied yet — an empty list degrades gracefully to the
      // "not enough quiz history" empty state rather than an error.
      return { concepts: [] as WeakestConcept[] };
    }
    return { error: sanitizeDatabaseError(error, 'Failed to load weakest concepts.') };
  }

  return { concepts: (data ?? []) as WeakestConcept[] };
}
