import { z } from 'zod';

import {
  DEFAULT_SESSION_CARD_COUNT,
  MAX_SESSION_CARD_COUNT,
  MIN_SESSION_CARD_COUNT,
  NEW_CARDS_PER_SESSION,
} from '@/lib/study';

/**
 * Per-account settings (sidebar plan §3.1, DATA-01): the values that follow a
 * user across devices. Theme and sound/haptics are per-browser and live in
 * localStorage instead (plan §5.4, §5.6).
 *
 * Shared by the server loader, the server actions and the Settings form, so
 * the limits here are the limits everywhere. The table's CHECK constraints
 * (202610010900) repeat them; a test pins the two together.
 */

export const DISPLAY_NAME_MAX = 40;
export const MAX_NEW_CARDS_PER_SESSION = 20;

export type UserSettings = {
  /** Null means "derive it" — resolveDisplayName's metadata and email chain. */
  displayName: string | null;
  sessionCardCount: number;
  newCardsPerSession: number;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  displayName: null,
  sessionCardCount: DEFAULT_SESSION_CARD_COUNT,
  newCardsPerSession: NEW_CARDS_PER_SESSION,
};

/** The `user_settings` columns this module reads. */
export type UserSettingsRow = {
  display_name: string | null;
  session_card_count: number;
  new_cards_per_session: number;
};

// C0/C1 controls, zero-width characters and bidi overrides: none belongs in a
// greeting, and the bidi ones can make a name render as something else.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

/** Trimmed, single-spaced and free of invisible characters; empty becomes null. */
export function normalizeDisplayName(raw: string): string | null {
  const cleaned = raw.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return cleaned.length === 0 ? null : cleaned;
}

/** Code points, as Postgres `char_length` counts them — not UTF-16 units. */
function codePointLength(value: string): number {
  return Array.from(value).length;
}

export const displayNameSchema = z
  .string()
  .max(400)
  .transform(normalizeDisplayName)
  .refine((value) => value === null || codePointLength(value) <= DISPLAY_NAME_MAX, {
    message: `Keep it to ${DISPLAY_NAME_MAX} characters.`,
  })
  .refine((value) => value === null || !value.includes('@'), {
    // resolveDisplayName rejects address-shaped names (F-06); so does this.
    message: 'Use a name, not an email address.',
  });

export const studyDefaultsSchema = z.object({
  sessionCardCount: z.number().int().min(MIN_SESSION_CARD_COUNT).max(MAX_SESSION_CARD_COUNT),
  newCardsPerSession: z.number().int().min(0).max(MAX_NEW_CARDS_PER_SESSION),
});

export type StudyDefaults = z.infer<typeof studyDefaultsSchema>;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * A row, or no row, as settings. Defensive about the row even though the
 * table's CHECKs make a bad one impossible: a missing migration or a hand
 * edit must degrade to defaults, never to a session of NaN cards.
 */
export function settingsFromRow(row: UserSettingsRow | null | undefined): UserSettings {
  if (!row) return DEFAULT_USER_SETTINGS;

  const name = typeof row.display_name === 'string' ? normalizeDisplayName(row.display_name) : null;

  return {
    displayName: name && codePointLength(name) <= DISPLAY_NAME_MAX && !name.includes('@') ? name : null,
    sessionCardCount: clampInt(
      row.session_card_count,
      MIN_SESSION_CARD_COUNT,
      MAX_SESSION_CARD_COUNT,
      DEFAULT_SESSION_CARD_COUNT,
    ),
    newCardsPerSession: clampInt(row.new_cards_per_session, 0, MAX_NEW_CARDS_PER_SESSION, NEW_CARDS_PER_SESSION),
  };
}
