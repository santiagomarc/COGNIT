/**
 * Structured-output contracts for the two model calls (spec §6.2, §7.3).
 *
 * Each Gemini `responseSchema` has a Zod twin: the schema constrains what the
 * model emits, the Zod schema is what the server actually trusts. A Zod
 * failure is `malformed_output`, which withGeminiRetry retries once.
 *
 * `propertyOrdering` is a documented Gemini field missing from the SDK's
 * 0.24 types (see ai-enrich.ts); it is spread past the type check the same way.
 */

import { SchemaType, type Schema } from '@google/generative-ai';
import { z } from 'zod';

export const drillGenerationOutputSchema = z.object({
  format: z.enum(['causal', 'counterfactual', 'comparative']),
  prompt_text: z.string().trim().min(20).max(400),
  required_links: z.array(z.object({
    text: z.string().trim().min(8).max(200),
    card_keys: z.array(z.string().regex(/^c[1-3]$/)).min(1).max(3),
  })).min(2).max(4),
  exemplar: z.object({
    claim: z.string().trim().min(8).max(220),
    mechanisms: z.tuple([z.string().trim().min(8).max(220), z.string().trim().min(8).max(220)]),
    tradeoff: z.string().trim().min(8).max(220),
  }),
});
export type DrillGenerationOutput = z.infer<typeof drillGenerationOutputSchema>;

export const DRILL_GENERATION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  required: ['format', 'prompt_text', 'required_links', 'exemplar'],
  ...({ propertyOrdering: ['format', 'prompt_text', 'required_links', 'exemplar'] } as object),
  properties: {
    format: { type: SchemaType.STRING, format: 'enum', enum: ['causal', 'counterfactual', 'comparative'] },
    prompt_text: { type: SchemaType.STRING, description: 'One question, at most 60 words, naming each concept by its card term.' },
    required_links: {
      type: SchemaType.ARRAY,
      minItems: 2,
      maxItems: 4,
      items: {
        type: SchemaType.OBJECT,
        required: ['text', 'card_keys'],
        ...({ propertyOrdering: ['text', 'card_keys'] } as object),
        properties: {
          text: { type: SchemaType.STRING, description: 'A mechanism statement, at most 25 words.' },
          card_keys: { type: SchemaType.ARRAY, minItems: 1, maxItems: 3, items: { type: SchemaType.STRING } },
        },
      },
    },
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
    link_id: z.string().regex(/^m[1-4]$/),
    status: z.enum(['covered', 'partial', 'missing']),
    evidence: z.string().max(200).nullable(),
  })).min(1).max(4),
  contradictions: z.array(z.object({
    statement: z.string().min(1).max(240),
    card_key: z.string().regex(/^c[1-3]$/),
    card_says: z.string().min(1).max(240),
  })).max(3),
  outside_claims: z.array(z.object({
    statement: z.string().min(1).max(240),
    verified: z.boolean(),
    ai_assessment: z.string().min(1).max(300),
    term_suggestion: z.string().max(60),
  })).max(3),
  structure: z.object({ claim_present: z.boolean(), tradeoff_present: z.boolean() }),
  gap_note: z.string().min(1).max(400),
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
      maxItems: 4,
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
        required: ['statement', 'card_key', 'card_says'],
        ...({ propertyOrdering: ['statement', 'card_key', 'card_says'] } as object),
        properties: {
          statement: { type: SchemaType.STRING },
          card_key: { type: SchemaType.STRING },
          card_says: { type: SchemaType.STRING, description: 'The card\'s decisive words, verbatim.' },
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
