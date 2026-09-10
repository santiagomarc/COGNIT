import { describe, expect, it } from 'vitest';

import { greetingForHour, resolveDisplayName } from './display-name';

describe('resolveDisplayName', () => {
  it('prefers the first word of an OAuth full_name', () => {
    expect(
      resolveDisplayName({
        email: 'someone@example.com',
        user_metadata: { full_name: 'Marc Stephen Santiago' },
      })
    ).toBe('Marc');
  });

  it('falls back to GitHub’s name field', () => {
    expect(
      resolveDisplayName({ email: 'someone@example.com', user_metadata: { name: 'Ada Lovelace' } })
    ).toBe('Ada');
  });

  it('prefers full_name over name when both exist', () => {
    expect(
      resolveDisplayName({ user_metadata: { full_name: 'Grace Hopper', name: 'ghopper' } })
    ).toBe('Grace');
  });

  it('falls back to the email local part, title-cased', () => {
    expect(resolveDisplayName({ email: 'santiagomarcstephen@gmail.com' })).toBe(
      'Santiagomarcstephen'
    );
  });

  it('stops the local part at the first separator', () => {
    expect(resolveDisplayName({ email: 'marc.santiago@example.com' })).toBe('Marc');
    expect(resolveDisplayName({ email: 'marc_santiago@example.com' })).toBe('Marc');
    expect(resolveDisplayName({ email: 'marc-santiago@example.com' })).toBe('Marc');
    expect(resolveDisplayName({ email: 'marc+tag@example.com' })).toBe('Marc');
  });

  it('drops digits rather than greeting someone as "Marc92"', () => {
    expect(resolveDisplayName({ email: 'marc92@example.com' })).toBe('Marc');
  });

  /*
   * The whole point of F-06. Every branch below must produce a name or null —
   * never something containing an address.
   */
  it('never returns anything resembling an email address', () => {
    const cases: Array<Parameters<typeof resolveDisplayName>[0]> = [
      { email: 'someone@example.com' },
      { email: 'a@b.co' },
      { email: 'marc.santiago@example.com', user_metadata: {} },
      { email: 'x1@example.com' },
      { user_metadata: { full_name: 'someone@example.com' } },
    ];

    for (const input of cases) {
      const name = resolveDisplayName(input);
      if (name !== null) {
        expect(name).not.toContain('@');
      }
    }
  });

  it('returns null when there is nothing usable, so the caller can omit the name', () => {
    expect(resolveDisplayName(null)).toBeNull();
    expect(resolveDisplayName(undefined)).toBeNull();
    expect(resolveDisplayName({})).toBeNull();
    expect(resolveDisplayName({ email: null, user_metadata: null })).toBeNull();
    // A one-character local part is not a name.
    expect(resolveDisplayName({ email: 'a@example.com' })).toBeNull();
    // Digits only, after cleaning, leaves nothing.
    expect(resolveDisplayName({ email: '4815162342@example.com' })).toBeNull();
  });

  it('ignores blank and non-string metadata instead of throwing', () => {
    expect(resolveDisplayName({ user_metadata: { full_name: '   ' }, email: null })).toBeNull();
    expect(resolveDisplayName({ user_metadata: { full_name: 42 }, email: null })).toBeNull();
  });
});

describe('greetingForHour', () => {
  it('splits the day at noon and six', () => {
    expect(greetingForHour(0)).toBe('morning');
    expect(greetingForHour(11)).toBe('morning');
    expect(greetingForHour(12)).toBe('afternoon');
    expect(greetingForHour(17)).toBe('afternoon');
    expect(greetingForHour(18)).toBe('evening');
    expect(greetingForHour(23)).toBe('evening');
  });
});
