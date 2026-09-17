'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';

type RichTextMathProps = {
  tex: string;
  display: boolean;
};

/**
 * KaTeX output is inert HTML: `trust: false` refuses \url, \href and every
 * other command that could emit an attribute, `throwOnError: false` renders a
 * bad formula as its source in red rather than breaking the card. The colour
 * is inherited, so the formula takes `--ink` on both themes.
 */
export default function RichTextMath({ tex, display }: RichTextMathProps) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    output: 'htmlAndMathml',
  });
  return (
    <span
      className={display ? 'math math--display' : 'math'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
