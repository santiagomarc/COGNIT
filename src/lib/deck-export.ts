import { parseRichText } from '@/lib/rich-text';

/** The card columns an export reads (PostgREST select list below). */
export type ExportCard = {
  id: string;
  front: string;
  back: string;
  explanation: string | null;
  topic_tags: string[] | null;
  state: string | null;
  interval: number | null;
  ease_factor: number | null;
  next_review_at: string | null;
};

export type ExportFormat = 'csv' | 'anki';

export const EXPORT_COLUMNS = 'id, front, back, explanation, topic_tags, state, interval, ease_factor, next_review_at';

/* ── CSV (RFC 4180) ───────────────────────────────────────────────── */

/** Spreadsheet apps execute a cell that starts with one of these (CSV injection, OWASP). */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text.trim() !== text ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_HEADER = ['question', 'answer', 'explanation', 'tags', 'state', 'interval_days', 'ease', 'next_review_at', 'cognit_id'].join(',');

/**
 * One CSV row. The schema's field names are backwards — `back` is the prompt
 * and `front` the answer (design system §7.6) — so the export maps them here
 * and names its columns for what they are.
 */
export function toCsvRow(card: ExportCard): string {
  return [
    card.back,
    card.front,
    card.explanation,
    (card.topic_tags ?? []).join('; '),
    card.state,
    card.interval,
    card.ease_factor,
    card.next_review_at,
    card.id,
  ].map(csvCell).join(',') + '\r\n';
}

/* ── Anki (tab-separated text import with file headers, Anki ≥ 2.1.55) ── */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * A card face as an Anki HTML field. Cognit writes TeX as `$…$` / `$$…$$`
 * (rich-text.ts) and Anki's MathJax reads `\(…\)` / `\[…\]`. Tokenising with
 * the renderer's own parser keeps "costs $5 and $10" as text, exactly as the
 * card displays it. A tab or a newline would break the row, so tabs become
 * spaces and newlines `<br>`.
 */
export function toAnkiField(text: string): string {
  return parseRichText(text)
    .map((segment) => {
      if (segment.kind === 'math') {
        const tex = escapeHtml(segment.value);
        return segment.display ? `\\[${tex}\\]` : `\\(${tex}\\)`;
      }
      if (segment.kind === 'code') {
        const code = escapeHtml(segment.value);
        return segment.block ? `<pre><code>${code}</code></pre>` : `<code>${code}</code>`;
      }
      return escapeHtml(segment.value);
    })
    .join('')
    .replace(/\t/g, '    ')
    .replace(/\r?\n/g, '<br>');
}

/** Anki tags cannot contain spaces; `cognit::` nests them under one parent. */
export function toAnkiTags(tags: string[] | null): string {
  return (tags ?? [])
    .map((tag) => tag.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_:-]/gu, ''))
    .filter(Boolean)
    .map((tag) => `cognit::${tag}`)
    .join(' ');
}

/** The deck as Anki names it, nested under "Cognit". */
export function ankiDeckName(title: string): string {
  const clean = title.replace(/::/g, ' - ').replace(/[\t\r\n]/g, ' ').trim();
  return `Cognit::${clean || 'Deck'}`;
}

/**
 * Headers Anki reads before the rows, so the file imports with no dialog
 * choices: the Basic note type, the deck, the tag column and a GUID column —
 * re-importing the same deck updates its notes instead of duplicating them.
 */
export function ankiHeader(deckTitle: string): string {
  return [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    `#deck:${ankiDeckName(deckTitle)}`,
    '#columns:Front\tBack\tTags\tGUID',
    '#tags column:3',
    '#guid column:4',
  ].join('\n') + '\n';
}

/** Anki Front is the prompt (`back`), Back is the answer (`front`) plus the explanation. */
export function toAnkiRow(card: ExportCard): string {
  const answer = card.explanation?.trim()
    ? `${toAnkiField(card.front)}<br><br><small>${toAnkiField(card.explanation)}</small>`
    : toAnkiField(card.front);
  return [toAnkiField(card.back), answer, toAnkiTags(card.topic_tags), `cognit-${card.id}`].join('\t') + '\n';
}

/** An ASCII file name, safe inside a Content-Disposition header. */
export function exportFilename(title: string, format: ExportFormat): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  return `${base || 'deck'}.${format === 'anki' ? 'anki.txt' : 'csv'}`;
}
