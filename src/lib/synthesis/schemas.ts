/**
 * Structured-output contracts for the two model calls (spec §6.2, §7.3).
 *
 * Each Gemini `responseSchema` has a Zod twin: the schema constrains what the
 * model emits, the Zod schema is what the server actually trusts. A Zod
 * failure is `malformed_output`, which withGeminiRetry retries once.
 *
 * `propertyOrdering` is a documented Gemini field missing from the SDK's
 * 0.24 types (see ai-enrich.ts); it is spread past the type check the same way.
 *
 * Lenient parse, strict store (audit R4): minimums catch empty output, but
 * a length overrun is clamped rather than failing a model call that
 * otherwise succeeded. The database CHECKs remain the last line.
 */

import { SchemaType, type Schema } from '@google/generative-ai';
import { z } from 'zod';

/** A non-empty string clamped to `max` characters instead of rejected past it. */
const clamped = (min: number, max: number) => z.string().trim().min(min).transform((value) => value.slice(0, max));

const FORMAT_VALUES = ['causal', 'counterfactual', 'comparative', 'evaluate', 'apply', 'distinguish', 'elaborate'] as const;
const LINK_KIND_VALUES = ['mechanism', 'condition', 'evidence'] as const;
const BLOOM_VALUES = ['analyse', 'evaluate', 'create'] as const;

/**
 * Key first, then the question (plan D3): the ordering is what the model
 * writes in, and a question written after its key is the one that needs it.
 */
export const drillGenerationOutputSchema = z.object({
  format: z.enum(FORMAT_VALUES),
  required_links: z.array(z.object({
    text: clamped(8, 200),
    card_keys: z.array(z.string().regex(/^c[1-3]$/)).min(1).max(3),
    kind: z.enum(LINK_KIND_VALUES).catch('mechanism'),
    core: z.boolean().catch(true),
  })).min(2).max(5),
  scenario: z.string().trim().transform((value) => value.slice(0, 600)).nullable().catch(null),
  // The one true maximum: the DB rejects a longer prompt and a clamp would
  // cut a question mid-sentence, so an overrun here is a retryable failure.
  prompt_text: z.string().trim().min(20).max(400),
  prompt_variants: z.array(z.string().trim().transform((value) => value.slice(0, 400))).max(3).catch([]),
  bloom: z.enum(BLOOM_VALUES).nullable().catch(null),
  exemplar: z.object({
    claim: clamped(8, 220),
    mechanisms: z.tuple([clamped(8, 220), clamped(8, 220)]),
    tradeoff: clamped(8, 220),
  }),
});
export type DrillGenerationOutput = z.infer<typeof drillGenerationOutputSchema>;

export const DRILL_GENERATION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  required: ['format', 'required_links', 'scenario', 'prompt_text', 'prompt_variants', 'bloom', 'exemplar'],
  ...({ propertyOrdering: ['format', 'required_links', 'scenario', 'prompt_text', 'prompt_variants', 'bloom', 'exemplar'] } as object),
  properties: {
    format: { type: SchemaType.STRING, format: 'enum', enum: [...FORMAT_VALUES] },
    required_links: {
      type: SchemaType.ARRAY,
      minItems: 2,
      maxItems: 4,
      items: {
        type: SchemaType.OBJECT,
        required: ['text', 'card_keys', 'kind', 'core'],
        ...({ propertyOrdering: ['text', 'card_keys', 'kind', 'core'] } as object),
        properties: {
          text: { type: SchemaType.STRING, description: 'A mechanism statement ("X → Y because Z"), at most 25 words.' },
          card_keys: { type: SchemaType.ARRAY, minItems: 1, maxItems: 3, items: { type: SchemaType.STRING } },
          kind: { type: SchemaType.STRING, format: 'enum', enum: [...LINK_KIND_VALUES], description: 'mechanism, or condition for a boundary / trade-off, or evidence for a named example the cards give.' },
          core: { type: SchemaType.BOOLEAN, description: 'true if the answer fails without this link.' },
        },
      },
    },
    scenario: { type: SchemaType.STRING, nullable: true, description: 'apply format only: the concrete case, at most 70 words. null otherwise.' },
    prompt_text: { type: SchemaType.STRING, description: 'One question, at most 60 words, naming each concept by its card term.' },
    prompt_variants: {
      type: SchemaType.ARRAY,
      minItems: 0,
      maxItems: 3,
      items: { type: SchemaType.STRING },
      description: 'Two rewordings of the same question with a different opening; same key, same answer.',
    },
    bloom: { type: SchemaType.STRING, format: 'enum', enum: [...BLOOM_VALUES], nullable: true },
    exemplar: {
      type: SchemaType.OBJECT,
      required: ['claim', 'mechanisms', 'tradeoff'],
      ...({ propertyOrdering: ['claim', 'mechanisms', 'tradeoff'] } as object),
      properties: {
        claim: { type: SchemaType.STRING },
        mechanisms: { type: SchemaType.ARRAY, minItems: 2, maxItems: 2, items: { type: SchemaType.STRING } },
        tradeoff: { type: SchemaType.STRING },
      },
    },
  },
};

