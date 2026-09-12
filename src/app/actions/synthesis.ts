'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { guardAction } from '@/lib/action-guard';
import { withGeminiRetry } from '@/lib/ai-retry';
import { getServerEnv } from '@/lib/env-server';
import { logger } from '@/lib/logger';
import { MIN_CONTEXT_SIMILARITY } from '@/lib/rag';
import {
  archiveSynthesisDrillSchema,
  checkSynthesisAttemptSchema,
  generateSynthesisDrillsSchema,
  type ArchiveSynthesisDrillInput,
  type CheckSynthesisAttemptInput,
  type GenerateSynthesisDrillsInput,
} from '@/lib/schemas';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import {
  MAX_ACTIVE_DRILLS_PER_DECK,
  MIN_DECK_CARDS_FOR_DRILLS,
  clusterFromCards,
  pairKey,
  randomClusters,
  selectDrillClusters,
  type ClusterCard,
  type DrillCluster,
} from '@/lib/synthesis/clusters';
import { DRILL_COLUMNS, rowToDrill, toAnchorCards, type DrillRow } from '@/lib/synthesis/loaders';
import {
  buildCheckUserTurn,
  buildDrillCheckInstruction,
  buildDrillGenerationInstruction,
  renderClusterCards,
  validateDrillDraft,
} from '@/lib/synthesis/prompts';
import { nextSchedule } from '@/lib/synthesis/schedule';
import {
  DRILL_CHECK_SCHEMA,
  DRILL_GENERATION_SCHEMA,
  drillCheckOutputSchema,
  drillGenerationOutputSchema,
} from '@/lib/synthesis/schemas';
import { countWords, renderResponseForModel, responseText } from '@/lib/synthesis/text';
import type { Diagnostic, Exemplar, SynthesisFormat } from '@/lib/synthesis/types';
import { computeVerdict, countCovered, deriveCardIdSets, reconcileDiagnostic } from '@/lib/synthesis/verdict';
import {
  getGeminiJsonModel,
  recordAiUsage,
  requireOwnedDeck,
  reserveAiCall,
  sanitizeAiInputText,
} from './_shared';

/**
 * Micro-synthesis Server Actions (COGNIT_MICRO_SYNTHESIS_SPEC.md Rev. B.1 §9.3).
 *
 * Two model calls in the whole feature: one per generated drill (parallel,
 * temperature 0.6) and one per check (temperature 0.1, ≈ 3 s). The model
 * classifies; the server computes the verdict, verifies every quote it will
 * show, owns the drill schedule and touches cards in exactly one way (§8.4).
 */

const GENERATION_TEMPERATURE = 0.6;
const GENERATION_MAX_OUTPUT_TOKENS = 768;
const GENERATION_TIMEOUT_MS = 12_000;
const CHECK_TEMPERATURE = 0.1;
const CHECK_MAX_OUTPUT_TOKENS = 640;
const CHECK_TIMEOUT_MS = 8_000;
/** Bounded card read for clustering; the deck page reads the same ceiling. */
const MAX_CARDS_FOR_CLUSTERING = 400;
const MAX_ANSWER_CHARS = 1_500;
const PULL_FORWARD_HOURS = 24;

type ClusterCardRow = {
  id: string;
  front: string;
  back: string;
  explanation: string | null;
  topic_tags: string[] | null;
};

/** `front` is the term and `back` the definition in this schema (design system §7.6). */
function toClusterCard(row: ClusterCardRow): ClusterCard {
  return {
    id: row.id,
    term: row.front,
    definition: row.back,
    explanation: row.explanation,
    tags: Array.isArray(row.topic_tags) ? row.topic_tags.filter((tag): tag is string => typeof tag === 'string') : [],
  };
}

/**
 * JSON.parse failures are already `malformed_output` for withGeminiRetry
 * (classifyAiError checks `instanceof SyntaxError`). A schema mismatch is the
 * same failure — the model produced output outside the contract — so it is
 * raised as the same error class and gets the same single retry.
 */
function parseModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new SyntaxError(`Model output failed schema validation: ${parsed.error.issues[0]?.message ?? 'unknown issue'}`);
  }
  return parsed.data;
}

type SupabaseServerClient = NonNullable<Extract<Awaited<ReturnType<typeof requireOwnedDeck>>, { supabase: unknown }>>['supabase'];

/**
 * Embedding-neighbour clusters for decks whose tag graph is exhausted. Reuses
 * the deck-chat RPC with a card's OWN stored vector (the column round-trips
 * as a string literal, so nothing is re-embedded).
 */
