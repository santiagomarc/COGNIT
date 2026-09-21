'use server';

import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { FinishReason, type GenerateContentResult } from '@google/generative-ai';
import type { z } from 'zod';
import type { Json } from '@/lib/database.types';
import { guardAction } from '@/lib/action-guard';
import { AiServiceError, withGeminiRetry } from '@/lib/ai-retry';
import { getServerEnv } from '@/lib/env-server';
import { logger } from '@/lib/logger';
import { MIN_CONTEXT_SIMILARITY } from '@/lib/rag';
import {
  absorbOutsideClaimSchema,
  archiveSynthesisDrillSchema,
  checkSynthesisAttemptSchema,
  deleteQuestionSchema,
  generatePlanQuestionsSchema,
  generateSynthesisDrillsSchema,
  ingestQuestionsSchema,
  rateSynthesisAttemptSchema,
  type AbsorbOutsideClaimInput,
  type ArchiveSynthesisDrillInput,
  type CheckSynthesisAttemptInput,
  type DeleteQuestionInput,
  type GeneratePlanQuestionsInput,
  type GenerateSynthesisDrillsInput,
  type IngestQuestionsInput,
  type RateSynthesisAttemptInput,
  setExamDateSchema,
  type SetExamDateInput,
} from '@/lib/schemas';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import {
  MAX_ACTIVE_DRILLS_PER_DECK,
  MAX_PLAN_CLUSTER,
  MIN_DECK_CARDS_FOR_DRILLS,
  MIN_PLAN_CLUSTER,
  clusterFromCards,
  pairKey,
  randomClusters,
  selectDrillClusters,
  selectPlanCluster,
  type ClusterCard,
  type DrillCluster,
} from '@/lib/synthesis/clusters';
import { embedTexts, toVectorLiteral } from '@/lib/embeddings';
import {
  DRILL_COLUMNS,
  digestPlanExemplar,
  loadAbsorbedClaims,
  parseStoredAttempt,
  rowToDrill,
  toAnchorCards,
  type DrillRow,
} from '@/lib/synthesis/loaders';
import {
  SYNTHESIS_PROMPT_VERSION,
  buildCheckUserTurn,
  buildDrillCheckInstruction,
  buildDrillGenerationInstruction,
  buildPlanGenerationInstruction,
  promptOpening,
  renderClusterCards,
  stemFor,
  validateDrillDraft,
  validatePlanDraft,
} from '@/lib/synthesis/prompts';
import { daysToExam, nextSchedule } from '@/lib/synthesis/schedule';
import {
  DRILL_CHECK_SCHEMA,
  DRILL_GENERATION_SCHEMA,
  PLAN_GENERATION_SCHEMA,
  drillCheckOutputSchema,
  drillGenerationOutputSchema,
  planGenerationOutputSchema,
} from '@/lib/synthesis/schemas';
import { countWords, isOutlineResponse, isPlanResponse, renderResponseForModel, responseText } from '@/lib/synthesis/text';
import { promptForAttempt, type AnchorCard, type Diagnostic, type DrillReveal, type Exemplar, type SynthesisDrill, type SynthesisFormat } from '@/lib/synthesis/types';
import { computeBand, computeVerdict, countCovered, deriveCardIdSets, mergeReconciled, reconcileDiagnostic } from '@/lib/synthesis/verdict';
import {
  getGeminiJsonModel,
  jsonGenerationConfig,
  recordAiUsage,
  requireOwnedDeck,
  reserveAiCall,
  resolveModelName,
  sanitizeAiInputText,
  touchDeckUpdatedAt,
} from './_shared';
import { enrichCards } from './ai-enrich';
import { syncEmbeddings } from './chat';

/**
 * Micro-synthesis Server Actions (COGNIT_MICRO_SYNTHESIS_SPEC.md Rev. B.1 §9.3).
 *
 * Two model calls in the whole feature: one per generated drill (parallel,
 * temperature 0.6) and one per check (temperature 0.1, ≈ 3 s). The model
 * classifies; the server computes the verdict, verifies every quote it will
 * show, owns the drill schedule and touches cards in exactly one way (§8.4).
 *
 * The output cap is the app-wide `GEMINI_MODEL_MAX_TOKENS` (audit R3): the
 * response schema is what keeps the JSON short, and a tight cap on a
 * thinking-capable model truncates the JSON instead. A truncated response is
 * detected from `finishReason` and never retried at the same cap.
 */

const GENERATION_TEMPERATURE = 0.6;
const GENERATION_TIMEOUT_MS = 12_000;
const CHECK_TEMPERATURE = 0.1;
const CHECK_TIMEOUT_MS = 8_000;
/** Bounded card read for clustering; the deck page reads the same ceiling. */
const MAX_CARDS_FOR_CLUSTERING = 400;
const MAX_ANSWER_CHARS = 1_500;
/** A plan carries fourteen fields; the rendered form runs longer than a drill answer. */
const MAX_PLAN_ANSWER_CHARS = 3_500;
const PULL_FORWARD_HOURS = 24;
/** Concurrent neighbour searches in the embedding fallback. */
const EMBEDDING_LOOKUP_CONCURRENCY = 3;

type ClusterCardRow = {
  id: string;
  front: string;
  back: string;
  topic_tags: string[] | null;
};

