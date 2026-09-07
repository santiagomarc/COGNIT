import { similarity } from '@/lib/fuzzy';

/** Above this, a "distractor" is really the same string as another option. */
const DISTRACTOR_MAX_SIMILARITY = 0.85;

function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Rejects distractors that duplicate the correct answer or each other.
 *
 * Without this, MCQMode renders two options as correct, React warns on the
 * duplicate key, and the question has no wrong answer at all. The model is
 * asked for distinct options in the prompt, but a prompt is not a guarantee.
 *
 * Returns [] unless exactly three usable distractors survive: a 3-option MCQ is
 * a materially easier question (33% guess floor vs 25%), so a short set is
 * better handled by falling back to Identification mode.
 *
 * Lives here rather than in actions/ai-enrich.ts because a 'use server' module
 * may only export async functions.
 */
export function selectUsableDistractors(
  rawDistractors: string[],
  correctAnswer: string,
): string[] {
  const accepted: string[] = [];
  const acceptedKeys = new Set<string>([normalizeForMatch(correctAnswer)]);

  for (const raw of rawDistractors) {
    const value = raw?.trim() ?? '';
    if (!value || value.length > 200) continue;

    const key = normalizeForMatch(value);
    if (acceptedKeys.has(key)) continue;                                              // exact duplicate
    if (correctAnswer && similarity(value, correctAnswer) >= DISTRACTOR_MAX_SIMILARITY) continue;  // near-duplicate of the answer
    if (accepted.some((a) => similarity(value, a) >= DISTRACTOR_MAX_SIMILARITY)) continue;         // near-duplicate of a sibling

    accepted.push(value);
    acceptedKeys.add(key);
    if (accepted.length === 3) break;
  }

  return accepted.length === 3 ? accepted : [];
}
