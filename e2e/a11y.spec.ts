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

const KNOWN: Record<string, string> = {
  // A11Y-12 (U4): no single top-level <main>, and no skip link target.
  // Measured on the public pages (Appendix B.1).
  'landmark-one-main': 'A11Y-12',
  region: 'A11Y-12',
  'skip-link': 'A11Y-12',
  // A11Y-12 (U4): study, quiz and the drill render their own <main> inside
  // the shell's. Read from code, not yet seen by axe.
  'landmark-main-is-top-level': 'A11Y-12',
  'landmark-no-duplicate-main': 'A11Y-12',
};

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
