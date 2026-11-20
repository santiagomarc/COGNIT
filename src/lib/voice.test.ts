import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The product's voice (UIUX plan COPY-05): a toast or message states the fact
 * and doesn't exclaim. This fails on any string literal in `src` that ends a
 * word with "!", the shape of "Reset email sent!".
 */
const SRC = path.join(__dirname, '..');
// A quote, then text, then a letter or full stop followed by "!" and the closing quote.
const EXCLAIMED = /(['"`])[^'"`\n]*[A-Za-z.]!\1/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('voice (COPY-05)', () => {
  it('no user-facing string ends in an exclamation mark', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(EXCLAIMED)].map((match) => `${path.relative(SRC, file)}: ${match[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
