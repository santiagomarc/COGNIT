import 'server-only';

import { z } from 'zod';
import type { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import {
  aggregateWeakLinks,
  calibrationRate,
  deckReadings,
  outsideClaimsSince,
  type AttemptForInsights,
} from '@/lib/synthesis/insights';
import { orderQueue } from '@/lib/synthesis/schedule';
import { cardKey } from '@/lib/synthesis/prompts';
import {
  isConfidence,
  isDrillVerdict,
  isSynthesisFormat,
  type AnchorCard,
  type CanvasDrill,
  type CapstoneDrillCandidate,
  type Diagnostic,
  type DrillHistoryRow,
  type LastAttemptSummary,
  type LinkCoverage,
  type Step,
  type SynthesisDrill,
  type SynthesisReadings,
  type WeakLinkRow,
} from '@/lib/synthesis/types';

/**
 * Server-side readers for the drill canvas, the launcher, the Insights
 * panels, the study capstone and the dashboard reading (spec §9.3). Not
 * Server Actions: they take the caller's Supabase client and never become
 * POST endpoints. Every read is bounded.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Bounded reads: a deck holds ≤ 40 active drills; attempts are capped per read. */
const MAX_DRILLS_READ = 60;
const MAX_ATTEMPTS_READ = 300;
const HISTORY_ROWS = 20;
/** Cross-deck due read for the dashboard: 25 decks at the per-deck cap. */
const MAX_DUE_DRILLS_READ = 1000;

const requiredLinksSchema = z.array(z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  card_ids: z.array(z.string()).min(1),
})).min(2).max(4);

const exemplarSchema = z.object({
  claim: z.string(),
  mechanisms: z.tuple([z.string(), z.string()]),
  tradeoff: z.string(),
});

const coverageSchema = z.array(z.object({
  link_id: z.string(),
  status: z.enum(['covered', 'partial', 'missing']),
  evidence: z.string().nullable(),
}));

export type DrillRow = {
  id: string;
  deck_id: string;
  format: string;
  prompt_text: string;
  card_ids: string[];
  topic_tag: string | null;
  required_links: Json;
  exemplar: Json;
  status: string;
  step: number;
  next_due_at: string;
  attempt_count: number;
  last_verdict: string | null;
  last_attempt_at: string | null;
};

export const DRILL_COLUMNS =
  'id, deck_id, format, prompt_text, card_ids, topic_tag, required_links, exemplar, status, step, next_due_at, attempt_count, last_verdict, last_attempt_at';

/** A row whose JSON no longer parses is skipped, never thrown. */
export function rowToDrill(row: DrillRow): SynthesisDrill | null {
  const links = requiredLinksSchema.safeParse(row.required_links);
  const exemplar = exemplarSchema.safeParse(row.exemplar);
  if (!links.success || !exemplar.success || !isSynthesisFormat(row.format)) {
    logger.warn('synthesis', 'skipping malformed drill row', { drill_id: row.id });
    return null;
  }

  return {
    id: row.id,
    deckId: row.deck_id,
    format: row.format,
    promptText: row.prompt_text,
    cardIds: row.card_ids,
    topicTag: row.topic_tag,
    requiredLinks: links.data.map((link) => ({ id: link.id, text: link.text, cardIds: link.card_ids })),
    exemplar: exemplar.data,
    status: row.status === 'archived' ? 'archived' : 'active',
    step: Math.max(0, Math.min(2, row.step)) as Step,
    nextDueAt: row.next_due_at,
    attemptCount: row.attempt_count,
    lastVerdict: isDrillVerdict(row.last_verdict) ? row.last_verdict : null,
    lastAttemptAt: row.last_attempt_at,
  };
}

/** The drill without its answer key — what the canvas is allowed to hold before the check (audit P3). */
export function toCanvasDrill(drill: SynthesisDrill): CanvasDrill {
  return {
    id: drill.id,
    deckId: drill.deckId,
    format: drill.format,
    promptText: drill.promptText,
    cardIds: drill.cardIds,
    topicTag: drill.topicTag,
    status: drill.status,
    step: drill.step,
    nextDueAt: drill.nextDueAt,
    attemptCount: drill.attemptCount,
    lastVerdict: drill.lastVerdict,
    lastAttemptAt: drill.lastAttemptAt,
    linkCount: drill.requiredLinks.length,
  };
}

