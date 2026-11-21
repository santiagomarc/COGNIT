import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Type sizes come from the scale (UIUX plan DS-08): `type-label`, `type-sm`,
 * `type-cap`, the display and study steps. An arbitrary `text-[13px]` restates
 * a step and drifts from it. This counts the arbitrary font sizes left in
 * `src` and fails above the ceiling.
 *
 * The ceiling only goes down. The 22 left on 2026-11-20 are reviewed
 * exceptions: the grade key's 11px interval (design system §7.4), the drill
 * slots' 15px, and sizes inside the `components/ui` primitives' variant
 * strings. Remove one, lower the number.
 */
const CEILING = 22;

const SRC = path.join(__dirname, '..');
const ARBITRARY_SIZE = /text-\[\d+(?:\.\d+)?(?:px|rem)\]/g;

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [full] : [];
  });
}

describe('type scale (DS-08)', () => {
  it(`has at most ${CEILING} arbitrary font sizes`, () => {
    const found = tsxFiles(SRC).flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(ARBITRARY_SIZE)].map((match) => `${path.relative(SRC, file)}: ${match[0]}`),
    );
    expect(found.length, found.join('\n')).toBeLessThanOrEqual(CEILING);
  });

  it('every serif size is a named step', () => {
    const offenders = tsxFiles(SRC).flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /\bfont-serif\b/.test(line) && /className=/.test(line) && !/type-(display|study|hero)/.test(line))
        .map((line) => `${path.relative(SRC, file)}: ${line.trim().slice(0, 100)}`),
    );
    expect(offenders).toEqual([]);
  });
});
