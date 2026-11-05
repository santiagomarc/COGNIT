import fs from 'node:fs';
import path from 'node:path';

/*
 * What global setup leaves behind for the specs (UIUX plan §4.3), and where.
 * A file rather than environment variables, so a spec run on its own
 * (`npm run e2e -- study`) reads the same state the last setup wrote.
 */
export const AUTH_DIR = path.join(__dirname, '.auth');
/** The signed-in browser state. Signed-in specs opt in with `test.use({ storageState: USER_STATE })`. */
export const USER_STATE = path.join(AUTH_DIR, 'state.json');
const FIXTURE_FILE = path.join(AUTH_DIR, 'fixture.json');

/** Every deck the harness creates has this prefix, and it deletes nothing else. */
export const FIXTURE_TITLE_PREFIX = '[e2e] ';

export type Fixture = { signedIn: false; reason: string } | { signedIn: true; deckId: string };

export function writeFixture(fixture: Fixture) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2));
}

export function readFixture(): Fixture {
  try {
    return JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8')) as Fixture;
  } catch {
    return { signedIn: false, reason: 'global setup has not run' };
  }
}