export function parseCoverage(value: Json): LinkCoverage[] {
  const parsed = coverageSchema.safeParse(value);
  return parsed.success
    ? parsed.data.map((entry) => ({ linkId: entry.link_id, status: entry.status, evidence: entry.evidence }))
    : [];
}

const storedContradictionsSchema = z.array(z.object({ statement: z.string(), card_id: z.string(), card_says: z.string() }));
const storedOutsideClaimsSchema = z.array(z.object({
  statement: z.string(),
  verified: z.boolean(),
  ai_assessment: z.string(),
  term_suggestion: z.string().default(''),
}));
const storedStructureSchema = z.object({ claim_present: z.boolean().default(false), tradeoff_present: z.boolean().default(false) });
const storedIntegritySchema = z.object({ injection_detected: z.boolean().default(false), off_target: z.boolean().default(false) });

export type StoredAttemptRow = {
  verdict: string;
  coverage: Json;
  contradictions: Json;
  outside_claims: Json;
  structure: Json;
  gap_note: string;
  integrity: Json;
  pulled_forward_card_ids: string[];
  confidence: number | null;
};

/**
 * An attempt row back into the diagnostic the canvas renders — the replay
 * path of `checkSynthesisAttempt` (audit R8). Null if the row's JSON no
 * longer parses; the caller then runs a fresh check.
 */
export function parseStoredAttempt(
  row: StoredAttemptRow,
): Pick<Diagnostic, 'verdict' | 'coverage' | 'contradictions' | 'outsideClaims' | 'structure' | 'gapNote' | 'integrity' | 'pulledForwardCardIds' | 'confidence'> | null {
  if (!isDrillVerdict(row.verdict)) return null;
  const contradictions = storedContradictionsSchema.safeParse(row.contradictions);
  const outsideClaims = storedOutsideClaimsSchema.safeParse(row.outside_claims);
  const structure = storedStructureSchema.safeParse(row.structure ?? {});
  const integrity = storedIntegritySchema.safeParse(row.integrity ?? {});
  if (!contradictions.success || !outsideClaims.success || !structure.success || !integrity.success) return null;

  return {
    verdict: row.verdict,
    coverage: parseCoverage(row.coverage),
    contradictions: contradictions.data.map((entry) => ({ statement: entry.statement, cardId: entry.card_id, cardSays: entry.card_says })),
    outsideClaims: outsideClaims.data.map((entry) => ({
      statement: entry.statement,
      verified: entry.verified,
      aiAssessment: entry.ai_assessment,
      termSuggestion: entry.term_suggestion,
    })),
    structure: { claimPresent: structure.data.claim_present, tradeoffPresent: structure.data.tradeoff_present },
    gapNote: row.gap_note,
    integrity: { injectionDetected: integrity.data.injection_detected, offTarget: integrity.data.off_target },
    pulledForwardCardIds: row.pulled_forward_card_ids ?? [],
    confidence: isConfidence(row.confidence) ? row.confidence : null,
  };
}

type AnchorRow = { id: string; front: string; back: string; explanation: string | null; state: string | null };

/** `front` is the term and `back` the definition in this schema (design system §7.6). */
export function toAnchorCards(drill: SynthesisDrill, rows: AnchorRow[]): AnchorCard[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return drill.cardIds.flatMap((id, index) => {
    const row = byId.get(id);
    if (!row) return [];
    return [{
      id: row.id,
      key: cardKey(index),
      term: row.front,
      definition: row.back,
      explanation: row.explanation,
      state: row.state ?? 'new',
    }];
  });
}

async function loadAnchorRows(supabase: SupabaseServerClient, deckId: string, cardIds: string[]): Promise<AnchorRow[]> {
  if (cardIds.length === 0) return [];
  const { data, error } = await supabase
    .from('cards')
    .select('id, front, back, explanation, state')
    .eq('deck_id', deckId)
    .in('id', cardIds.slice(0, 200));
  if (error) {
    logger.error('synthesis', 'anchor read failed', { message: error.message });
    return [];
  }
  return (data ?? []) as AnchorRow[];
}

export type SynthesisQueue = {
  drills: SynthesisDrill[];
  anchorsByDrill: Record<string, AnchorCard[]>;
  lastAttemptByDrill: Record<string, LastAttemptSummary>;
  activeDrillCount: number;
};

