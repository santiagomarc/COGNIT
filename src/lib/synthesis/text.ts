/**
 * Text helpers shared by the client (live word count) and the server
 * (persisted word_count, quote verification, fencing). Pure; client-safe.
 */

import type { AnswerMode, AttemptResponse, FreeResponse, OutlineResponse } from '@/lib/synthesis/types';

export const MAX_ANSWER_WORDS = 150;

export function isOutlineResponse(response: AttemptResponse): response is OutlineResponse {
  return typeof (response as OutlineResponse).claim === 'string';
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Every field of the answer joined, for counting and for quote lookups. */
export function responseText(response: AttemptResponse): string {
  if (isOutlineResponse(response)) {
    return [response.claim, response.mechanisms[0], response.mechanisms[1], response.tradeoff]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n');
  }
  return (response as FreeResponse).text.trim();
}

/** The labelled form the model reads. Labels are fixed so quotes stay verbatim. */
export function renderResponseForModel(mode: AnswerMode, response: AttemptResponse): string {
  if (mode === 'outline' && isOutlineResponse(response)) {
    return [
      `Claim: ${response.claim.trim() || '(empty)'}`,
      `Mechanism 1: ${response.mechanisms[0].trim() || '(empty)'}`,
      `Mechanism 2: ${response.mechanisms[1].trim() || '(empty)'}`,
      `Trade-off: ${response.tradeoff.trim() || '(empty)'}`,
    ].join('\n');
  }
  return responseText(response);
}

/**
 * The student's text sits between fences carrying a random token the essay's
 * author cannot know, so text claiming to be "outside" the fence is inside it.
 */
export function fenceAnswer(text: string, nonce: string): string {
  return `<<<ANSWER ${nonce}>>>\n${text}\n<<<END ANSWER ${nonce}>>>`;
}

/**
 * Lower-case, straighten curly quotes and dashes, drop everything but letters,
 * digits and spaces, collapse whitespace. Both sides of a quote check go
 * through this, so punctuation and casing differences never fail a match.
 */
export function normaliseForQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when `quote` appears in `haystack` after normalisation and is long
 * enough to be meaningful. A quote the server cannot find is never displayed
 * as the student's words.
 */
export function verifyQuote(quote: string | null | undefined, haystack: string, minChars = 8): boolean {
  if (!quote) return false;
  const needle = normaliseForQuote(quote);
  if (needle.length < minChars) return false;
  return normaliseForQuote(haystack).includes(needle);
}

/** Sanitiser artefacts must not reach the student's screen or a new card. */
export function stripRedactions(text: string): string {
  return text.replace(/\s*\[redacted\]\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
}