/** `front` is the term and `back` the definition in this schema (design system §7.6). */
function toClusterCard(row: ClusterCardRow): ClusterCard {
  return {
    id: row.id,
    term: row.front,
    definition: row.back,
    explanation: null,
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

type ModelUsage = { in: number | null; out: number | null; thoughts: number | null };

function usageOf(result: GenerateContentResult): ModelUsage {
  const usage = result.response.usageMetadata as (typeof result.response.usageMetadata & { thoughtsTokenCount?: number }) | undefined;
  return {
    in: usage?.promptTokenCount ?? null,
    out: usage?.candidatesTokenCount ?? null,
    thoughts: usage?.thoughtsTokenCount ?? null,
  };
}

function finishReasonOf(result: GenerateContentResult): string | null {
  return result.response.candidates?.[0]?.finishReason ?? null;
}

/**
 * A response cut off at the output cap is not a transient failure and must
 * not be retried at the same cap (audit R3): it is raised as `bad_request`,
 * which withGeminiRetry never retries, with the budget in the log line.
 */
function assertComplete(result: GenerateContentResult, label: string): void {
  if (finishReasonOf(result) === FinishReason.MAX_TOKENS) {
    const usage = usageOf(result);
    throw new AiServiceError(
      'bad_request',
      `${label}: response truncated at maxOutputTokens (out=${usage.out ?? '?'}, thoughts=${usage.thoughts ?? '?'})`,
      1,
    );
  }
}

type SupabaseServerClient = NonNullable<Extract<Awaited<ReturnType<typeof requireOwnedDeck>>, { supabase: unknown }>>['supabase'];

/** Runs `task` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Embedding-neighbour clusters for decks whose tag graph is exhausted. Reuses
 * the deck-chat RPC with a card's OWN stored vector (the column round-trips
 * as a string literal, so nothing is re-embedded). One read for every seed's
 * vector, then the neighbour searches a few at a time (audit P2).
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
  const tried = seeds.slice(0, input.needed * 3);
  if (tried.length === 0) return [];

  const { data: vectorRows, error: vectorError } = await supabase
    .from('cards')
    .select('id, embedding')
    .eq('deck_id', input.deckId)
    .in('id', tried);
  if (vectorError || !vectorRows) return [];
  const vectorById = new Map(vectorRows.map((row) => [row.id, row.embedding]));

  const neighbourLists = await mapWithConcurrency(tried, EMBEDDING_LOOKUP_CONCURRENCY, async (seedId) => {
    const vector = vectorById.get(seedId);
    if (!vector) return { seedId, neighbours: [] as { id: string; similarity: number | null }[] };
    const { data, error } = await supabase.rpc('search_deck_cards_by_embedding', {
      p_deck_id: input.deckId,
      p_query_embedding: vector,
      p_limit: 4,
    });
    if (error) {
      logger.warn('synthesis', 'neighbour search failed', { message: error.message });
      return { seedId, neighbours: [] };
    }
    return { seedId, neighbours: (data ?? []).map((row) => ({ id: row.id, similarity: row.similarity ?? null })) };
  });

  // Assembly stays sequential: each cluster claims its cards before the next
  // seed is considered, so no two drills in the batch share a card.
  const clusters: DrillCluster[] = [];
  for (const { seedId, neighbours } of neighbourLists) {
    if (clusters.length >= input.needed) break;
    if (input.usedIds.has(seedId)) continue;
    const seedCard = input.cardsById.get(seedId);
    if (!seedCard) continue;

    const neighbourCards = neighbours
      .filter((row) => row.id !== seedId && (row.similarity ?? 0) >= MIN_CONTEXT_SIMILARITY && !input.usedIds.has(row.id))
      .map((row) => input.cardsById.get(row.id))
      .filter((card): card is ClusterCard => Boolean(card))
      .slice(0, 2);

    const cluster = clusterFromCards([seedCard, ...neighbourCards], 'embedding');
    if (!cluster || input.existingKeys.has(pairKey(cluster.cards.map((card) => card.id)))) continue;

    for (const card of cluster.cards) input.usedIds.add(card.id);
    clusters.push(cluster);
  }

  return clusters;
}

async function generateDrillForCluster(cluster: DrillCluster, format: SynthesisFormat, index: number, stemIndex: number) {
  // Generation may run on a stronger model than checks (plan D2): the key is
  // the ceiling of everything downstream and this call is not latency-bound.
  const modelName = resolveModelName('generation');
  const model = getGeminiJsonModel({ temperature: GENERATION_TEMPERATURE, purpose: 'generation' });
  const label = `synthesis_generate_${index}`;

  return withGeminiRetry(
    async () => {
      const result = await model.generateContent(
        {
          // The exam stem rotates across the batch (plan D5).
          systemInstruction: buildDrillGenerationInstruction(format, { stem: stemFor(format, stemIndex) }),
          // jsonGenerationConfig restates temperature and the output cap: a
          // request-level config REPLACES the model-level one in the 0.24 SDK.
          generationConfig: jsonGenerationConfig({
            responseSchema: DRILL_GENERATION_SCHEMA,
            temperature: GENERATION_TEMPERATURE,
            thinking: getServerEnv().GEMINI_GENERATION_THINKING,
            model: modelName,
          }),
          contents: [{ role: 'user', parts: [{ text: `CARDS\n${renderClusterCards(cluster.cards)}` }] }],
        },
        { timeout: GENERATION_TIMEOUT_MS },
      );
      assertComplete(result, label);
      return {
        draft: parseModelJson(result.response.text(), drillGenerationOutputSchema),
        finishReason: finishReasonOf(result),
        usage: usageOf(result),
        model: modelName,
      };
    },
    { label, maxAttempts: 2 },
  );
}

/**
 * Drills whose anchor cards were deleted are never served, but they used to
 * count toward the deck's active cap until it locked (audit R5). They are
 * archived here, on the one path that already holds every card id.
 */
async function archiveOrphanedDrills(
  supabase: SupabaseServerClient,
  input: { deckId: string; userId: string; drills: { id: string; card_ids: string[] }[]; liveCardIds: Set<string> },
): Promise<Set<string>> {
  const orphaned = input.drills.filter((drill) => drill.card_ids.filter((id) => input.liveCardIds.has(id)).length < 2);
  if (orphaned.length === 0) return new Set();

  const { error } = await supabase
    .from('synthesis_drills')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('deck_id', input.deckId)
    .eq('user_id', input.userId)
    .in('id', orphaned.map((drill) => drill.id));

  if (error) {
    logger.warn('generateSynthesisDrills', 'orphaned drill archive failed', { message: error.message, count: orphaned.length });
    return new Set();
  }
  logger.info('generateSynthesisDrills', 'archived drills whose cards were deleted', { count: orphaned.length });
  return new Set(orphaned.map((drill) => drill.id));
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

    // Clustering needs terms and tags only; explanations are fetched later,
    // for the few cards that end up in a cluster (audit P2).
    const [{ data: cardRows, error: cardsError }, { data: activeRows, error: activeError }] = await Promise.all([
      supabase
        .from('cards')
        .select('id, front, back, topic_tags')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: true })
        .limit(MAX_CARDS_FOR_CLUSTERING),
      supabase
        .from('synthesis_drills')
        .select('id, card_ids')
        .eq('deck_id', deckId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(MAX_ACTIVE_DRILLS_PER_DECK + 1),
    ]);

    if (cardsError) {
      return { error: sanitizeDatabaseError(cardsError, 'Failed to load cards for drills.') };
    }
    if (activeError) {
      return { error: sanitizeDatabaseError(activeError, 'Failed to load existing drills.') };
    }

    const cards = ((cardRows ?? []) as ClusterCardRow[]).map(toClusterCard);
    if (cards.length < MIN_DECK_CARDS_FOR_DRILLS) {
      return { error: `Synthesis drills need at least ${MIN_DECK_CARDS_FOR_DRILLS} cards; this deck has ${cards.length}.` };
    }

    const liveCardIds = new Set(cards.map((card) => card.id));
    const archivedIds = await archiveOrphanedDrills(supabase, { deckId, userId: user.id, drills: activeRows ?? [], liveCardIds });
    const activeDrills = (activeRows ?? []).filter((row) => !archivedIds.has(row.id));

    if (activeDrills.length >= MAX_ACTIVE_DRILLS_PER_DECK) {
      return { error: `This deck already has ${MAX_ACTIVE_DRILLS_PER_DECK} active drills. Archive some first.` };
    }

    const count = Math.min(parsed.data.count, MAX_ACTIVE_DRILLS_PER_DECK - activeDrills.length);
    const existingKeys = new Set(activeDrills.map((row) => pairKey(row.card_ids)));

    // One reservation covers one model call per drill requested.
    const reservation = await reserveAiCall(supabase, user.id, 'synthesis_generate', { deck_id: deckId, count }, { calls: count });
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

    // The explanations of the chosen cards only — they make the prompt, not the clustering.
    const chosenIds = [...new Set(clusters.flatMap((cluster) => cluster.cards.map((card) => card.id)))];
    const { data: explanationRows } = await supabase
      .from('cards')
      .select('id, explanation')
      .eq('deck_id', deckId)
      .in('id', chosenIds);
    const explanationById = new Map((explanationRows ?? []).map((row) => [row.id, typeof row.explanation === 'string' ? row.explanation : null]));
    for (const cluster of clusters) {
      for (const card of cluster.cards) card.explanation = explanationById.get(card.id) ?? null;
    }

    // ── One call per cluster, in parallel; one bad cluster never loses the batch ──
    const formats = parsed.data.formats;
    const stemOffset = Math.floor(Math.random() * 4);
    const settled = await Promise.allSettled(
      clusters.map((cluster, index) => generateDrillForCluster(cluster, formats[index % formats.length], index, stemOffset + index)),
    );

    const rows: {
      deck_id: string;
      user_id: string;
      format: string;
      prompt_text: string;
      prompt_variants: string[];
      scenario: string | null;
      bloom: string | null;
      card_ids: string[];
      topic_tag: string | null;
      required_links: { id: string; text: string; card_ids: string[]; kind: string; core: boolean }[];
      link_count: number;
      exemplar: Exemplar;
      generation_meta: Record<string, string | number | boolean | null>;
    }[] = [];
    let failed = 0;
    const openings = new Set<string>();

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

      const validation = validateDrillDraft(outcome.value.draft, cluster.cards);
      if (!validation.ok) {
        failed += 1;
        logger.warn('generateSynthesisDrills', 'draft rejected', { index, reason: validation.reason });
        return;
      }

      const { drill } = validation;
      // Two drills in one batch opening with the same five words read as one
      // drill twice; the second is dropped (plan D5).
      const opening = promptOpening(drill.promptText);
      if (openings.has(opening)) {
        failed += 1;
        logger.warn('generateSynthesisDrills', 'draft rejected', { index, reason: 'duplicate_stem' });
        return;
      }
      openings.add(opening);

      rows.push({
        deck_id: deckId,
        user_id: user.id,
        format: drill.format,
        prompt_text: drill.promptText,
        prompt_variants: drill.promptVariants,
        scenario: drill.scenario,
        bloom: drill.bloom,
        card_ids: drill.cardIds,
        topic_tag: cluster.topicTag,
        required_links: drill.requiredLinks.map((link) => ({ id: link.id, text: link.text, card_ids: link.cardIds, kind: link.kind, core: link.core })),
        link_count: drill.requiredLinks.length,
        exemplar: drill.exemplar,
        generation_meta: {
          model: outcome.value.model,
          prompt_version: SYNTHESIS_PROMPT_VERSION,
          temperature: GENERATION_TEMPERATURE,
          clustering: cluster.clustering,
          requested_format: requestedFormat,
          format_substituted: drill.format !== requestedFormat,
          finish_reason: outcome.value.finishReason,
          tokens_in: outcome.value.usage.in,
          tokens_out: outcome.value.usage.out,
          tokens_thoughts: outcome.value.usage.thoughts,
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

    const topics = [...new Set(rows.map((row) => row.topic_tag).filter((tag): tag is string => Boolean(tag)))];
    return { success: true as const, created: rows.length, failed, drillIds, topics };
  });
}

function revealFor(drill: SynthesisDrill, anchors: AnchorCard[]): DrillReveal {
  return {
    requiredLinks: drill.requiredLinks.map((link) => ({ id: link.id, text: link.text, kind: link.kind, core: link.core })),
    exemplar: drill.exemplar,
    planExemplar: drill.planExemplar,
    cards: anchors.map((anchor) => ({ id: anchor.id, term: anchor.term, definition: anchor.definition, explanation: anchor.explanation })),
  };
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
    const { supabase, user, deck } = deckAccess;
    const { deck_id: deckId, drill_id: drillId, mode, response } = parsed.data;
    const confidence = parsed.data.confidence ?? null;
    const promptVariant = parsed.data.prompt_variant;
    const isPlan = mode === 'plan';

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
    // A plan is answered as a plan and a drill as a drill; the key shapes differ.
    if ((drill.kind === 'plan') !== isPlan) {
      return { error: isPlan ? 'This is a drill, not a plan question.' : 'This question needs a plan, not a drill answer.' };
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
    const reveal = revealFor(drill, anchors);
    // The checker reads the wording the student answered, not the original (plan D6).
    const servedPrompt = promptForAttempt(drill, promptVariant);

    // ── Replay (audit R8): the same client key returns the attempt it already produced ──
    if (parsed.data.client_attempt_id) {
      const { data: existing } = await supabase
        .from('synthesis_attempts')
        .select('id, verdict, coverage, contradictions, outside_claims, structure, gap_note, integrity, pulled_forward_card_ids, confidence, band')
        .eq('drill_id', drillId)
        .eq('user_id', user.id)
        .eq('client_attempt_id', parsed.data.client_attempt_id)
        .maybeSingle();

      if (existing) {
        const stored = parseStoredAttempt(existing);
        if (stored) {
          logger.info('checkSynthesisAttempt', 'replayed an existing attempt', { attempt_id: existing.id });
          const absorbed = await loadAbsorbedClaims(supabase, { attemptIds: [existing.id] });
          const diagnostic: Diagnostic = {
            ...stored,
            linksCovered: countCovered(stored.coverage),
            linksTotal: drill.requiredLinks.length,
            schedule: { step: drill.step, nextDueAt: drill.nextDueAt },
            absorbedCardIds: Object.fromEntries(absorbed.get(existing.id) ?? []),
            band: stored.band,
          };
          return { success: true as const, attemptId: existing.id, diagnostic, reveal, exemplar: drill.exemplar, scheduleSaved: true, replayed: true };
        }
      }
    }

    // ── Revision (audit F2): must point at an attempt on this drill that is not itself a revision ──
    if (parsed.data.revision_of) {
      const { data: original } = await supabase
        .from('synthesis_attempts')
        .select('id, revision_of')
        .eq('id', parsed.data.revision_of)
        .eq('drill_id', drillId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!original || original.revision_of) {
        return { error: 'That attempt cannot be revised.' };
      }
    }

    // Word count is computed here, from the body — never taken from the client.
    const wordCount = countWords(responseText(response));
    if (wordCount === 0) {
      return { error: 'Write an answer first.' };
    }

    // A plan is higher stakes and checked less often: two samples, merged
    // conservatively (audit G6). A drill is one call.
    const samples = isPlan ? 2 : 1;
    const reservation = await reserveAiCall(supabase, user.id, 'synthesis_check', { deck_id: deckId, drill_id: drillId, samples }, { calls: samples });
    if (!reservation.ok) {
      return { error: reservation.error };
    }

    // ── One call (two for a plan) ──
    const nonce = randomUUID().slice(0, 8);
    const renderedAnswer = sanitizeAiInputText(renderResponseForModel(mode, response), isPlan ? MAX_PLAN_ANSWER_CHARS : MAX_ANSWER_CHARS);
    const env = getServerEnv();
    const model = getGeminiJsonModel({ temperature: CHECK_TEMPERATURE });
    const startedAt = Date.now();

    const runCheck = () => withGeminiRetry(
      async () => {
        const result = await model.generateContent(
          {
            systemInstruction: buildDrillCheckInstruction(nonce, { plan: isPlan }),
            generationConfig: jsonGenerationConfig({
              responseSchema: DRILL_CHECK_SCHEMA,
              temperature: CHECK_TEMPERATURE,
            }),
            contents: [{
              role: 'user',
              parts: [{
                text: buildCheckUserTurn({
                  format: drill.format,
                  promptText: isPlan ? (drill.questionText ?? drill.promptText) : servedPrompt,
                  scenario: drill.scenario,
                  anchors,
                  requiredLinks: drill.requiredLinks,
                  exemplar: drill.exemplar,
                  planExemplar: drill.planExemplar,
                  mode,
                  renderedAnswer,
                  nonce,
                }),
              }],
            }],
          },
          { timeout: CHECK_TIMEOUT_MS },
        );
        assertComplete(result, 'synthesis_check');
        return {
          output: parseModelJson(result.response.text(), drillCheckOutputSchema),
          usage: usageOf(result),
          finishReason: finishReasonOf(result),
        };
      },
      // A second 8 s wait after an 8 s deadline is never what the student
      // wants; the canvas offers the retry instead (audit R2).
      { label: 'synthesis_check', maxAttempts: 2, shouldRetry: (kind) => kind !== 'timeout' },
    );

    const runs = await Promise.all(Array.from({ length: samples }, () => runCheck()));
    const { output, finishReason } = runs[0];
    const usage: ModelUsage = runs.reduce<ModelUsage>(
      (sum, run) => ({
        in: sum.in === null && run.usage.in === null ? null : (sum.in ?? 0) + (run.usage.in ?? 0),
        out: sum.out === null && run.usage.out === null ? null : (sum.out ?? 0) + (run.usage.out ?? 0),
        thoughts: sum.thoughts === null && run.usage.thoughts === null ? null : (sum.thoughts ?? 0) + (run.usage.thoughts ?? 0),
      }),
      { in: null, out: null, thoughts: null },
    );

    const elapsedMs = Date.now() - startedAt;

    // ── The server decides ──
    const slots = mode === 'outline' && isOutlineResponse(response)
      ? { claim: response.claim.trim().length > 0, tradeoff: response.tradeoff.trim().length > 0 }
      : isPlan && isPlanResponse(response)
        ? { claim: response.thesis.trim().length > 0, tradeoff: response.conclusion.trim().length > 0 || response.points.some((point) => point.limit.trim().length > 0) }
        : undefined;
    const reconciled = runs
      .map((run) => reconcileDiagnostic(run.output, { requiredLinks: drill.requiredLinks, anchors, answerText: renderedAnswer, slots }))
      .reduce((merged, next) => mergeReconciled(merged, next));
    if (reconciled.droppedContradictions > 0 || reconciled.demotedCovered > 0) {
      logger.info('checkSynthesisAttempt', 'reconciliation overrode the model', {
        drill_id: drillId,
        dropped_contradictions: reconciled.droppedContradictions,
        demoted_covered: reconciled.demotedCovered,
      });
    }
    const verdict = computeVerdict(reconciled, drill.requiredLinks);
    const band = isPlan && isPlanResponse(response)
      ? computeBand(reconciled, drill.requiredLinks, { conclusionPresent: response.conclusion.trim().length > 0 })
      : null;
    const { missingCardIds, contradictedCardIds } = deriveCardIdSets(reconciled.coverage, drill.requiredLinks, reconciled.contradictions);
    const now = new Date();
    const schedule = nextSchedule(drill.step, verdict, now, { confidence, kind: drill.kind, daysToExam: daysToExam(deck.exam_at, now) });
    const linksCovered = countCovered(reconciled.coverage);

    // ── One transaction: cards → attempt → drill (spec §8.4, plan §3.4) ──
    // record_synthesis_attempt pulls contradicted review cards forward (never
    // back), inserts the immutable attempt with what actually moved, and
    // advances the ladder in SQL. Under an advisory lock per drill, a
    // concurrent replay of the same client key returns the first attempt
    // instead of failing on the unique index after the model call was paid for.
    const pullCandidates = parsed.data.pull_forward && verdict === 'contradicted' ? contradictedCardIds : [];
    const notAfterIso = new Date(now.getTime() + PULL_FORWARD_HOURS * 60 * 60_000).toISOString();

    const { data: recorded, error: recordError } = await supabase.rpc('record_synthesis_attempt', {
      p_drill_id: drillId,
      p_deck_id: deckId,
      p_client_attempt_id: parsed.data.client_attempt_id ?? null,
      p_attempt: {
        mode,
        response,
        word_count: wordCount,
        duration_ms: parsed.data.duration_ms,
        verdict,
        coverage: reconciled.coverage.map((entry) => ({ link_id: entry.linkId, status: entry.status, evidence: entry.evidence })),
        contradictions: reconciled.contradictions.map((entry) => ({ statement: entry.statement, card_id: entry.cardId, card_says: entry.cardSays, kind: entry.kind })),
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
        integrity: { injection_detected: reconciled.integrity.injectionDetected, off_target: reconciled.integrity.offTarget },
        model: env.GEMINI_MODEL,
        usage: {
          in: usage.in,
          out: usage.out,
          thoughts: usage.thoughts,
          ms: elapsedMs,
          finish_reason: finishReason,
          samples,
          dropped_contradictions: reconciled.droppedContradictions,
          demoted_covered: reconciled.demotedCovered,
          prompt_version: SYNTHESIS_PROMPT_VERSION,
          prompt_variant: promptVariant,
          worked_example: parsed.data.worked_example,
        },
        confidence,
        revision_of: parsed.data.revision_of ?? null,
        band,
      },
      p_schedule: {
        step: schedule.step,
        next_due_at: schedule.nextDueAt.toISOString(),
        last_links_covered: linksCovered,
      },
      p_pull_forward_card_ids: pullCandidates,
      p_pull_forward_not_after: pullCandidates.length > 0 ? notAfterIso : null,
    });

    const record = recorded?.[0];
    if (recordError || !record) {
      logger.error('checkSynthesisAttempt', 'record_synthesis_attempt failed', { code: recordError?.code, message: recordError?.message });
      return { error: sanitizeDatabaseError(recordError, 'The check ran but could not be saved.') };
    }

    const pulledForwardCardIds = Array.isArray(record.pulled_forward_card_ids) ? record.pulled_forward_card_ids : [];
    if (record.replayed) {
      // A concurrent request with the same key got there first; this
      // request's model call is discarded in favour of the recorded one.
      logger.info('checkSynthesisAttempt', 'concurrent replay resolved by the database', { attempt_id: record.attempt_id });
    }
    const attempt = { id: record.attempt_id };

    // A verified contradiction earns a repair drill on the contradicted card
    // (plan D17): generated after the response, due a day after the
    // pull-forward review, one open repair per card.
    if (!record.replayed && drill.kind === 'drill' && verdict === 'contradicted' && contradictedCardIds.length > 0) {
      const repairCardId = contradictedCardIds[0];
      const excludeCardIds = drill.cardIds;
      const attemptId = attempt.id;
      after(async () => {
        try {
          await generateRepairDrill({ deckId, cardId: repairCardId, attemptId, excludeCardIds });
        } catch (repairError) {
          logger.warn('checkSynthesisAttempt', 'repair drill skipped', {
            message: repairError instanceof Error ? repairError.message : String(repairError),
          });
        }
      });
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
        prompt_tokens: usage.in,
        output_tokens: usage.out,
        thought_tokens: usage.thoughts,
        finish_reason: finishReason,
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
      linksCovered,
      linksTotal: drill.requiredLinks.length,
      schedule: { step: schedule.step, nextDueAt: schedule.nextDueAt.toISOString() },
      confidence,
      absorbedCardIds: {},
      band,
    };

    return {
      success: true as const,
      attemptId: attempt.id,
      diagnostic,
      reveal,
      exemplar: drill.exemplar,
      scheduleSaved: true,
      replayed: record.replayed,
    };
  });
}

async function setDrillStatus(data: ArchiveSynthesisDrillInput, status: 'active' | 'archived', failure: string) {
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
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.drill_id)
    .eq('deck_id', parsed.data.deck_id)
    .eq('user_id', user.id);

  if (error) {
    logger.error('setDrillStatus', 'update failed', { code: error.code, message: error.message, status });
    return { error: sanitizeDatabaseError(error, failure) };
  }

  revalidatePath(`/dashboard/${parsed.data.deck_id}`);
  return { success: true as const };
}