/**
 * Due first, a lapse-affected anchor next, everything else after — and never
 * a lock: `count` is filled while active drills remain (spec §8.2).
 */
export async function loadSynthesisQueue(
  supabase: SupabaseServerClient,
  input: { deckId: string; userId: string; count: number; drillId?: string | null; now?: Date },
): Promise<SynthesisQueue> {
  const now = input.now ?? new Date();
  const { data: rows, error } = await supabase
    .from('synthesis_drills')
    .select(DRILL_COLUMNS)
    .eq('deck_id', input.deckId)
    .eq('user_id', input.userId)
    .eq('status', 'active')
    .order('next_due_at', { ascending: true })
    .limit(MAX_DRILLS_READ);

  if (error) {
    logger.error('synthesis', 'drill read failed', { message: error.message });
    return { drills: [], anchorsByDrill: {}, lastAttemptByDrill: {}, activeDrillCount: 0 };
  }

  const drills = (rows ?? []).map((row) => rowToDrill(row as DrillRow)).filter((drill): drill is SynthesisDrill => drill !== null);
  const anchorRows = await loadAnchorRows(supabase, input.deckId, [...new Set(drills.flatMap((drill) => drill.cardIds))]);

  const anchorsByDrill: Record<string, AnchorCard[]> = {};
  const candidates = drills.flatMap((drill) => {
    const anchors = toAnchorCards(drill, anchorRows);
    if (anchors.length < 2) return [];   // its cards were deleted
    anchorsByDrill[drill.id] = anchors;
    return [{ drill, anchorStates: anchors.map((anchor) => anchor.state) }];
  });

  const ordered = orderQueue({ candidates, count: input.count, now, pinnedDrillId: input.drillId ?? null });

  const lastAttemptByDrill: Record<string, LastAttemptSummary> = {};
  if (ordered.length > 0) {
    const { data: attempts, error: attemptsError } = await supabase
      .from('synthesis_attempts')
      .select('id, drill_id, verdict, gap_note, coverage, created_at')
      .eq('user_id', input.userId)
      .in('drill_id', ordered.map((drill) => drill.id))
      .order('created_at', { ascending: false })
      .limit(ordered.length * 4);

    if (attemptsError) {
      logger.warn('synthesis', 'last-attempt read failed', { message: attemptsError.message });
    }

    const drillById = new Map(ordered.map((drill) => [drill.id, drill]));
    for (const attempt of attempts ?? []) {
      if (lastAttemptByDrill[attempt.drill_id] || !isDrillVerdict(attempt.verdict)) continue;
      const coverage = parseCoverage(attempt.coverage);
      lastAttemptByDrill[attempt.drill_id] = {
        attemptId: attempt.id,
        verdict: attempt.verdict,
        gapNote: attempt.gap_note,
        linksCovered: coverage.filter((entry) => entry.status === 'covered').length,
        linksTotal: drillById.get(attempt.drill_id)?.requiredLinks.length ?? coverage.length,
        createdAt: attempt.created_at,
      };
    }
  }

  return {
    drills: ordered,
    anchorsByDrill: Object.fromEntries(ordered.map((drill) => [drill.id, anchorsByDrill[drill.id]])),
    lastAttemptByDrill,
    activeDrillCount: candidates.length,
  };
}

type AttemptRow = {
  id: string;
  drill_id: string;
  verdict: string;
  coverage: Json;
  missing_card_ids: string[];
  contradicted_card_ids: string[];
  outside_claims: Json;
  duration_ms: number;
  confidence: number | null;
  created_at: string;
};

async function loadAttemptRows(supabase: SupabaseServerClient, deckId: string, userId: string): Promise<AttemptRow[]> {
  const { data, error } = await supabase
    .from('synthesis_attempts')
    .select('id, drill_id, verdict, coverage, missing_card_ids, contradicted_card_ids, outside_claims, duration_ms, confidence, created_at')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_ATTEMPTS_READ);
  if (error) {
    logger.error('synthesis', 'attempt read failed', { message: error.message });
    return [];
  }
  return (data ?? []) as AttemptRow[];
}

function toInsightAttempt(row: AttemptRow): AttemptForInsights {
  return {
    drillId: row.drill_id,
    createdAt: row.created_at,
    coverage: parseCoverage(row.coverage),
    missingCardIds: row.missing_card_ids ?? [],
    contradictedCardIds: row.contradicted_card_ids ?? [],
    outsideClaimCount: Array.isArray(row.outside_claims) ? row.outside_claims.length : 0,
  };
}

