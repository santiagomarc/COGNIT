import type { Locator, Page } from '@playwright/test';

import { expect, requireSeed, test } from './fixtures';
import { USER_STATE } from './state';

/*
 * Closing a dialog puts focus back on what opened it, never on <body> (UIUX
 * plan §4.4 check 4). Each trigger is focused and opened from the keyboard,
 * the case focus return exists for. Nothing here confirms anything: the
 * trash confirm and the quiz's quit are cancelled.
 */
test.use({ storageState: USER_STATE });

async function expectFocusReturns(page: Page, trigger: Locator, dialog: Locator, close: () => Promise<void>) {
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await close();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

const escape = (page: Page) => () => page.keyboard.press('Escape');

test('command palette', async ({ page }) => {
  requireSeed();
  await page.goto('/dashboard');
  await expectFocusReturns(page, page.locator('button.sidebar__search'), page.getByRole('dialog'), escape(page));
});

test('create deck', async ({ page }) => {
  requireSeed();
  await page.goto('/dashboard');
  await expectFocusReturns(page, page.getByRole('button', { name: /^New deck/ }), page.getByRole('dialog'), escape(page));
});

test('confirm: move a deck to the trash, cancelled', async ({ page }) => {
  const { deckId } = requireSeed();
  await page.goto(`/dashboard/${deckId}?tab=overview`);
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expectFocusReturns(page, page.getByRole('button', { name: 'Delete deck' }), dialog, escape(page));
});

test('study pause', async ({ page }) => {
  const { deckId } = requireSeed();
  await page.goto(`/dashboard/${deckId}/study?count=5&scope=include_reviewed`);
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  // The pause overlay closes from its own Resume button, which takes focus when it opens.
  await expectFocusReturns(page, page.getByRole('button', { name: 'Pause' }), resume, () => page.keyboard.press('Enter'));
});

test('quiz quit, cancelled', async ({ page }) => {
  const { deckId } = requireSeed();
  await page.goto(`/dashboard/${deckId}/quiz?count=5&mode=mcq`);
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expectFocusReturns(page, page.getByRole('button', { name: 'Back to deck' }), dialog, escape(page));
});
