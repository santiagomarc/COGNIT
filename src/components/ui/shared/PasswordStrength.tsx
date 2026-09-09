'use client';

import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

type PasswordStrengthProps = {
  password: string;
};

const rules = [
  { label: '8+ characters', test: (p: string) => p.length >= 8 },
  { label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number', test: (p: string) => /[0-9]/.test(p) },
];

/*
 * Strength runs along the state channel (§2.2) rather than introducing a
 * palette of its own. The meter used `bg-orange-500`, `bg-yellow-500` and
 * `bg-emerald-500` — three raw Tailwind hues that exist nowhere else in the
 * product and do not shift between themes, so "Good" was a 3.0:1 yellow on
 * white. These are the scheduler's own colours, which are AA as text in both.
 */
const TIERS = [
  { label: 'Weak', token: 'var(--state-lapsed)' },
  { label: 'Fair', token: 'var(--state-due)' },
  { label: 'Good', token: 'var(--state-learning)' },
  { label: 'Strong', token: 'var(--state-mastered)' },
] as const;

/**
 * Password strength (design system §2.2, §9).
 *
 * Colour is never the only carrier of meaning here, and now it is not even the
 * primary one: strength is read from **how many of four segments are filled**,
 * confirmed by a word, and itemised by a checklist whose state is a glyph
 * (check / close) as well as a tint. A user who sees no colour at all still
 * gets position, a word, and four labelled pass/fail rows.
 */
export function PasswordStrength({ password }: PasswordStrengthProps) {
  const results = useMemo(
    () => rules.map((r) => ({ ...r, passed: r.test(password) })),
    [password]
  );

  const passedCount = results.filter((r) => r.passed).length;

  if (!password) return null;

  const tier = TIERS[Math.max(passedCount - 1, 0)];

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Password strength</span>
          {/* Announced on change, so the meter is not a visual-only signal. */}
          <span role="status" aria-live="polite" className="font-medium" style={{ color: tier.token }}>
            {tier.label}
            <span className="ml-1.5 font-mono tnum text-ink-dimmer">{passedCount}/4</span>
          </span>
        </div>

        {/* Four segments — position carries the reading, colour confirms it. */}
        <div className="flex gap-1" aria-hidden="true">
          {rules.map((rule, index) => (
            <div
              key={rule.label}
              className="h-1.5 flex-1 rounded-[var(--radius-control)]"
              style={{
                backgroundColor: index < passedCount ? tier.token : 'var(--border)',
              }}
            />
          ))}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {results.map((rule) => (
          <li key={rule.label} className="flex items-center gap-1.5 text-xs">
            {rule.passed ? (
              <Check className="h-3 w-3 shrink-0" style={{ color: 'var(--state-mastered)' }} aria-hidden="true" />
            ) : (
              <X className="h-3 w-3 shrink-0 text-ink-dimmer" aria-hidden="true" />
            )}
            <span className={rule.passed ? 'text-ink' : 'text-muted-foreground'}>
              {rule.label}
            </span>
            <span className="sr-only">{rule.passed ? '— met' : '— not met'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