async function loadDeckDrills(supabase: SupabaseServerClient, deckId: string, userId: string): Promise<SynthesisDrill[]> {
  const { data, error } = await supabase
    .from('synthesis_drills')
    .select(DRILL_COLUMNS)
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_DRILLS_READ * 2);
  if (error) {
    logger.error('synthesis', 'drill read failed', { message: error.message });
    return [];
  }
  return (data ?? []).map((row) => rowToDrill(row as DrillRow)).filter((drill): drill is SynthesisDrill => drill !== null);
}

/**
 * The launcher block's strip: DUE · LINKS a/b · LAST. One narrow read of the
 * active drill rows — the counts are denormalised there at check time
 * (audit P1), so the deck overview never touches the attempts table.
 */
export async function loadSynthesisReadings(
  supabase: SupabaseServerClient,
  input: { deckId: string; userId: string; now?: Date },
): Promise<SynthesisReadings> {
  const { data, error } = await supabase
    .from('synthesis_drills')
    .select('next_due_at, link_count, last_links_covered, last_attempt_at')
    .eq('deck_id', input.deckId)
    .eq('user_id', input.userId)
    .eq('status', 'active')
    .limit(MAX_DRILLS_READ);

  if (error) {
    logger.error('synthesis', 'readings read failed', { message: error.message });
    return { activeDrills: 0, due: 0, linksCovered: 0, linksTotal: 0, lastAttemptAt: null };
  }

  return deckReadings({
    rows: (data ?? []).map((row) => ({
      status: 'active' as const,
      nextDueAt: row.next_due_at,
      linkCount: row.link_count,
      lastLinksCovered: row.last_links_covered,
      lastAttemptAt: row.last_attempt_at,
    })),
    now: input.now ?? new Date(),
  });
}

export type SynthesisInsights = {
  weakLinks: WeakLinkRow[];
  history: DrillHistoryRow[];
  outsideClaims30d: number;
  attemptCount: number;
  /** Share of confidence-rated attempts in the last 30 days whose confidence matched the verdict; null when none. */
  calibration30d: number | null;
};

export async function loadSynthesisInsights(
  supabase: SupabaseServerClient,
  input: { deckId: string; userId: string; now?: Date },
): Promise<SynthesisInsights> {
  const now = input.now ?? new Date();
  const [drills, attemptRows] = await Promise.all([
    loadDeckDrills(supabase, input.deckId, input.userId),
    loadAttemptRows(supabase, input.deckId, input.userId),
  ]);
  const attempts = attemptRows.map(toInsightAttempt);
  const drillById = new Map(drills.map((drill) => [drill.id, drill]));

  const weakCardIds = [...new Set(attempts.flatMap((attempt) => [...attempt.missingCardIds, ...attempt.contradictedCardIds]))].slice(0, 100);
  const termById = new Map<string, string>();
  if (weakCardIds.length > 0) {
    const { data: cards } = await supabase
      .from('cards')
      .select('id, front')
      .eq('deck_id', input.deckId)
      .in('id', weakCardIds);
    for (const card of cards ?? []) termById.set(card.id, card.front);
  }

  const history: DrillHistoryRow[] = attemptRows.slice(0, HISTORY_ROWS).flatMap((row) => {
    const drill = drillById.get(row.drill_id);
    if (!drill || !isDrillVerdict(row.verdict)) return [];
    const coverage = parseCoverage(row.coverage);
    return [{
      attemptId: row.id,
      drillId: row.drill_id,
      promptText: drill.promptText,
      format: drill.format,
      verdict: row.verdict,
      linksCovered: coverage.filter((entry) => entry.status === 'covered').length,
      linksTotal: drill.requiredLinks.length,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    }];
  });

  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const sinceIso = since30d.toISOString();

  return {
    weakLinks: aggregateWeakLinks(attempts, termById),
    history,
    outsideClaims30d: outsideClaimsSince(attempts, since30d),
    attemptCount: attempts.length,
    calibration30d: calibrationRate(attemptRows.flatMap((row) => {
      if (row.created_at < sinceIso || !isDrillVerdict(row.verdict)) return [];
      return [{ confidence: isConfidence(row.confidence) ? row.confidence : null, verdict: row.verdict }];
    })),
  };
}

