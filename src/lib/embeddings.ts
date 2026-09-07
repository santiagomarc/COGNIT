import { getGeminiEmbeddingModel } from '@/app/actions/_shared';
import { withGeminiRetry } from '@/lib/ai-retry';
import { TaskType as GeminiTaskType } from '@google/generative-ai';

/** text-embedding-004 caps a batchEmbedContents request at 100 items. */
const MAX_BATCH = 100;
export const EMBEDDING_DIMENSIONS = 768;

export type TaskType =
  | 'RETRIEVAL_DOCUMENT'
  | 'RETRIEVAL_QUERY'
  | GeminiTaskType;

/**
 * One HTTP call per <=100 texts instead of one per text.
 * taskType matters: asymmetric embeddings put a short question and a long
 * definition in the same neighbourhood, which is exactly this app's shape.
 */
export async function embedTexts(
  texts: string[],
  options: { taskType: TaskType },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = getGeminiEmbeddingModel();
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const slice = texts.slice(i, i + MAX_BATCH);
    const response = await withGeminiRetry(
      () => model.batchEmbedContents({
        requests: slice.map((text) => ({
          content: { role: 'user', parts: [{ text }] },
          taskType: options.taskType as GeminiTaskType,
        })),
      }),
      { label: 'batch_embed' },
    );

    const embeddings = (response as { embeddings?: { values?: number[] }[] }).embeddings ?? [];
    if (embeddings.length !== slice.length) {
      throw new Error(`Embedding count mismatch: expected ${slice.length}, got ${embeddings.length}`);
    }
    for (const embedding of embeddings) {
      const values = embedding.values;
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