async function embeddingClusters(
  supabase: SupabaseServerClient,
  input: {
    deckId: string;
    cardsById: Map<string, ClusterCard>;
    usedIds: Set<string>;
    existingKeys: Set<string>;
    needed: number;
  },
): Promise<DrillCluster[]> {
  if (input.needed <= 0) return [];

  const { data: seedRows, error: seedError } = await supabase
    .from('cards')
    .select('id')
    .eq('deck_id', input.deckId)
    .not('embedding', 'is', null)
    .limit(120);

  if (seedError || !seedRows || seedRows.length === 0) return [];

  const seeds = seedRows.map((row) => row.id).filter((id) => !input.usedIds.has(id) && input.cardsById.has(id));
  for (let index = seeds.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [seeds[index], seeds[swap]] = [seeds[swap], seeds[index]];
  }

  const clusters: DrillCluster[] = [];
  const maxTries = input.needed * 3;

  for (const seedId of seeds.slice(0, maxTries)) {
    if (clusters.length >= input.needed) break;
    if (input.usedIds.has(seedId)) continue;

    const { data: seed } = await supabase
      .from('cards')
      .select('embedding')
      .eq('id', seedId)
      .eq('deck_id', input.deckId)
      .single();
    if (!seed?.embedding) continue;

    const { data: neighbours, error: rpcError } = await supabase.rpc('search_deck_cards_by_embedding', {
      p_deck_id: input.deckId,
      p_query_embedding: seed.embedding,
      p_limit: 4,
    });
    if (rpcError) {
      logger.warn('synthesis', 'neighbour search failed', { message: rpcError.message });
      return clusters;
    }

    const neighbourCards = (neighbours ?? [])
      .filter((row) => row.id !== seedId && (row.similarity ?? 0) >= MIN_CONTEXT_SIMILARITY && !input.usedIds.has(row.id))
      .map((row) => input.cardsById.get(row.id))
      .filter((card): card is ClusterCard => Boolean(card))
      .slice(0, 2);

    const seedCard = input.cardsById.get(seedId);
    if (!seedCard) continue;
    const cluster = clusterFromCards([seedCard, ...neighbourCards], 'embedding');
    if (!cluster || input.existingKeys.has(pairKey(cluster.cards.map((card) => card.id)))) continue;

    for (const card of cluster.cards) input.usedIds.add(card.id);
    clusters.push(cluster);
  }

  return clusters;
}

async function generateDrillForCluster(cluster: DrillCluster, format: SynthesisFormat, index: number) {
  const model = getGeminiJsonModel({ temperature: GENERATION_TEMPERATURE });

  return withGeminiRetry(
    async () => {
      const result = await model.generateContent(
        {
          systemInstruction: buildDrillGenerationInstruction(format),
          // A request-level generationConfig REPLACES the model-level one in the
          // 0.24 SDK (GenerativeModel.generateContent spreads the request over
          // its own config), so temperature and the output cap are restated here.
          generationConfig: {
            temperature: GENERATION_TEMPERATURE,
            topP: 0.95,
            maxOutputTokens: GENERATION_MAX_OUTPUT_TOKENS,
            responseMimeType: 'application/json',
            responseSchema: DRILL_GENERATION_SCHEMA,
          },
          contents: [{ role: 'user', parts: [{ text: `CARDS\n${renderClusterCards(cluster.cards)}` }] }],
        },
        { timeout: GENERATION_TIMEOUT_MS },
      );
      return parseModelJson(result.response.text(), drillGenerationOutputSchema);
    },
    { label: `synthesis_generate_${index}`, maxAttempts: 2 },
  );
}

