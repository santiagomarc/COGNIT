import { describe, expect, it } from 'vitest';

import { hasPassword, providerLine } from './auth-providers';

describe('providerLine', () => {
  it('names one, two or three methods in plain words', () => {
    expect(providerLine(['google'])).toBe('Google');
    expect(providerLine(['email', 'github'])).toBe('Email and password and GitHub');
    expect(providerLine(['email', 'google', 'github'])).toBe('Email and password, Google and GitHub');
  });

  it('shows an unknown provider as-is, drops duplicates, and admits to knowing nothing', () => {
    expect(providerLine(['apple'])).toBe('apple');
    expect(providerLine(['google', 'google'])).toBe('Google');
    expect(providerLine([])).toBe('Unknown');
  });
});

describe('hasPassword', () => {
  it('is true only for the email provider', () => {
    expect(hasPassword(['email', 'google'])).toBe(true);
    expect(hasPassword(['google'])).toBe(false);
  });
});
