'use client';

import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';

hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);

type RichTextCodeProps = {
  code: string;
  lang: string | null;
  block: boolean;
};

/**
 * highlight.js escapes the source and emits only its own <span class="hljs-…">
 * tokens, so the HTML is safe to inject. The token classes are mapped onto two
 * ink shades in globals.css — this system has no syntax hue; hue is state.
 */
export default function RichTextCode({ code, lang, block }: RichTextCodeProps) {
  const known = lang && hljs.getLanguage(lang) ? lang : null;
  const html = known
    ? hljs.highlight(code, { language: known, ignoreIllegals: true }).value
    : hljs.highlightAuto(code, ['typescript', 'python', 'sql', 'c']).value;

  if (block) {
    return (
      <pre className="code code--block">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    );
  }
  return <code className="code" dangerouslySetInnerHTML={{ __html: html }} />;
}
