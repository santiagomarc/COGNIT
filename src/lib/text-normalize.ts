/**
 * Shared text normalisers.
 *
 * These live outside actions/_shared.ts because that module is 'use server'
 * (async-only exports) and pure helpers need to be importable from library
 * code and tests.
 */
export function normalizeWhitespace(value: string) {
  return value
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00A0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
