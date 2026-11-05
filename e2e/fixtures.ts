import { test as base, type BrowserContext, type Page } from '@playwright/test';

import { readFixture, USER_STATE, type Fixture } from './state';
import { resolveSurface, type Surface } from './surfaces';

export { expect } from '@playwright/test';

export type Theme = 'light' | 'dark';

type SeededFixture = Extract<Fixture, { signedIn: true }>;

/** Skips the running test. `test.skip` throws to stop it; the throw here only tells TypeScript so. */
function skipTest(reason: string): never {
  test.skip(true, reason);
  throw new Error(reason);
}

/** The seeded deck, or a skip that names what's missing (no test account, usually). */
export function requireSeed(): SeededFixture {
  const fixture = readFixture();
  return fixture.signedIn ? fixture : skipTest(fixture.reason);
}

export const test = base.extend<{
  /**
   * Opens a surface in a fresh context, signed in when the surface is, in the
   * given theme with reduced motion, settled: network idle, fonts loaded,
   * finite animations finished. Skips the test when the run has no seed.
   */
  openSurface: (surface: Surface, theme: Theme) => Promise<Page>;
}>({
  // `provide` is Playwright's `use`, renamed so the React hooks lint rule doesn't take it for a hook.
  openSurface: async ({ browser }, provide, testInfo) => {
    const contexts: BrowserContext[] = [];
    await provide(async (surface, theme) => {
      const target = resolveSurface(surface, readFixture());
      if ('skip' in target) skipTest(target.skip);

      const { baseURL, viewport, userAgent, deviceScaleFactor } = testInfo.project.use;
      const context = await browser.newContext({
        baseURL,
        viewport,
        userAgent,
        deviceScaleFactor,
        colorScheme: theme,
        reducedMotion: 'reduce',
        storageState: surface.signedIn ? USER_STATE : undefined,
      });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(target.path, { waitUntil: 'networkidle' });
      await settle(page);
      return page;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

/** Fonts loaded and every finite animation finished. Infinite ones (a spinner) are left running. */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .every((animation) => animation.playState !== 'running'),
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => undefined);
}
