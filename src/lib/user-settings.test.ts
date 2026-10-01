import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_SESSION_CARD_COUNT, MIN_SESSION_CARD_COUNT } from './study';
import {
  DEFAULT_USER_SETTINGS,
  DISPLAY_NAME_MAX,
  MAX_NEW_CARDS_PER_SESSION,
  displayNameSchema,
  normalizeDisplayName,
  settingsFromRow,
  studyDefaultsSchema,
} from './user-settings';

describe('normalizeDisplayName', () => {
  it('trims, collapses whitespace and strips invisible characters', () => {
    expect(normalizeDisplayName('  Marc   Santiago ')).toBe('Marc Santiago');
    expect(normalizeDisplayName('Ma\u200brc')).toBe('Marc');
    expect(normalizeDisplayName('\u202eMarc')).toBe('Marc');
    expect(normalizeDisplayName('Mar\u0007c')).toBe('Marc');
  });

  it('treats an empty or invisible-only name as "derive it"', () => {
    expect(normalizeDisplayName('')).toBeNull();
    expect(normalizeDisplayName('   ')).toBeNull();
    expect(normalizeDisplayName('\u200b\u200b')).toBeNull();
  });
});

describe('displayNameSchema', () => {
  it('accepts a name at the limit, counted in code points', () => {
    const emoji = '🙂'.repeat(DISPLAY_NAME_MAX); // 80 UTF-16 units, 40 code points
    expect(displayNameSchema.safeParse(emoji).success).toBe(true);
    expect(displayNameSchema.safeParse('a'.repeat(DISPLAY_NAME_MAX + 1)).success).toBe(false);
  });

  it('refuses an email address, the F-06 rule', () => {
    expect(displayNameSchema.safeParse('me@example.com').success).toBe(false);
  });

  it('turns an empty submission into null', () => {
    expect(displayNameSchema.parse('   ')).toBeNull();
  });
});

describe('studyDefaultsSchema', () => {
  it('holds the bounds the study page enforces', () => {
    const ok = { sessionCardCount: MIN_SESSION_CARD_COUNT, newCardsPerSession: 0 };
    expect(studyDefaultsSchema.safeParse(ok).success).toBe(true);
    expect(studyDefaultsSchema.safeParse({ ...ok, sessionCardCount: MAX_SESSION_CARD_COUNT + 1 }).success).toBe(false);
    expect(studyDefaultsSchema.safeParse({ ...ok, sessionCardCount: 7.5 }).success).toBe(false);
    expect(studyDefaultsSchema.safeParse({ ...ok, newCardsPerSession: MAX_NEW_CARDS_PER_SESSION + 1 }).success).toBe(false);
    expect(studyDefaultsSchema.safeParse({ ...ok, newCardsPerSession: -1 }).success).toBe(false);
  });
});

describe('settingsFromRow', () => {
  it('reads no row as every default', () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_USER_SETTINGS);
    expect(settingsFromRow(undefined)).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('maps a row', () => {
    expect(settingsFromRow({ display_name: 'Marc', session_card_count: 20, new_cards_per_session: 8 })).toEqual({
      displayName: 'Marc',
      sessionCardCount: 20,
      newCardsPerSession: 8,
    });
  });

  it('degrades a bad row to defaults rather than to NaN', () => {
    const bad = { display_name: 'x@y.z', session_card_count: Number.NaN, new_cards_per_session: 999 };
    expect(settingsFromRow(bad)).toEqual({
      displayName: null,
      sessionCardCount: DEFAULT_USER_SETTINGS.sessionCardCount,
      newCardsPerSession: MAX_NEW_CARDS_PER_SESSION,
    });
  });
});

describe('the migration agrees with this module', () => {
  it('repeats every bound in its CHECK constraints', () => {
    const sql = readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/202610010900_user_settings.sql'),
      'utf8',
    );
    expect(sql).toContain(`char_length(display_name) between 1 and ${DISPLAY_NAME_MAX}`);
    expect(sql).toContain(`session_card_count between ${MIN_SESSION_CARD_COUNT} and ${MAX_SESSION_CARD_COUNT}`);
    expect(sql).toContain(`default ${DEFAULT_USER_SETTINGS.sessionCardCount}`);
    expect(sql).toContain(`new_cards_per_session between 0 and ${MAX_NEW_CARDS_PER_SESSION}`);
    expect(sql).toContain(`default ${DEFAULT_USER_SETTINGS.newCardsPerSession}`);
  });
});