export async function archiveSynthesisDrill(data: ArchiveSynthesisDrillInput) {
  return guardAction('Drill archive', () => setDrillStatus(data, 'archived', 'Failed to archive the drill.'));
}

/** The undo behind the archive toast (audit U5). */
export async function restoreSynthesisDrill(data: ArchiveSynthesisDrillInput) {
  return guardAction('Drill restore', () => setDrillStatus(data, 'active', 'Failed to restore the drill.'));
}

/**
 * "Was this check fair?" (audit F5). One row per attempt, replaced on a
 * second answer; the attempts table itself stays append-only.
 */
export async function rateSynthesisAttempt(data: RateSynthesisAttemptInput) {
  return guardAction('Check feedback', async () => {
    const parsed = rateSynthesisAttemptSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }
    const { supabase, user } = deckAccess;

    const { data: attempt } = await supabase
      .from('synthesis_attempts')
      .select('id')
      .eq('id', parsed.data.attempt_id)
      .eq('deck_id', parsed.data.deck_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!attempt) {
      return { error: 'Attempt not found or access denied.' };
    }

    const { error } = await supabase
      .from('synthesis_attempt_feedback')
      .upsert(
        {
          attempt_id: parsed.data.attempt_id,
          user_id: user.id,
          rating: parsed.data.rating,
          note: parsed.data.note?.length ? parsed.data.note : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'attempt_id' },
      );

    if (error) {
      logger.error('rateSynthesisAttempt', 'upsert failed', { code: error.code, message: error.message });
      return { error: sanitizeDatabaseError(error, 'Failed to save your feedback.') };
    }

    return { success: true as const };
  });
}