export const drillCheckOutputSchema = z.object({
  coverage: z.array(z.object({
    link_id: z.string().regex(/^m[1-8]$/),
    status: z.enum(['covered', 'partial', 'missing']),
    evidence: z.string().nullable().transform((value) => (value === null ? null : value.slice(0, 200))),
  })).min(1).max(8),
  contradictions: z.array(z.object({
    statement: clamped(1, 240),
    card_key: z.string().regex(/^c[1-8]$/),
    card_says: clamped(1, 240),
    kind: z.enum(['reversal', 'overgeneralisation', 'conflation', 'wrong_condition', 'other']).catch('other'),
  })).max(3),
  outside_claims: z.array(z.object({
    statement: clamped(1, 240),
    verified: z.boolean(),
    ai_assessment: clamped(1, 300),
    term_suggestion: z.string().trim().transform((value) => value.slice(0, 60)),
  })).max(3),
  structure: z.object({ claim_present: z.boolean(), tradeoff_present: z.boolean() }),
  gap_note: clamped(1, 400),
  off_target: z.boolean(),
  injection_detected: z.boolean(),
});
export type DrillCheckOutput = z.infer<typeof drillCheckOutputSchema>;

export const DRILL_CHECK_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  required: ['coverage', 'contradictions', 'outside_claims', 'structure', 'gap_note', 'off_target', 'injection_detected'],
  // Coverage first: it is the part that matters most if the output is ever truncated.
  ...({ propertyOrdering: ['coverage', 'contradictions', 'outside_claims', 'structure', 'gap_note', 'off_target', 'injection_detected'] } as object),
  properties: {
    coverage: {
      type: SchemaType.ARRAY,
      minItems: 1,
      maxItems: 8,
      items: {
        type: SchemaType.OBJECT,
        required: ['link_id', 'status', 'evidence'],
        ...({ propertyOrdering: ['link_id', 'status', 'evidence'] } as object),
        properties: {
          link_id: { type: SchemaType.STRING },
          status: { type: SchemaType.STRING, format: 'enum', enum: ['covered', 'partial', 'missing'] },
          evidence: { type: SchemaType.STRING, nullable: true, description: 'Verbatim quote from the student, at most 20 words.' },
        },
      },
    },
    contradictions: {
      type: SchemaType.ARRAY,
      maxItems: 3,
      items: {
        type: SchemaType.OBJECT,
        required: ['statement', 'card_key', 'card_says', 'kind'],
        ...({ propertyOrdering: ['statement', 'card_key', 'card_says', 'kind'] } as object),
        properties: {
          statement: { type: SchemaType.STRING },
          card_key: { type: SchemaType.STRING },
          card_says: { type: SchemaType.STRING, description: 'The card\'s decisive words, verbatim.' },
          kind: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['reversal', 'overgeneralisation', 'conflation', 'wrong_condition', 'other'],
            description: 'reversal: the direction of an effect is backwards · overgeneralisation: a rule is applied outside its condition · conflation: two concepts are merged · wrong_condition: the condition is misstated · other.',
          },
        },
      },
    },
    outside_claims: {
      type: SchemaType.ARRAY,
      maxItems: 3,
      items: {
        type: SchemaType.OBJECT,
        required: ['statement', 'verified', 'ai_assessment', 'term_suggestion'],
        ...({ propertyOrdering: ['statement', 'verified', 'ai_assessment', 'term_suggestion'] } as object),
        properties: {
          statement: { type: SchemaType.STRING },
          verified: { type: SchemaType.BOOLEAN },
          ai_assessment: { type: SchemaType.STRING, description: '1-2 sentences, at most 40 words.' },
          term_suggestion: { type: SchemaType.STRING, description: '1-4 word flashcard term, or empty.' },
        },
      },
    },
    structure: {
      type: SchemaType.OBJECT,
      required: ['claim_present', 'tradeoff_present'],
      properties: {
        claim_present: { type: SchemaType.BOOLEAN },
        tradeoff_present: { type: SchemaType.BOOLEAN },
      },
    },
    gap_note: { type: SchemaType.STRING, description: 'One or two sentences, at most 50 words.' },
    off_target: { type: SchemaType.BOOLEAN },
    injection_detected: { type: SchemaType.BOOLEAN },
  },
};

