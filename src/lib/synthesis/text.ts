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

/* ── Fuzzy quote location (audit R6) ─────────────────────────────── */

type Token = { text: string; start: number; end: number };

/**
 * The same tokens `normaliseForQuote` produces, with their offsets in the
 * ORIGINAL text so a match can be handed back verbatim. Letters and digits
 * only; every quote mark and dash the normaliser folds is a separator here
 * too, so the two views agree.
 */
function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const start = match.index ?? 0;
    tokens.push({ text: match[0].toLowerCase(), start, end: start + match[0].length });
  }
  return tokens;
}

/**
 * Two tokens count as the same word when they are identical or differ only
 * by a short suffix on a stem of four letters or more — `degenerate` /
 * `degenerates`, `toward` / `towards`, `switch` / `switches`, `spend` /
 * `spending`. A crude stemmer, but a model changing number or tense is the
 * common case and this catches it without a dictionary.
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.length - shorter.length <= 3 && longer.startsWith(shorter);
}

function lcsLength(a: readonly string[], b: readonly string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = tokensMatch(a[i - 1], b[j - 1]) ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

/** Fuzzy acceptance needs at least this many quote tokens; shorter quotes must match exactly. */
const MIN_FUZZY_TOKENS = 4;
/** Share of the quote's tokens that must appear, in order, inside one window of the text. */
export const QUOTE_MATCH_RATIO = 0.8;

/**
 * Finds the span of `haystack` that a model's quote most plausibly points
 * at, tolerating the way models quote — a dropped article, a changed tense,
 * two clauses merged. A window of the text within ±2 tokens of the quote's
 * length must contain ≥ 80 % of the quote's tokens in order. Returns the
 * matched span **verbatim from the original text**, so what is displayed is
 * still only words the server found — the guarantee `verifyQuote` gives,
 * kept under paraphrase. Null when nothing comes close.
 */
export function locateQuote(
  quote: string | null | undefined,
  haystack: string,
  minRatio = QUOTE_MATCH_RATIO,
  minChars = 8,
): { text: string; ratio: number } | null {
  if (!quote || normaliseForQuote(quote).length < minChars) return null;
  const needle = tokenise(quote).map((token) => token.text);
  const tokens = tokenise(haystack);
  if (needle.length === 0 || tokens.length === 0) return null;

  let best = { ratio: 0, start: 0, end: 0 };
  const minLength = Math.max(1, needle.length - 2);
  const maxLength = needle.length + 2;
  for (let start = 0; start < tokens.length; start += 1) {
    for (let length = minLength; length <= maxLength && start + length <= tokens.length; length += 1) {
      const window = tokens.slice(start, start + length).map((token) => token.text);
      const ratio = lcsLength(needle, window) / needle.length;
      if (ratio > best.ratio) best = { ratio, start, end: start + length - 1 };
      if (ratio === 1) break;
    }
    if (best.ratio === 1) break;
  }

  if (best.ratio < minRatio) return null;
  if (best.ratio < 1 && needle.length < MIN_FUZZY_TOKENS) return null;

  // Trim the window to the first and last tokens that belong to the quote.
  const wanted = (token: Token) => needle.some((word) => tokensMatch(word, token.text));
  let first = best.start;
  let last = best.end;
  while (first < last && !wanted(tokens[first])) first += 1;
  while (last > first && !wanted(tokens[last])) last -= 1;

  return { text: haystack.slice(tokens[first].start, tokens[last].end), ratio: best.ratio };
}

/**
 * The quote to display for a model claim: the model's own words when they
 * are in the text verbatim, the located span when they are close, nothing
 * when they are neither.
 */
export function findQuote(quote: string | null | undefined, haystack: string): string | null {
  if (!quote) return null;
  if (verifyQuote(quote, haystack)) return quote.trim();
  return locateQuote(quote, haystack)?.text ?? null;
}