/**
 * "+ Add as card" (improvement plan §3.3): an outside claim becomes a
 * first-class card in one round trip. Provenance is recorded on the card
 * (`source = 'synthesis_claim'`, the attempt and claim index), a repeat is
 * idempotent, and — after the response — the card is enriched and embedded
 * so it is quiz-ready and chat-visible before the student looks for it.
 */
export async function absorbOutsideClaim(data: AbsorbOutsideClaimInput) {
  return guardAction('Add as card', async () => {
    const parsed = absorbOutsideClaimSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }
    const { supabase, user } = deckAccess;
    const { deck_id: deckId, attempt_id: attemptId, claim_index: claimIndex } = parsed.data;

    const { data: attempt } = await supabase
      .from('synthesis_attempts')
      .select('id')
      .eq('id', attemptId)
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!attempt) {
      return { error: 'Attempt not found or access denied.' };
    }

    const { data: card, error } = await supabase
      .from('cards')
      .insert({
        deck_id: deckId,
        front: parsed.data.front,
        back: parsed.data.back,
        source: 'synthesis_claim',
        imported_by: 'synthesis',
        absorbed_from_attempt_id: attemptId,
        absorbed_claim_index: claimIndex,
      })
      .select('id')
      .single();

    if (error || !card) {
      if (error?.code === '23505') {
        // Already absorbed — a double-tap or a second tab. Return the existing card.
        const { data: existing } = await supabase
          .from('cards')
          .select('id')
          .eq('absorbed_from_attempt_id', attemptId)
          .eq('absorbed_claim_index', claimIndex)
          .maybeSingle();
        return { success: true as const, cardId: existing?.id ?? null, duplicate: true };
      }
      logger.error('absorbOutsideClaim', 'insert failed', { code: error?.code, message: error?.message });
      return { error: sanitizeDatabaseError(error, 'Failed to add the card.') };
    }

    await touchDeckUpdatedAt(supabase, deckId, user.id);
    revalidatePath(`/dashboard/${deckId}`);

    // The back half of the loop, off the response path. Both actions reserve
    // their own spend; a refused reservation leaves the card plain, which the
    // deck's enrich and sync controls pick up later.
    const cardId = card.id;
    after(async () => {
      try {
        await enrichCards({ deck_id: deckId, card_ids: [cardId] });
        await syncEmbeddings({ deck_id: deckId });
      } catch (loopError) {
        logger.warn('absorbOutsideClaim', 'post-absorb enrichment skipped', {
          cardId,
          message: loopError instanceof Error ? loopError.message : String(loopError),
        });
      }
    });

    return { success: true as const, cardId, duplicate: false };
  });
}

