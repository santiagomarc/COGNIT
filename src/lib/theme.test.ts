import { describe, expect, it } from 'vitest';

import { THEME_BOOTSTRAP } from './theme-script';
import {
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  storedThemeValue,
} from './theme';

/** Runs the real pre-paint script against a fake document and returns what it chose. */
function bootstrapChooses(stored: string | null, prefersLight: boolean): 'dark' | 'light' {
  const classes = new Set<string>();
  const documentElement = {
    classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)), add: (name: string) => classes.add(name) },
    style: { colorScheme: '' },
  };
  const localStorage = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null) };
  const window = { matchMedia: (query: string) => ({ matches: query.includes('light') ? prefersLight : !prefersLight }) };
  new Function('localStorage', 'window', 'document', THEME_BOOTSTRAP)(localStorage, window, { documentElement });
  return classes.has('dark') ? 'dark' : 'light';
}

describe('theme preference', () => {
  it('parses anything but an explicit choice as system', () => {
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('purple')).toBe('system');
  });

  it('stores system as the absence of the key', () => {
    expect(storedThemeValue('system')).toBeNull();
    expect(storedThemeValue('dark')).toBe('dark');
  });

  it('resolves system from the OS and leaves an explicit choice alone', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });
});

describe('the unchanged pre-paint script agrees with every preference', () => {
  for (const preference of THEME_PREFERENCES) {
    for (const prefersLight of [true, false]) {
      it(`${preference}, OS ${prefersLight ? 'light' : 'dark'}`, () => {
        expect(bootstrapChooses(storedThemeValue(preference), prefersLight)).toBe(resolveTheme(preference, prefersLight));
      });
    }
  }
});
