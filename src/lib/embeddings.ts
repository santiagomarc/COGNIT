import { withGeminiRetry } from '@/lib/ai-retry';
import { embedContents, type EmbeddingTaskType } from '@/lib/gemini';

/** The Gemini API caps an embedding request at 100 texts. */
const MAX_BATCH = 100;
export const EMBEDDING_DIMENSIONS = 768;

export type TaskType = EmbeddingTaskType;

/**
 * One HTTP call per <=100 texts instead of one per text.
 * taskType matters: asymmetric embeddings put a short question and a long
 * definition in the same neighbourhood, which is exactly this app's shape.
 */
export async function embedTexts(
  texts: string[],
  options: { taskType: TaskType; maxServerDelayMs?: number },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const slice = texts.slice(i, i + MAX_BATCH);
    const embeddings = await withGeminiRetry(
      () => embedContents(slice, { taskType: options.taskType, outputDimensionality: EMBEDDING_DIMENSIONS }),
      { label: 'batch_embed', maxServerDelayMs: options.maxServerDelayMs },
    );

    if (embeddings.length !== slice.length) {
      throw new Error(`Embedding count mismatch: expected ${slice.length}, got ${embeddings.length}`);
    }
    for (const values of embeddings) {
      if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error('Embedding model returned an invalid vector.');
      }
      out.push(values);
    }
  }

  return out;
}

export function toVectorLiteral(values: number[]) {
  return `[${values.map((v) => Number((Number.isFinite(v) ? v : 0).toFixed(8))).join(',')}]`;
}