/* ── Plan questions (execution plan D15) ─────────────────────────── */

/** Bounded read for plan clusters and question mapping. */
const MAX_CARDS_FOR_PLANS = 400;
/** Similarity floor for mapping a pasted question to cards (plan D16). */
const QUESTION_MATCH_FLOOR = 0.45;
const QUESTION_MATCH_LIMIT = 8;

type PlanCardRow = ClusterCardRow & { explanation: string | null };

/**
 * A plan question and its marking key from 4–8 cards of one topic — or the
 * cards a pasted question was mapped to (`question_id`). One reservation
 * per question; generation may run on the stronger model (D2). The key is
 * validated like a drill's, with the wider floor of `validatePlanDraft`.
 */
export async function generatePlanQuestions(data: GeneratePlanQuestionsInput) {
  return guardAction('Plan generation', async () => {
    const parsed = generatePlanQuestionsSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }
    const { supabase, user } = deckAccess;
    const deckId = parsed.data.deck_id;

    const [{ data: cardRows, error: cardsError }, { count: activePlans, error: activeError }] = await Promise.all([
      supabase
        .from('cards')
        .select('id, front, back, explanation, topic_tags')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: true })
        .limit(MAX_CARDS_FOR_PLANS),
      supabase
        .from('synthesis_drills')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', deckId)
        .eq('user_id', user.id)
        .eq('kind', 'plan')
        .eq('status', 'active'),
    ]);
    if (cardsError) {
      return { error: sanitizeDatabaseError(cardsError, 'Failed to load cards for the plan.') };
    }
    if (activeError) {
      return { error: sanitizeDatabaseError(activeError, 'Failed to load existing plans.') };
    }

    const cards = ((cardRows ?? []) as PlanCardRow[]).map((row) => ({ ...toClusterCard(row), explanation: typeof row.explanation === 'string' ? row.explanation : null }));
    if (cards.length < MIN_PLAN_CLUSTER) {
      return { error: `A plan question needs at least ${MIN_PLAN_CLUSTER} cards; this deck has ${cards.length}.` };
    }
    if ((activePlans ?? 0) >= MAX_ACTIVE_DRILLS_PER_DECK) {
      return { error: `This deck already has ${MAX_ACTIVE_DRILLS_PER_DECK} active plan questions. Archive some first.` };
    }

    // The question, when one was pasted (D16), and the cards it was mapped to.
    let setQuestion: { id: string; text: string; cardIds: string[] } | null = null;
    if (parsed.data.question_id) {
      const { data: question } = await supabase
        .from('synthesis_questions')
        .select('id, text, mapped_card_ids')
        .eq('id', parsed.data.question_id)
        .eq('deck_id', deckId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!question) {
        return { error: 'Question not found or access denied.' };
      }
      setQuestion = { id: question.id, text: question.text, cardIds: question.mapped_card_ids ?? [] };
    }

    const count = setQuestion ? 1 : Math.min(parsed.data.count, MAX_ACTIVE_DRILLS_PER_DECK - (activePlans ?? 0));
    const reservation = await reserveAiCall(supabase, user.id, 'synthesis_generate', { deck_id: deckId, count, kind: 'plan' }, { calls: count });
    if (!reservation.ok) {
      return { error: reservation.error };
    }

    // ── Clusters: the mapped cards, else the widest topic, else the most-tagged cards ──
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const clusters: { cards: ClusterCard[]; topicTag: string | null }[] = [];
    if (setQuestion) {
      const mapped = setQuestion.cardIds.map((id) => cardsById.get(id)).filter((card): card is ClusterCard => Boolean(card));
      const filled = mapped.length >= MIN_PLAN_CLUSTER
        ? mapped
        : [...mapped, ...cards.filter((card) => !mapped.some((entry) => entry.id === card.id)).slice(0, MIN_PLAN_CLUSTER - mapped.length)];
      clusters.push({ cards: filled.slice(0, MAX_PLAN_CLUSTER), topicTag: null });
    } else {
      const used = new Set<string>();
      for (let index = 0; index < count; index += 1) {
        const remaining = cards.filter((card) => !used.has(card.id));
        const cluster = selectPlanCluster({ cards: remaining, focusTopic: index === 0 ? parsed.data.focus_topic : undefined })
          ?? (remaining.length >= MIN_PLAN_CLUSTER ? { cards: remaining.slice(0, MAX_PLAN_CLUSTER), topicTag: null } : null);
        if (!cluster) break;
        for (const card of cluster.cards) used.add(card.id);
        clusters.push(cluster);
      }
    }
    if (clusters.length === 0) {
      return { error: 'Not enough related cards for a plan question. Add cards or tag them by topic.' };
    }

    // ── One call per question ──
    const modelName = resolveModelName('generation');
    const model = getGeminiJsonModel({ temperature: GENERATION_TEMPERATURE, purpose: 'generation' });
    const settled = await Promise.allSettled(clusters.map((cluster, index) => withGeminiRetry(
      async () => {
        const result = await model.generateContent(
          {
            systemInstruction: buildPlanGenerationInstruction({ questionText: setQuestion?.text ?? null }),
            generationConfig: jsonGenerationConfig({
              responseSchema: PLAN_GENERATION_SCHEMA,
              temperature: GENERATION_TEMPERATURE,
              thinking: getServerEnv().GEMINI_GENERATION_THINKING,
              model: modelName,
            }),
            contents: [{ role: 'user', parts: [{ text: `CARDS\n${renderClusterCards(cluster.cards)}` }] }],
          },
          { timeout: GENERATION_TIMEOUT_MS },
        );
        assertComplete(result, `synthesis_plan_${index}`);
        return { draft: parseModelJson(result.response.text(), planGenerationOutputSchema), finishReason: finishReasonOf(result), usage: usageOf(result) };
      },
      { label: `synthesis_plan_${index}`, maxAttempts: 2 },
    )));

    let failed = 0;
    const rows: {
      deck_id: string;
      user_id: string;
      kind: 'plan';
      format: string;
      prompt_text: string;
      question_text: string;
      command_word: string | null;
      card_ids: string[];
      topic_tag: string | null;
      required_links: { id: string; text: string; card_ids: string[]; kind: string; core: boolean }[];
      link_count: number;
      exemplar: Json;
      bloom: string;
      generation_meta: Record<string, string | number | boolean | null>;
    }[] = [];
    const missingByRow: string[][] = [];

    settled.forEach((outcome, index) => {
      const cluster = clusters[index];
      if (outcome.status === 'rejected') {
        failed += 1;
        logger.warn('generatePlanQuestions', 'plan generation failed', { index, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) });
        return;
      }
      const validation = validatePlanDraft(outcome.value.draft, cluster.cards);
      if (!validation.ok) {
        failed += 1;
        logger.warn('generatePlanQuestions', 'plan rejected', { index, reason: validation.reason });
        return;
      }
      const { plan } = validation;
      rows.push({
        deck_id: deckId,
        user_id: user.id,
        kind: 'plan',
        // Plans reuse the format column; `kind` is the discriminator.
        format: 'evaluate',
        prompt_text: plan.questionText,
        question_text: plan.questionText,
        command_word: plan.commandWord,
        card_ids: plan.cardIds,
        topic_tag: cluster.topicTag,
        required_links: plan.requiredLinks.map((link) => ({ id: link.id, text: link.text, card_ids: link.cardIds, kind: link.kind, core: link.core })),
        link_count: plan.requiredLinks.length,
        exemplar: plan.planExemplar as unknown as Json,
        bloom: 'evaluate',
        generation_meta: {
          model: modelName,
          prompt_version: SYNTHESIS_PROMPT_VERSION,
          temperature: GENERATION_TEMPERATURE,
          clustering: setQuestion ? 'question' : cluster.topicTag ? 'tags' : 'random',
          question_id: setQuestion?.id ?? null,
          finish_reason: outcome.value.finishReason,
          tokens_in: outcome.value.usage.in,
          tokens_out: outcome.value.usage.out,
          tokens_thoughts: outcome.value.usage.thoughts,
        },
      });
      missingByRow.push(plan.missingConcepts);
    });

    let drillIds: string[] = [];
    if (rows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('synthesis_drills')
        .insert(rows)
        .select('id');
      if (insertError) {
        logger.error('generatePlanQuestions', 'insert failed', { code: insertError.code, message: insertError.message });
        return { error: sanitizeDatabaseError(insertError, 'The plan question was generated but failed to save.') };
      }
      drillIds = (inserted ?? []).map((row) => row.id);

      // A pasted question remembers the plan made from it and what the deck lacks.
      if (setQuestion && drillIds[0]) {
        const { error: linkError } = await supabase
          .from('synthesis_questions')
          .update({ drill_id: drillIds[0], missing_concepts: missingByRow[0] ?? [] })
          .eq('id', setQuestion.id)
          .eq('user_id', user.id);
        if (linkError) logger.warn('generatePlanQuestions', 'question link failed', { message: linkError.message });
      }
    }

    revalidatePath(`/dashboard/${deckId}`);
    await recordAiUsage(supabase, user.id, 'synthesis_generate', { deck_id: deckId, kind: 'plan', requested: count, created: rows.length, failed }, reservation.reservationId);

    if (rows.length === 0) {
      return { error: 'AI could not produce a valid plan question from these cards. Please try again.' };
    }
    return { success: true as const, created: rows.length, failed, drillIds, missingConcepts: missingByRow[0] ?? [] };
  });
}

