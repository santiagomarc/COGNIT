import { expect, requireSeed, settle, test } from './fixtures';
import { USER_STATE } from './state';

/*
 * The study loop (UIUX plan §4.4 check 3; U2 adds its own assertions here).
 * In order, so the two tests never grade the deck at once.
 * `include_reviewed` keeps every card in scope after a grade, so a rerun
 * finds the same session.
 */
test.use({ storageState: USER_STATE });
test.describe.configure({ mode: 'serial' });

/** The latency test's in-page helpers. */
declare global {
  interface Window {
    __keyAt: number;
    __settled: (predicate: () => boolean) => Promise<number>;
    __revealed: () => boolean;
    __advanced: (previous: string, restTop: number) => boolean;
  }
}

test('a keyboard session reads the card, the answer and the grade (A11Y-13)', async ({ page }) => {
  const { deckId } = requireSeed();
  await page.goto(`/dashboard/${deckId}/study?count=5&scope=include_reviewed`);
  const live = page.locator('div.sr-only[aria-live="polite"]');

  await expect(live).toHaveText(/^Card 1 of 5\. Question: \S/);
  for (let card = 1; card <= 5; card += 1) {
    await page.keyboard.press('Space');
    await expect(live).toHaveText(/^Answer: \S/);
    await page.keyboard.press('3');
    if (card < 5) await expect(live).toHaveText(new RegExp(`^Graded Good\\. Next review in .+ Card ${card + 1} of 5\\. Question: \\S`));
  }
  await expect(live).toHaveText(/^Flashcard review complete\. \d+ reviews completed\./);
});

/*
 * A measurement, not a gate: timings on a laptop vary too much to fail a run
 * on. `E2E_LATENCY=1 npm run e2e -- study` prints the medians; compare them
 * with U2's targets (reveal ≤ 200 ms, advance ≤ 300 ms, Rev. F §9.5).
 *
 * Reveal: Space → the answer face visible and the flip settled. Advance: `3`
 * → the next prompt readable, fully opaque and at rest. Both timed in the page
 * from the keydown itself, so the driver's round trip isn't counted (Appendix
 * D.3 timed from before the press). "Settled" means the state held for two
 * frames. Medians over five cards.
 */
test('reveal and advance latency', async ({ page }) => {
  test.skip(process.env.E2E_LATENCY !== '1', 'a measurement: run with E2E_LATENCY=1');
  const { deckId } = requireSeed();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`/dashboard/${deckId}/study?count=6&scope=include_reviewed`, { waitUntil: 'networkidle' });
  await settle(page);

  await page.evaluate(() => {
    window.__keyAt = 0;
    addEventListener('keydown', () => (window.__keyAt = performance.now()), { capture: true });
    window.__settled = (predicate) =>
      new Promise<number>((resolve) => {
        const start = performance.now();
        let since: number | null = null;
        const tick = () => {
          const now = performance.now();
          if (predicate()) {
            since ??= now;
            if (now - since >= 34) return resolve(Math.round(since - window.__keyAt));
          } else since = null;
          if (now - start > 5_000) return resolve(-1);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    const rotation = () => {
      const panel = document.querySelector('.flip__panel');
      return panel ? new DOMMatrixReadOnly(getComputedStyle(panel).transform).m11 : null;
    };
    const opacity = (element: Element | null) => {
      let value = 1;
      for (let node = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
      return value;
    };
    window.__revealed = () => {
      const answer = document.querySelector('.flip__face--answer');
      const m11 = rotation();
      // rotateY(180deg): m11 is -1.
      return Boolean(answer) && getComputedStyle(answer!).visibility === 'visible' && m11 !== null && m11 < -0.999;
    };
    window.__advanced = (previous, restTop) => {
      const card = document.querySelector('.flip');
      const prompt = document.querySelector<HTMLElement>('.flip__face--prompt');
      const m11 = rotation();
      if (!card || !prompt || m11 === null) return false;
      const text = prompt.innerText.trim();
      return (
        text !== '' &&
        text !== previous &&
        getComputedStyle(prompt).visibility === 'visible' &&
        opacity(card) > 0.999 &&
        m11 > 0.999 &&
        Math.abs(card.getBoundingClientRect().top - restTop) < 0.5
      );
    };
  });

  const reveals: number[] = [];
  const advances: number[] = [];
  for (let card = 0; card < 5; card += 1) {
    const restTop = await page.evaluate(() => document.querySelector('.flip')!.getBoundingClientRect().top);
    const reveal = page.evaluate(() => window.__settled(window.__revealed));
    await page.keyboard.press('Space');
    reveals.push(await reveal);

    const previous = await page.evaluate(() => document.querySelector<HTMLElement>('.flip__face--prompt')!.innerText.trim());
    const advance = page.evaluate(([previous, restTop]) => window.__settled(() => window.__advanced(previous, restTop)), [previous, restTop] as const);
    await page.keyboard.press('3');
    advances.push(await advance);
    await page.waitForTimeout(300);
  }

  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  expect(reveals, 'every reveal settled within 5 s').not.toContain(-1);
  expect(advances, 'every advance settled within 5 s').not.toContain(-1);
  const medians = { reveal: median(reveals), advance: median(advances) };
  console.log(`[e2e] study latency: reveals ${reveals.join(', ')} ms; advances ${advances.join(', ')} ms; medians ${JSON.stringify(medians)}`);
});
