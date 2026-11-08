import AxeBuilder from '@axe-core/playwright';

import { expect, test, type Theme } from './fixtures';
import { SURFACES } from './surfaces';

/*
 * axe on the main pages in both themes (UIUX plan §4.4 check 1, trimmed).
 * Any violation fails except the rules below, which are known findings with
 * a scheduled fix. When the fix lands, delete its rules here: from then on
 * the spec keeps them from coming back.
 */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// Rules with a scheduled fix, tagged with their finding ID. Empty: A11Y-12
// (landmarks, skip link) landed and the public pages are axe-clean.
const KNOWN: Record<string, string> = {};

const THEMES: Theme[] = ['light', 'dark'];

for (const surface of SURFACES) {
  for (const theme of THEMES) {
    test(`axe: ${surface.name} · ${theme}`, async ({ openSurface }) => {
      const page = await openSurface(surface, theme);
      const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

      const unexpected = violations
        .filter((violation) => !(violation.id in KNOWN))
        .map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.help}\n    ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join('\n    ')}`);
      expect(unexpected, 'axe violations without a scheduled fix').toEqual([]);
    });
  }
}