/**
 * The active drills of one deck, as the study completion screen needs them
 * to offer a capstone (spec §8.3): no links, no exemplar. The choice itself
 * is `pickCapstoneDrill`, run on the client against the session's grades.
 */
export async function loadCapstoneCandidates(
  supabase: SupabaseServerClient,
  input: { deckId: string; userId: string },
): Promise<CapstoneDrillCandidate[]> {
  const { data, error } = await supabase
    .from('synthesis_drills')
    .select('id, prompt_text, card_ids, next_due_at, attempt_count')
    .eq('deck_id', input.deckId)
    .eq('user_id', input.userId)
    .eq('status', 'active')
    .order('next_due_at', { ascending: true })
    .limit(MAX_DRILLS_READ);

  if (error) {
    logger.error('synthesis', 'capstone read failed', { message: error.message });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    if (!Array.isArray(row.card_ids) || row.card_ids.length < 2) return [];
    return [{
      id: row.id,
      promptText: row.prompt_text,
      cardIds: row.card_ids,
      status: 'active' as const,
      nextDueAt: row.next_due_at,
      attemptCount: row.attempt_count,
    }];
  });
}

export type DueDrillsByDeck = {
  /** Decks with at least one drill due, most due first. */
  decks: { deckId: string; dueCount: number }[];
  total: number;
  /** The read hit its row cap; `total` is a floor. */
  truncated: boolean;
};

/**
 * Drills due now across every deck, for the dashboard band's `drills due`
 * reading (spec §4.1). One bounded read of `deck_id` grouped here — the
 * per-deck total is at most 40 and there is no RPC to add for it.
 */
export async function loadDueDrillsByDeck(
  supabase: SupabaseServerClient,
  input: { userId: string; now?: Date },
): Promise<DueDrillsByDeck> {
  const now = input.now ?? new Date();
  const { data, error } = await supabase
    .from('synthesis_drills')
    .select('deck_id')
    .eq('user_id', input.userId)
    .eq('status', 'active')
    .lte('next_due_at', now.toISOString())
    .limit(MAX_DUE_DRILLS_READ);

  if (error) {
    logger.error('synthesis', 'due drills read failed', { message: error.message });
    return { decks: [], total: 0, truncated: false };
  }

  const rows = data ?? [];
  const byDeck = new Map<string, number>();
  for (const row of rows) byDeck.set(row.deck_id, (byDeck.get(row.deck_id) ?? 0) + 1);

  return {
    decks: [...byDeck.entries()]
      .map(([deckId, dueCount]) => ({ deckId, dueCount }))
      .sort((a, b) => b.dueCount - a.dueCount || a.deckId.localeCompare(b.deckId)),
    total: rows.length,
    truncated: rows.length >= MAX_DUE_DRILLS_READ,
  };
}

/**
 * Which outside claims of these attempts have already become cards, as
 * `attemptId → (claimIndex → cardId)`. Read from the card's provenance
 * columns (improvement plan §3.3): the attempt row is immutable, the card
 * carries the link. Bounded by the attempts asked about; a canvas asks for
 * one, Insights for at most MAX_ATTEMPTS_READ.
 */
export async function loadAbsorbedClaims(
  supabase: SupabaseServerClient,
  input: { attemptIds: string[] },
): Promise<Map<string, Map<number, string>>> {
  const out = new Map<string, Map<number, string>>();
  const attemptIds = [...new Set(input.attemptIds)].slice(0, MAX_ATTEMPTS_READ);
  if (attemptIds.length === 0) return out;

  const { data, error } = await supabase
    .from('cards')
    .select('id, absorbed_from_attempt_id, absorbed_claim_index')
    .in('absorbed_from_attempt_id', attemptIds);

  if (error) {
    logger.warn('synthesis', 'absorbed claims read failed', { message: error.message });
    return out;
  }

  for (const row of data ?? []) {
    if (!row.absorbed_from_attempt_id || row.absorbed_claim_index === null) continue;
    const byIndex = out.get(row.absorbed_from_attempt_id) ?? new Map<number, string>();
    byIndex.set(row.absorbed_claim_index, row.id);
    out.set(row.absorbed_from_attempt_id, byIndex);
  }
  return out;
}