/* ── Question bank (execution plan D16) ──────────────────────────── */

/**
 * Past-paper questions in, coverage out. Each question is embedded once and
 * mapped to the deck's nearest cards through the same vector RPC deck chat
 * uses; the concepts the deck lacks are named by the plan generator when a
 * plan is made from the question. Embedding spend is reserved as a
 * semantic search.
 */
export async function ingestQuestions(data: IngestQuestionsInput) {
  return guardAction('Question import', async () => {
    const parsed = ingestQuestionsSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }
    const { supabase, user } = deckAccess;
    const deckId = parsed.data.deck_id;
    const questions = [...new Set(parsed.data.questions.map((text) => text.replace(/\s+/g, ' ').trim()))];

    const reservation = await reserveAiCall(supabase, user.id, 'semantic_search', { deck_id: deckId, questions: questions.length }, { calls: 1 });
    if (!reservation.ok) {
      return { error: reservation.error };
    }

    let vectors: number[][] = [];
    try {
      vectors = await embedTexts(questions.map((text) => sanitizeAiInputText(text, 600)), { taskType: 'RETRIEVAL_QUERY' });
    } catch (embedError) {
      logger.warn('ingestQuestions', 'embedding failed; questions saved unmapped', { message: embedError instanceof Error ? embedError.message : String(embedError) });
    }

    const mapped = await mapWithConcurrency(questions.map((text, index) => ({ text, index })), 3, async ({ text, index }) => {
      const vector = vectors[index];
      if (!vector) return { text, cardIds: [] as string[] };
      const { data, error } = await supabase.rpc('search_deck_cards_by_embedding', {
        p_deck_id: deckId,
        p_query_embedding: toVectorLiteral(vector),
        p_limit: QUESTION_MATCH_LIMIT,
      });
      if (error) {
        logger.warn('ingestQuestions', 'card mapping failed', { message: error.message });
        return { text, cardIds: [] as string[] };
      }
      return { text, cardIds: (data ?? []).filter((row) => (row.similarity ?? 0) >= QUESTION_MATCH_FLOOR).map((row) => row.id) };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('synthesis_questions')
      .insert(mapped.map((entry) => ({ deck_id: deckId, user_id: user.id, text: entry.text, source: 'paper', mapped_card_ids: entry.cardIds })))
      .select('id, text, mapped_card_ids');
    if (insertError) {
      logger.error('ingestQuestions', 'insert failed', { code: insertError.code, message: insertError.message });
      return { error: sanitizeDatabaseError(insertError, 'Failed to save the questions.') };
    }

    revalidatePath(`/dashboard/${deckId}`);
    await recordAiUsage(supabase, user.id, 'semantic_search', { deck_id: deckId, questions: questions.length, mapped: mapped.filter((entry) => entry.cardIds.length > 0).length }, reservation.reservationId);

    return {
      success: true as const,
      questions: (inserted ?? []).map((row) => ({ id: row.id, text: row.text, mappedCards: row.mapped_card_ids?.length ?? 0 })),
      unmapped: vectors.length === 0,
    };
  });
}

export async function deleteQuestion(data: DeleteQuestionInput) {
  return guardAction('Question delete', async () => {
    const parsed = deleteQuestionSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }
    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }
    const { supabase, user } = deckAccess;
    const { error } = await supabase
      .from('synthesis_questions')
      .delete()
      .eq('id', parsed.data.question_id)
      .eq('deck_id', parsed.data.deck_id)
      .eq('user_id', user.id);
    if (error) {
      return { error: sanitizeDatabaseError(error, 'Failed to remove the question.') };
    }
    revalidatePath(`/dashboard/${parsed.data.deck_id}`);
    return { success: true as const };
  });
}

