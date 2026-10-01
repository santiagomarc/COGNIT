/**
 * Theme preference (sidebar plan §5.4, SET-03).
 *
 * The stored value is a preference, not a theme: `system` follows
 * `prefers-color-scheme` live. `system` is stored as the ABSENCE of the key,
 * which is exactly what the pre-paint script in theme-script.ts already treats
 * as "follow the OS" — so the script, and the CSP hash that allows it, do not
 * change. theme.test.ts runs that script against this module to prove it.
 */

export const THEME_STORAGE_KEY = 'cognit-theme';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system'];

/** Anything but an explicit choice — including a legacy or corrupt value — is `system`. */
export function parseThemePreference(stored: string | null | undefined): ThemePreference {
  return stored === 'dark' || stored === 'light' ? stored : 'system';
}

export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
  if (preference === 'system') return prefersLight ? 'light' : 'dark';
  return preference;
}

/** What to write for a preference: a value, or null to remove the key. */
export function storedThemeValue(preference: ThemePreference): string | null {
  return preference === 'system' ? null : preference;
}
