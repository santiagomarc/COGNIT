'use client';

import { lazy, Suspense, useMemo } from 'react';
import { hasRichText, parseRichText } from '@/lib/rich-text';

// Both renderers are code-split and load on first use only: a deck without a
// `$` or a backtick ships neither KaTeX (≈ 280 KB with fonts) nor the
// highlighter. The fallback while a chunk loads is the raw source in a
// <code>, which is readable and the same height.
const RichTextMath = lazy(() => import('./RichTextMath'));
const RichTextCode = lazy(() => import('./RichTextCode'));

type RichTextProps = {
  text: string;
  className?: string;
};

/**
 * Card text with inline/display math and code (improvement plan §4.2).
 * Plain text passes straight through as a text node; only text that carries
 * a delimiter is parsed.
 */
export function RichText({ text, className }: RichTextProps) {
  const segments = useMemo(() => (hasRichText(text) ? parseRichText(text) : null), [text]);

  if (!segments) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          return <span key={index}>{segment.value}</span>;
        }
        if (segment.kind === 'math') {
          return (
            <Suspense key={index} fallback={<code className="code">{segment.value}</code>}>
              <RichTextMath tex={segment.value} display={segment.display} />
            </Suspense>
          );
        }
        return (
          <Suspense
            key={index}
            fallback={segment.block ? <pre className="code code--block"><code>{segment.value}</code></pre> : <code className="code">{segment.value}</code>}
          >
            <RichTextCode code={segment.value} lang={segment.lang} block={segment.block} />
          </Suspense>
        );
      })}
    </span>
  );
}