export async function generateSynthesisDrills(data: GenerateSynthesisDrillsInput) {
  return guardAction('Drill generation', async () => {
    const parsed = generateSynthesisDrillsSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }
    const { supabase, user } = deckAccess;
    const deckId = parsed.data.deck_id;

    const { data: cardRows, error: cardsError } = await supabase
      .from('cards')
      .select('id, front, back, explanation, topic_tags')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true })
      .limit(MAX_CARDS_FOR_CLUSTERING);

    if (cardsError) {
      return { error: sanitizeDatabaseError(cardsError, 'Failed to load cards for drills.') };
    }

    const cards = ((cardRows ?? []) as ClusterCardRow[]).map(toClusterCard);
    if (cards.length < MIN_DECK_CARDS_FOR_DRILLS) {
      return { error: `Synthesis drills need at least ${MIN_DECK_CARDS_FOR_DRILLS} cards; this deck has ${cards.length}.` };
    }

    const { data: activeRows, error: activeError } = await supabase
      .from('synthesis_drills')
      .select('card_ids')
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(MAX_ACTIVE_DRILLS_PER_DECK + 1);

    if (activeError) {
      return { error: sanitizeDatabaseError(activeError, 'Failed to load existing drills.') };
    }

    const activeCount = activeRows?.length ?? 0;
    if (activeCount >= MAX_ACTIVE_DRILLS_PER_DECK) {
      return { error: `This deck already has ${MAX_ACTIVE_DRILLS_PER_DECK} active drills. Archive some first.` };
    }

    const count = Math.min(parsed.data.count, MAX_ACTIVE_DRILLS_PER_DECK - activeCount);
    const existingKeys = new Set((activeRows ?? []).map((row) => pairKey(row.card_ids)));

    const reservation = await reserveAiCall(supabase, user.id, 'synthesis_generate', { deck_id: deckId, count });
    if (!reservation.ok) {
      return { error: reservation.error };
    }

    // ── Clusters: tags → embedding neighbours → random ──
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const clusters = selectDrillClusters({
      cards,
      existingClusterKeys: existingKeys,
      count,
      focusTopic: parsed.data.focus_topic,
    });
    const usedIds = new Set(clusters.flatMap((cluster) => cluster.cards.map((card) => card.id)));

    if (clusters.length < count) {
      clusters.push(...await embeddingClusters(supabase, {
        deckId, cardsById, usedIds, existingKeys, needed: count - clusters.length,
      }));
    }
    if (clusters.length < count) {
      const remaining = cards.filter((card) => !usedIds.has(card.id));
      clusters.push(...randomClusters({ cards: remaining, existingClusterKeys: existingKeys, count: count - clusters.length }));
    }

    if (clusters.length === 0) {
      return { error: 'Every related pair of cards already has a drill. Add cards or archive drills to generate more.' };
    }

    // ── One call per cluster, in parallel; one bad cluster never loses the batch ──
    const formats = parsed.data.formats;
    const env = getServerEnv();
    const settled = await Promise.allSettled(
      clusters.map((cluster, index) => generateDrillForCluster(cluster, formats[index % formats.length], index)),
    );

    const rows: {
      deck_id: string;
      user_id: string;
      format: string;
      prompt_text: string;
      card_ids: string[];
      topic_tag: string | null;
      required_links: { id: string; text: string; card_ids: string[] }[];
      exemplar: Exemplar;
      generation_meta: Record<string, string | number | boolean | null>;
    }[] = [];
    let failed = 0;

    settled.forEach((outcome, index) => {
      const cluster = clusters[index];
      const requestedFormat = formats[index % formats.length];
      if (outcome.status === 'rejected') {
        failed += 1;
        logger.warn('generateSynthesisDrills', 'cluster generation failed', {
          index,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        });
        return;
      }

      const validation = validateDrillDraft(outcome.value, cluster.cards);
      if (!validation.ok) {
        failed += 1;
        logger.warn('generateSynthesisDrills', 'draft rejected', { index, reason: validation.reason });
        return;
      }

      const { drill } = validation;
      rows.push({
        deck_id: deckId,
        user_id: user.id,
        format: drill.format,
        prompt_text: drill.promptText,
        card_ids: drill.cardIds,
        topic_tag: cluster.topicTag,
        required_links: drill.requiredLinks.map((link) => ({ id: link.id, text: link.text, card_ids: link.cardIds })),
        exemplar: drill.exemplar,
        generation_meta: {
          model: env.GEMINI_MODEL,
          temperature: GENERATION_TEMPERATURE,
          clustering: cluster.clustering,
          requested_format: requestedFormat,
          format_substituted: drill.format !== requestedFormat,
        },
      });
    });

    let drillIds: string[] = [];
    if (rows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('synthesis_drills')
        .insert(rows)
        .select('id');

      if (insertError) {
        logger.error('generateSynthesisDrills', 'insert failed', { code: insertError.code, message: insertError.message });
        return { error: sanitizeDatabaseError(insertError, 'Drills were generated but failed to save.') };
      }
      drillIds = (inserted ?? []).map((row) => row.id);
    }

    revalidatePath(`/dashboard/${deckId}`);

    await recordAiUsage(
      supabase,
      user.id,
      'synthesis_generate',
      { deck_id: deckId, requested: count, created: rows.length, failed, clustering: clusters[0]?.clustering ?? null },
      reservation.reservationId,
    );

    if (rows.length === 0) {
      return { error: 'AI could not produce a valid drill from this deck. Please try again.' };
    }

    return { success: true as const, created: rows.length, failed, drillIds };
  });
}