/* ── Plan questions (plan D15) ────────────────────────────────────── */

const PLAN_LINK_KIND_VALUES = ['mechanism', 'condition', 'evidence', 'evaluation'] as const;

const planPointOutputSchema = z.object({
  claim: clamped(4, 220),
  mechanism: clamped(4, 300),
  evidence: z.string().trim().transform((value) => value.slice(0, 220)).catch(''),
  limit: z.string().trim().transform((value) => value.slice(0, 220)).catch(''),
});

export const planGenerationOutputSchema = z.object({
  command_word: z.string().trim().transform((value) => value.slice(0, 40)).catch(''),
  required_links: z.array(z.object({
    text: clamped(8, 200),
    card_keys: z.array(z.string().regex(/^c[1-8]$/)).min(1).max(4),
    kind: z.enum(PLAN_LINK_KIND_VALUES).catch('mechanism'),
    core: z.boolean().catch(true),
  })).min(3).max(8),
  question_text: z.string().trim().min(20).max(600),
  missing_concepts: z.array(z.string().trim().transform((value) => value.slice(0, 80))).max(6).catch([]),
  exemplar_plan: z.object({
    thesis: clamped(8, 300),
    points: z.tuple([planPointOutputSchema, planPointOutputSchema, planPointOutputSchema]),
    conclusion: clamped(8, 300),
  }),
});
export type PlanGenerationOutput = z.infer<typeof planGenerationOutputSchema>;

const PLAN_POINT_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  required: ['claim', 'mechanism', 'evidence', 'limit'],
  ...({ propertyOrdering: ['claim', 'mechanism', 'evidence', 'limit'] } as object),
  properties: {
    claim: { type: SchemaType.STRING, description: 'The point, at most 25 words.' },
    mechanism: { type: SchemaType.STRING, description: 'Why it holds, at most 35 words.' },
    evidence: { type: SchemaType.STRING, description: 'A named example, case, study or datum from the cards; empty if the cards give none.' },
    limit: { type: SchemaType.STRING, description: 'The condition or counter-case that bounds the point; empty if none.' },
  },
};

export const PLAN_GENERATION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  required: ['command_word', 'required_links', 'question_text', 'missing_concepts', 'exemplar_plan'],
  ...({ propertyOrdering: ['command_word', 'required_links', 'question_text', 'missing_concepts', 'exemplar_plan'] } as object),
  properties: {
    command_word: { type: SchemaType.STRING, description: 'The question\'s command: "to what extent", "discuss", "evaluate", "compare", "explain why", "assess".' },
    required_links: {
      type: SchemaType.ARRAY,
      minItems: 3,
      maxItems: 8,
      items: {
        type: SchemaType.OBJECT,
        required: ['text', 'card_keys', 'kind', 'core'],
        ...({ propertyOrdering: ['text', 'card_keys', 'kind', 'core'] } as object),
        properties: {
          text: { type: SchemaType.STRING, description: 'A point a complete plan must make, at most 25 words.' },
          card_keys: { type: SchemaType.ARRAY, minItems: 1, maxItems: 4, items: { type: SchemaType.STRING } },
          kind: { type: SchemaType.STRING, format: 'enum', enum: [...PLAN_LINK_KIND_VALUES] },
          core: { type: SchemaType.BOOLEAN },
        },
      },
    },
    question_text: { type: SchemaType.STRING, description: 'The exam question, at most 60 words, opening with the command word.' },
    missing_concepts: {
      type: SchemaType.ARRAY,
      minItems: 0,
      maxItems: 6,
      items: { type: SchemaType.STRING },
      description: 'Concepts a full answer needs that none of the cards cover. Empty if the cards suffice.',
    },
    exemplar_plan: {
      type: SchemaType.OBJECT,
      required: ['thesis', 'points', 'conclusion'],
      ...({ propertyOrdering: ['thesis', 'points', 'conclusion'] } as object),
      properties: {
        thesis: { type: SchemaType.STRING },
        points: { type: SchemaType.ARRAY, minItems: 3, maxItems: 3, items: PLAN_POINT_SCHEMA },
        conclusion: { type: SchemaType.STRING },
      },
    },
  },
};
