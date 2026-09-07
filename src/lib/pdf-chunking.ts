/**
 * ~4 chars/token for English prose. Gemini 2.5 Flash has a 1M-token window, so
 * the constraint here is not context size — it is extraction quality: a single
 * 120k-char prompt produces cards clustered in the opening pages. Chunking
 * gives every section of the document equal footing.
 */
const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_TOKENS = 6_000;
const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;   // 24,000
const CHUNK_OVERLAP_CHARS = 800;      // preserves definitions split across a boundary
const MIN_CHUNK_CHARS = 400;

/**
 * Hard ceiling on per-upload AI spend, NOT a performance tweak. Bounds the
 * worst case at ~290k input tokens regardless of document size. Do not raise.
 */
export const MAX_CHUNKS = 12;

export type TextChunk = {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
};

export function chunkDocumentText(text: string): TextChunk[] {
  if (text.length <= TARGET_CHUNK_CHARS) {
    return text.trim().length > 0
      ? [{ index: 0, text, charStart: 0, charEnd: text.length }]
      : [];
  }

  const chunks: TextChunk[] = [];
  let cursor = 0;

  while (cursor < text.length && chunks.length < MAX_CHUNKS) {
    const hardEnd = Math.min(cursor + TARGET_CHUNK_CHARS, text.length);
    const end = hardEnd === text.length ? hardEnd : findBreakpoint(text, cursor, hardEnd);
    const slice = text.slice(cursor, end).trim();

    if (slice.length >= MIN_CHUNK_CHARS) {
      chunks.push({ index: chunks.length, text: slice, charStart: cursor, charEnd: end });
    }

    if (end >= text.length) break;
    cursor = Math.max(end - CHUNK_OVERLAP_CHARS, cursor + MIN_CHUNK_CHARS);
  }

  return chunks;
}

/** Prefer a paragraph break, then a sentence end, then the hard cut. */
function findBreakpoint(text: string, start: number, hardEnd: number): number {
  const window = text.slice(start, hardEnd);
  const searchFrom = Math.floor(window.length * 0.6);   // don't produce tiny chunks

  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph > searchFrom) return start + paragraph + 2;

  const sentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('.\n'),
    window.lastIndexOf('? '),
    window.lastIndexOf('! '),
  );
  if (sentence > searchFrom) return start + sentence + 2;

  return hardEnd;
}

export type PdfQuality =
  | { kind: 'ok' }
  | { kind: 'too_short'; extractedChars: number }
  | { kind: 'likely_scanned'; extractedChars: number; pageCount: number }
  | { kind: 'too_noisy'; cleanRatio: number };

/**
 * Distinguishes "scanned/image-only" from "genuinely short" so the UI can give
 * an actionable message instead of one generic "failed to read" error.
 */
export function assessPdfQuality(
  rawText: string,
  cleanedText: string,
  pageCount: number,
): PdfQuality {
  const cleaned = cleanedText.trim();

  // A text PDF yields hundreds of characters per page; a scan yields almost
  // none. 80 chars/page is comfortably below any real prose page.
  if (pageCount >= 3 && cleaned.length < pageCount * 80) {
    return { kind: 'likely_scanned', extractedChars: cleaned.length, pageCount };
  }

  if (cleaned.length < 200) {
    return { kind: 'too_short', extractedChars: cleaned.length };
  }

  const cleanRatio = rawText.length > 0 ? cleaned.length / rawText.length : 0;
  if (cleanRatio < 0.15) {
    return { kind: 'too_noisy', cleanRatio };
  }

  return { kind: 'ok' };
}

export function describePdfQuality(quality: PdfQuality): string | null {
  switch (quality.kind) {
    case 'ok':
      return null;
    case 'likely_scanned':
      return `This looks like a scanned PDF — only ${quality.extractedChars} characters of text were found across ${quality.pageCount} pages. Run it through OCR (Adobe, Preview's "Export as searchable PDF", or Google Docs), then upload again.`;
    case 'too_short':
      return 'This PDF does not contain enough readable text to build cards from. Try a text-based PDF, or paste the content into Bulk Import instead.';
    case 'too_noisy':
      return 'Most of this PDF looked like page furniture (headers, figure captions, URLs) rather than study material. Try a chapter export, or paste the key sections into Bulk Import.';
  }
}
