import { defineConfig, devices } from '@playwright/test';

/*
 * The UI test harness (UIUX plan §4, TEST-01), kept to what protects U2's
 * study-loop work: a keyboard study session, focus return from dialogs, and
 * axe on the main pages. One browser, desktop size.
 *
 * Run `npm run build` first, then `npm run e2e`: it tests the production
 * build, because dev mode's overlays and timings would skew axe and the
 * latency check. It uses production Supabase with the LOAD_TEST_* account
 * from .env.local and touches only `[e2e] …` decks; without that account,
 * only the public pages run.
 *
 * It drives the installed Google Chrome, so a run needs no browser download.
 */
const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
