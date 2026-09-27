import 'server-only';
import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Schema,
} from '@google/genai';
import { getServerEnv } from '@/lib/env-server';

/*
 * The single seam between Cognit and the Gemini SDK (plan §6.1). Call sites
 * import from here, never from '@google/genai' directly (types excepted), so
 * the next SDK change is one file.
 *
 * The SDK's own retry stays off (no `httpOptions.retryOptions`): every call
 * is wrapped in withGeminiRetry, and two retry layers would multiply.
 */

export type { Content, GenerateContentResponse, Schema };
export { FinishReason, Type } from '@google/genai';

export type ModelFamily = '2.5' | '3';
export type ModelPurpose = 'check' | 'generation';
export type ThinkingEffort = 'none' | 'low' | 'high';
export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

let cached: { apiKey: string; client: GoogleGenAI } | null = null;

function ai(): GoogleGenAI {
  // getServerEnv throws with a precise message when GEMINI_API_KEY is absent or
  // malformed, so every AI entry point fails the same way instead of each
  // inventing its own check.
  const apiKey = getServerEnv().GEMINI_API_KEY;
  if (cached?.apiKey !== apiKey) cached = { apiKey, client: new GoogleGenAI({ apiKey }) };
  return cached.client;
}

/**
 * The generation-config dialect a model speaks (execution plan D1). Gemini
 * 3.x replaced `thinkingBudget` with `thinkingLevel` and rejects the budget
 * with a 400 (measured on gemini-3.5-flash-lite, Audit II §2); it also asks
 * for temperature 1.0. Everything before it takes a budget and a temperature.
 */
export function modelFamily(model: string, override?: ModelFamily): ModelFamily {
  if (override) return override;
  return /gemini-3/i.test(model) ? '3' : '2.5';
}

/** The model a purpose runs on: generation may be routed to a stronger model (plan D2). */
export function resolveModelName(purpose: ModelPurpose = 'check'): string {
  const env = getServerEnv();
  return purpose === 'generation' ? (env.GEMINI_MODEL_GENERATION ?? env.GEMINI_MODEL) : env.GEMINI_MODEL;
}

/**
 * The config for a structured (JSON) call.
 *
 * Thinking is off by default: extraction, enrichment and classification gain
 * nothing from thinking tokens, which are billed and drawn from the same
 * output budget (measured: 8× output tokens and 4× latency for the same
 * verdict, Audit II §2). The dialect is the model family's (D1):
 *
 *   2.5  thinkingConfig.thinkingBudget  0 / 1024 / 8192, caller temperature
 *   3    thinkingConfig.thinkingLevel   omitted (model default) / LOW / HIGH,
 *        temperature 1.0 — the vendor's guidance; a budget of 0 is a 400.
 *
 * Temperature defaults to 0.1 on 2.5: extraction and enrichment want
 * near-determinism — the same PDF should yield the same cards.
 */
export function jsonGenerationConfig(input: {
  model: string;
  responseSchema?: Schema;
  temperature?: number;
  maxOutputTokens?: number;
  thinking?: ThinkingEffort;
}): GenerateContentConfig {
  const env = getServerEnv();
  const family = modelFamily(input.model, env.GEMINI_MODEL_FAMILY);
  const thinking = input.thinking ?? 'none';

  const thinkingConfig = family === '3'
    ? (thinking === 'none' ? undefined : { thinkingLevel: thinking === 'low' ? ThinkingLevel.LOW : ThinkingLevel.HIGH })
    : { thinkingBudget: thinking === 'none' ? 0 : thinking === 'low' ? 1024 : 8192 };

  return {
    temperature: family === '3' ? 1.0 : (input.temperature ?? 0.1),
    topP: 0.95,
    maxOutputTokens: input.maxOutputTokens ?? env.GEMINI_MODEL_MAX_TOKENS,
    responseMimeType: 'application/json',
    ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
    ...(thinkingConfig ? { thinkingConfig } : {}),
  };
}

type RequestControls = {
  signal?: AbortSignal;
  /** Aborts the request after this many ms; classified as `timeout` by ai-retry. */
  timeoutMs?: number;
};

function controls({ signal, timeoutMs }: RequestControls): Pick<GenerateContentConfig, 'abortSignal' | 'httpOptions'> {
  return {
    ...(signal ? { abortSignal: signal } : {}),
    ...(timeoutMs ? { httpOptions: { timeout: timeoutMs } } : {}),
  };
}

export type JsonRequest = RequestControls & {
  /** `generation` routes to GEMINI_MODEL_GENERATION when set. */
  purpose?: ModelPurpose;
  systemInstruction: string;
  contents: Content[];
  responseSchema?: Schema;
  temperature?: number;
  maxOutputTokens?: number;
  thinking?: ThinkingEffort;
};

/** One JSON generation. The caller parses `response.text` with its zod schema. */
export async function generateJson(request: JsonRequest): Promise<GenerateContentResponse> {
  const model = resolveModelName(request.purpose);
  return ai().models.generateContent({
    model,
    contents: request.contents,
    config: {
      systemInstruction: request.systemInstruction,
      ...jsonGenerationConfig({
        model,
        responseSchema: request.responseSchema,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        thinking: request.thinking,
      }),
      ...controls(request),
    },
  });
}

export type TextRequest = RequestControls & {
  systemInstruction: string;
  contents: Content[];
  /** Default 0.5. Plain-text calls keep the model's default thinking. */
  temperature?: number;
};

function textConfig(request: TextRequest): GenerateContentConfig {
  return {
    systemInstruction: request.systemInstruction,
    temperature: request.temperature ?? 0.5,
    maxOutputTokens: getServerEnv().GEMINI_MODEL_MAX_TOKENS,
    ...controls(request),
  };
}

/** One plain-text generation on GEMINI_MODEL (mnemonics, hints, note cleanup). */
export async function generateText(request: TextRequest): Promise<GenerateContentResponse> {
  return ai().models.generateContent({
    model: getServerEnv().GEMINI_MODEL,
    contents: request.contents,
    config: textConfig(request),
  });
}

/**
 * Deck chat's token stream. Awaiting this opens the stream, so the request
 * itself (and its 429 or 5xx) happens inside the caller's withGeminiRetry;
 * the returned iterable yields text chunks.
 */
export async function streamText(request: TextRequest): Promise<AsyncGenerator<string>> {
  const stream = await ai().models.generateContentStream({
    model: getServerEnv().GEMINI_MODEL,
    contents: request.contents,
    config: textConfig(request),
  });
  return (async function* texts() {
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  })();
}

/**
 * One embedding request. Each text is its own `Content`: a bare string[]
 * would read as the parts of ONE content. The Gemini API takes at most 100
 * texts per request; embeddings.ts batches and validates.
 */
export async function embedContents(
  texts: string[],
  options: { taskType: EmbeddingTaskType; outputDimensionality: number },
): Promise<(number[] | undefined)[]> {
  const response = await ai().models.embedContent({
    model: getServerEnv().GEMINI_EMBEDDING_MODEL,
    contents: texts.map((text) => ({ role: 'user', parts: [{ text }] })),
    config: { taskType: options.taskType, outputDimensionality: options.outputDimensionality },
  });
  return (response.embeddings ?? []).map((embedding) => embedding.values);
}
