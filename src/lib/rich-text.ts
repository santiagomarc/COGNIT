/**
 * Rich text for card faces (improvement plan §4.2): inline math `$…$`,
 * display math `$$…$$`, fenced code ```lang … ``` and inline code `…`.
 * Nothing else — cards are answers, not documents.
 *
 * Pure and dependency-free: the renderer decides what to do with each
 * segment, and a deck with no `$` or backtick never loads KaTeX or the
 * highlighter (`hasRichText`).
 */

export type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; display: boolean }
  | { kind: 'code'; value: string; lang: string | null; block: boolean };

/*
 * Alternation order matters: fenced code before inline code, display math
 * before inline math, so the longer delimiter wins.
 *
 * The inline-math rule is the whole ballgame: "costs $5 and $10" must not
 * become math. It requires no whitespace just inside the delimiters and no
 * word character or `$` just outside them — the LaTeX convention — which
 * leaves prices alone and accepts `$E=mc^2$`, `a $x$ b`, `($\alpha$)`.
 */
const TOKEN = /(```([A-Za-z0-9_+-]*)\n([\s\S]*?)```|`([^`\n]+)`|\$\$([\s\S]+?)\$\$|(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\w$]))/g;

export function parseRichText(input: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;

  for (const match of input.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ kind: 'text', value: input.slice(last, index) });

    if (match[3] !== undefined) {
      out.push({ kind: 'code', value: match[3].replace(/\n$/, ''), lang: match[2] ? match[2].toLowerCase() : null, block: true });
    } else if (match[4] !== undefined) {
      out.push({ kind: 'code', value: match[4], lang: null, block: false });
    } else if (match[5] !== undefined) {
      out.push({ kind: 'math', value: match[5].trim(), display: true });
    } else if (match[6] !== undefined) {
      out.push({ kind: 'math', value: match[6], display: false });
    }

    last = index + match[0].length;
  }

  if (last < input.length) out.push({ kind: 'text', value: input.slice(last) });
  return out;
}

/** Cheap gate: only text containing a `$` or a backtick can carry a segment. */
export function hasRichText(text: string): boolean {
  return /[$`]/.test(text);
}

/**
 * True when every `$` is part of a balanced delimiter pair (or is a price —
 * a `$` followed by a digit). The generation validator uses it to reject a
 * card whose formula the renderer would show as raw dollar signs.
 */
export function hasBalancedMath(text: string): boolean {
  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/\$\$[\s\S]+?\$\$/g, '')
    .replace(/(?<![\\$\w])\$(?!\s)[^$\n]+?(?<!\s)\$(?![\w$])/g, '')
    .replace(/\\\$/g, '')
    .replace(/\$(?=\d)/g, '');
  return !stripped.includes('$');
}