/* ── Exam date (execution plan D19) ──────────────────────────────── */

/**
 * The deck's exam date drives the drill ladder: tight inside three days,
 * the sprint cadence inside two weeks, stretched beyond. Null clears it.
 */
export async function setExamDate(data: SetExamDateInput) {
  return guardAction('Exam date', async () => {
    const parsed = setExamDateSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }
    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }
    const { supabase, user } = deckAccess;
    const { error } = await supabase
      .from('decks')
      .update({ exam_at: parsed.data.exam_at })
      .eq('id', parsed.data.deck_id)
      .eq('user_id', user.id);
    if (error) {
      return { error: sanitizeDatabaseError(error, 'Failed to save the exam date.') };
    }
    revalidatePath(`/dashboard/${parsed.data.deck_id}`);
    return { success: true as const, examAt: parsed.data.exam_at };
  });
}

/* ── Repair drills (execution plan D17) ──────────────────────────── */

/** The repair comes due a day after the pulled-forward card does. */
const REPAIR_DUE_HOURS = PULL_FORWARD_HOURS + 24;

/**
 * One drill anchored on a card the student contradicted and its nearest
 * neighbour, so the sequence is *review the card → re-argue the relation*.
 * `distinguish` when the neighbour is embedding-near (the two are
 * confusable), `elaborate` otherwise. Not exported: it runs after a check's
 * response, never from a client.
 */
