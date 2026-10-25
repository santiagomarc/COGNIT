import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = __dirname;
const sources = [
  ...readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const),
  ['page.tsx', readFileSync(join(dir, '../../app/page.tsx'), 'utf8')] as const,
];

describe('landing page copy', () => {
  it.each(sources)('%s has no invented counts', (_name, src) => {
    expect(src).not.toMatch(/\b\d{1,3}(,\d{3})+\+/);
  });

  it.each(sources)('%s has no dead "#" links', (_name, src) => {
    expect(src).not.toMatch(/href:\s*'#'|href="#"/);
  });
});
