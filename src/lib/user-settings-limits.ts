import { DEFAULT_SESSION_CARD_COUNT, NEW_CARDS_PER_SESSION } from '@/lib/study';

/**
 * The plain numbers and defaults behind `user_settings`, without zod.
 *
 * Client components (the Settings forms) import from here; the schemas in
 * `user-settings.ts` import zod, and a client import of that module put
 * ~70 kB gz of zod back into the Settings bundle that PERF-02 had taken out of
 * every client route. `user-settings.ts` re-exports all of this, so server
 * code keeps one import.
 */

export const DISPLAY_NAME_MAX = 40;
export const MAX_NEW_CARDS_PER_SESSION = 20;

export type UserSettings = {
  /** Null means "derive it" — resolveDisplayName's metadata and email chain. */
  displayName: string | null;
  sessionCardCount: number;
  newCardsPerSession: number;
};

export type StudyDefaults = Pick<UserSettings, 'sessionCardCount' | 'newCardsPerSession'>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  displayName: null,
  sessionCardCount: DEFAULT_SESSION_CARD_COUNT,
  newCardsPerSession: NEW_CARDS_PER_SESSION,
};