async function generateRepairDrill(input: { deckId: string; cardId: string; attemptId: string; excludeCardIds: string[] }): Promise<void> {
  const deckAccess = await requireOwnedDeck(input.deckId);
  if ('error' in deckAccess) return;
  const { supabase, user } = deckAccess;

  const [{ count: activeCount }, { data: existing }, { data: cardRows }] = await Promise.all([
    supabase
      .from('synthesis_drills')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', input.deckId)
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('synthesis_drills')
      .select('id')
      .eq('deck_id', input.deckId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('generation_meta->>repair_for_card', input.cardId)
      .limit(1),
    supabase
      .from('cards')
      .select('id, front, back, explanation, topic_tags')
      .eq('deck_id', input.deckId)
      .limit(MAX_CARDS_FOR_CLUSTERING),
  ]);

  if ((activeCount ?? 0) >= MAX_ACTIVE_DRILLS_PER_DECK) return;
  if (Array.isArray(existing) && existing.length > 0) return;

  const cards = ((cardRows ?? []) as PlanCardRow[]).map((row) => ({ ...toClusterCard(row), explanation: typeof row.explanation === 'string' ? row.explanation : null }));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const anchor = cardsById.get(input.cardId);
  if (!anchor) return;

  // The partner: an embedding neighbour first (confusable → distinguish),
  // then a card sharing a tag, then another anchor of the drill that caught
  // the contradiction (elaborate).
  let partner: ClusterCard | null = null;
  let format: SynthesisFormat = 'elaborate';
  const { data: vectorRow } = await supabase.from('cards').select('embedding').eq('id', input.cardId).eq('deck_id', input.deckId).maybeSingle();
  if (vectorRow?.embedding) {
    const { data: neighbours } = await supabase.rpc('search_deck_cards_by_embedding', {
      p_deck_id: input.deckId,
      p_query_embedding: vectorRow.embedding,
      p_limit: 4,
    });
    const near = (neighbours ?? []).find((row) => row.id !== input.cardId && (row.similarity ?? 0) >= MIN_CONTEXT_SIMILARITY && cardsById.has(row.id));
    if (near) {
      partner = cardsById.get(near.id) ?? null;
      format = 'distinguish';
    }
  }
  if (!partner) {
    const tags = new Set(anchor.tags.map((tag) => tag.toLowerCase()));
    partner = cards.find((card) => card.id !== anchor.id && card.tags.some((tag) => tags.has(tag.toLowerCase()))) ?? null;
  }
  if (!partner) {
    partner = input.excludeCardIds
      .map((id) => cardsById.get(id))
      .find((card): card is ClusterCard => card !== undefined && card.id !== anchor.id) ?? null;
  }
  if (!partner) return;

  const reservation = await reserveAiCall(supabase, user.id, 'synthesis_generate', { deck_id: input.deckId, repair_of: input.attemptId }, { calls: 1 });
  if (!reservation.ok) return;

  const cluster: DrillCluster = { cards: [anchor, partner], topicTag: null, clustering: format === 'distinguish' ? 'embedding' : 'tags' };
  let outcome: Awaited<ReturnType<typeof generateDrillForCluster>>;
  try {
    outcome = await generateDrillForCluster(cluster, format, 0, Math.floor(Math.random() * 4));
  } catch (generationError) {
    // The reservation was spent; the failure is logged the way a batch logs a lost cluster.
    logger.warn('generateRepairDrill', 'generation failed', { message: generationError instanceof Error ? generationError.message : String(generationError) });
    await recordAiUsage(supabase, user.id, 'synthesis_generate', { deck_id: input.deckId, repair_of: input.attemptId, created: 0 }, reservation.reservationId);
    return;
  }
  const validation = validateDrillDraft(outcome.draft, cluster.cards);
  if (!validation.ok) {
    logger.warn('generateRepairDrill', 'draft rejected', { reason: validation.reason });
    await recordAiUsage(supabase, user.id, 'synthesis_generate', { deck_id: input.deckId, repair_of: input.attemptId, created: 0 }, reservation.reservationId);
    return;
  }

  const { drill } = validation;
  const dueAt = new Date(Date.now() + REPAIR_DUE_HOURS * 60 * 60_000).toISOString();
  const { error } = await supabase.from('synthesis_drills').insert({
    deck_id: input.deckId,
    user_id: user.id,
    format: drill.format,
    prompt_text: drill.promptText,
    prompt_variants: drill.promptVariants,
    scenario: drill.scenario,
    bloom: drill.bloom,
    card_ids: drill.cardIds,
    topic_tag: null,
    required_links: drill.requiredLinks.map((link) => ({ id: link.id, text: link.text, card_ids: link.cardIds, kind: link.kind, core: link.core })),
    link_count: drill.requiredLinks.length,
    exemplar: drill.exemplar,
    next_due_at: dueAt,
    generation_meta: {
      model: outcome.model,
      prompt_version: SYNTHESIS_PROMPT_VERSION,
      temperature: GENERATION_TEMPERATURE,
      clustering: cluster.clustering,
      requested_format: format,
      format_substituted: drill.format !== format,
      repair_of: input.attemptId,
      repair_for_card: input.cardId,
      finish_reason: outcome.finishReason,
      tokens_in: outcome.usage.in,
      tokens_out: outcome.usage.out,
      tokens_thoughts: outcome.usage.thoughts,
    },
  });
  if (error) {
    logger.error('generateRepairDrill', 'insert failed', { code: error.code, message: error.message });
  } else {
    logger.info('generateRepairDrill', 'repair drill created', { deck_id: input.deckId, card_id: input.cardId, format: drill.format });
    revalidatePath(`/dashboard/${input.deckId}`);
  }
  await recordAiUsage(supabase, user.id, 'synthesis_generate', { deck_id: input.deckId, repair_of: input.attemptId, created: error ? 0 : 1 }, reservation.reservationId);
}