export async function checkSynthesisAttempt(data: CheckSynthesisAttemptInput) {
  return guardAction('Drill check', async () => {
    const parsed = checkSynthesisAttemptSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }
    const { supabase, user } = deckAccess;
    const { deck_id: deckId, drill_id: drillId, mode, response } = parsed.data;

    const { data: drillRow, error: drillError } = await supabase
      .from('synthesis_drills')
      .select(DRILL_COLUMNS)
      .eq('id', drillId)
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (drillError || !drillRow) {
      return { error: 'Drill not found or access denied.' };
    }
    const drill = rowToDrill(drillRow as DrillRow);
    if (!drill) {
      return { error: 'This drill is malformed. Archive it and generate a new one.' };
    }

    const { data: anchorRows, error: anchorsError } = await supabase
      .from('cards')
      .select('id, front, back, explanation, state')
      .eq('deck_id', deckId)
      .in('id', drill.cardIds);

    if (anchorsError) {
      return { error: sanitizeDatabaseError(anchorsError, 'Failed to load this drill\'s cards.') };
    }
    const anchors = toAnchorCards(drill, anchorRows ?? []);
    if (anchors.length < 2) {
      return { error: 'The cards behind this drill were deleted. Archive it and generate a new one.' };
    }

    // Word count is computed here, from the body — never taken from the client.
    const wordCount = countWords(responseText(response));
    if (wordCount === 0) {
      return { error: 'Write an answer first.' };
    }

    const reservation = await reserveAiCall(supabase, user.id, 'synthesis_check', { deck_id: deckId, drill_id: drillId });
    if (!reservation.ok) {
      return { error: reservation.error };
    }

    // ── One call ──
    const nonce = randomUUID().slice(0, 8);
    const renderedAnswer = sanitizeAiInputText(renderResponseForModel(mode, response), MAX_ANSWER_CHARS);
    const model = getGeminiJsonModel({ temperature: CHECK_TEMPERATURE });
    const startedAt = Date.now();

    const { output, usage } = await withGeminiRetry(
      async () => {
        const result = await model.generateContent(
          {
            systemInstruction: buildDrillCheckInstruction(nonce),
            generationConfig: {
              temperature: CHECK_TEMPERATURE,
              topP: 0.95,
              maxOutputTokens: CHECK_MAX_OUTPUT_TOKENS,
              responseMimeType: 'application/json',
              responseSchema: DRILL_CHECK_SCHEMA,
            },
            contents: [{
              role: 'user',
              parts: [{
                text: buildCheckUserTurn({
                  format: drill.format,
                  promptText: drill.promptText,
                  anchors,
                  requiredLinks: drill.requiredLinks,
                  exemplar: drill.exemplar,
                  mode,
                  renderedAnswer,
                  nonce,
                }),
              }],
            }],
          },
          { timeout: CHECK_TIMEOUT_MS },
        );
        return {
          output: parseModelJson(result.response.text(), drillCheckOutputSchema),
          usage: result.response.usageMetadata ?? null,
        };
      },
      { label: 'synthesis_check', maxAttempts: 2 },
    );

    const elapsedMs = Date.now() - startedAt;

    // ── The server decides ──
    const reconciled = reconcileDiagnostic(output, { requiredLinks: drill.requiredLinks, anchors, answerText: renderedAnswer });
    const verdict = computeVerdict(reconciled);
    const { missingCardIds, contradictedCardIds } = deriveCardIdSets(reconciled.coverage, drill.requiredLinks, reconciled.contradictions);
    const now = new Date();
    const schedule = nextSchedule(drill.step, verdict, now);

    // ── Cards: pull contradicted cards forward, never reset them (spec §8.4) ──
    // Runs before the attempt insert because the attempt row is immutable and
    // must record what actually happened, not what was planned.
    let pulledForwardCardIds: string[] = [];
    if (parsed.data.pull_forward && verdict === 'contradicted' && contradictedCardIds.length > 0) {
      const notAfterIso = new Date(now.getTime() + PULL_FORWARD_HOURS * 60 * 60_000).toISOString();
      const { data: pulled, error: pullError } = await supabase
        .from('cards')
        .update({ next_review_at: notAfterIso })
        .eq('deck_id', deckId)
        .eq('state', 'review')
        .in('id', contradictedCardIds)
        // Never push a card later; learning/new cards are already imminent.
        .gt('next_review_at', notAfterIso)
        .select('id');

      if (pullError) {
        logger.error('checkSynthesisAttempt', 'pull-forward failed', { code: pullError.code, message: pullError.message });
      } else {
        pulledForwardCardIds = (pulled ?? []).map((row) => row.id);
      }
    }

    const env = getServerEnv();
    const { data: attempt, error: attemptError } = await supabase
      .from('synthesis_attempts')
      .insert({
        drill_id: drillId,
        deck_id: deckId,
        user_id: user.id,
        mode,
        response,
        word_count: wordCount,
        duration_ms: parsed.data.duration_ms,
        verdict,
        coverage: reconciled.coverage.map((entry) => ({ link_id: entry.linkId, status: entry.status, evidence: entry.evidence })),
        contradictions: reconciled.contradictions.map((entry) => ({ statement: entry.statement, card_id: entry.cardId, card_says: entry.cardSays })),
        outside_claims: reconciled.outsideClaims.map((entry) => ({
          statement: entry.statement,
          verified: entry.verified,
          ai_assessment: entry.aiAssessment,
          term_suggestion: entry.termSuggestion,
        })),
        structure: { claim_present: reconciled.structure.claimPresent, tradeoff_present: reconciled.structure.tradeoffPresent },
        gap_note: reconciled.gapNote,
        missing_card_ids: missingCardIds,
        contradicted_card_ids: contradictedCardIds,
        pulled_forward_card_ids: pulledForwardCardIds,
        integrity: { injection_detected: reconciled.integrity.injectionDetected, off_target: reconciled.integrity.offTarget },
        model: env.GEMINI_MODEL,
        usage: {
          in: usage?.promptTokenCount ?? null,
          out: usage?.candidatesTokenCount ?? null,
          ms: elapsedMs,
        },
      })
      .select('id')
      .single();

    if (attemptError || !attempt) {
      logger.error('checkSynthesisAttempt', 'attempt insert failed', { code: attemptError?.code, message: attemptError?.message });
      return { error: sanitizeDatabaseError(attemptError, 'The check ran but could not be saved.') };
    }

    // The attempt is the record; a failed schedule update is surfaced, not swallowed.
    const { error: drillUpdateError } = await supabase
      .from('synthesis_drills')
      .update({
        step: schedule.step,
        next_due_at: schedule.nextDueAt.toISOString(),
        attempt_count: drill.attemptCount + 1,
        last_verdict: verdict,
        last_attempt_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', drillId)
      .eq('deck_id', deckId)
      .eq('user_id', user.id);

    if (drillUpdateError) {
      logger.error('checkSynthesisAttempt', 'drill schedule update failed', { code: drillUpdateError.code, message: drillUpdateError.message });
    }

    revalidatePath(`/dashboard/${deckId}`);

    await recordAiUsage(
      supabase,
      user.id,
      'synthesis_check',
      {
        deck_id: deckId,
        drill_id: drillId,
        attempt_id: attempt.id,
        verdict,
        elapsed_ms: elapsedMs,
        prompt_tokens: usage?.promptTokenCount ?? null,
        output_tokens: usage?.candidatesTokenCount ?? null,
      },
      reservation.reservationId,
    );

    const diagnostic: Diagnostic = {
      verdict,
      coverage: reconciled.coverage,
      contradictions: reconciled.contradictions,
      outsideClaims: reconciled.outsideClaims,
      structure: reconciled.structure,
      gapNote: reconciled.gapNote,
      integrity: reconciled.integrity,
      pulledForwardCardIds,
      linksCovered: countCovered(reconciled.coverage),
      linksTotal: drill.requiredLinks.length,
      schedule: { step: schedule.step, nextDueAt: schedule.nextDueAt.toISOString() },
    };

    return {
      success: true as const,
      attemptId: attempt.id,
      diagnostic,
      exemplar: drill.exemplar,
      scheduleSaved: !drillUpdateError,
    };
  });
}

export async function archiveSynthesisDrill(data: ArchiveSynthesisDrillInput) {
  const parsed = archiveSynthesisDrillSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }
  const { supabase, user } = deckAccess;

  const { error } = await supabase
    .from('synthesis_drills')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.drill_id)
    .eq('deck_id', parsed.data.deck_id)
    .eq('user_id', user.id);

  if (error) {
    logger.error('archiveSynthesisDrill', 'update failed', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to archive the drill.') };
  }

  revalidatePath(`/dashboard/${parsed.data.deck_id}`);
  return { success: true as const };
}
