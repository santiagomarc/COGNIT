'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
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

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const results = useMemo(
    () => rules.map((r) => ({ ...r, passed: r.test(password) })),
    [password]
  );

  const passedCount = results.filter((r) => r.passed).length;
  const strength = passedCount / rules.length; // 0 to 1

  const barColor =
    strength <= 0.25
      ? 'bg-destructive'
      : strength <= 0.5
        ? 'bg-orange-500'
        : strength <= 0.75
          ? 'bg-yellow-500'
          : 'bg-emerald-500';

  const label =
    strength <= 0.25
      ? 'Weak'
      : strength <= 0.5
        ? 'Fair'
        : strength <= 0.75
          ? 'Good'
          : 'Strong';

  if (!password) return null;

  return (
    <div className="space-y-2.5">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Password strength</span>
          <span
            className={`font-medium ${
              strength <= 0.25
                ? 'text-destructive'
                : strength <= 0.5
                  ? 'text-orange-500'
                  : strength <= 0.75
                    ? 'text-yellow-500'
                    : 'text-emerald-500'
            }`}
          >
            {label}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
          <motion.div
            className={`h-full rounded-full ${barColor}`}
            initial={{ width: 0 }}
            animate={{ width: `${strength * 100}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          />
        </div>
      </div>

      {/* Requirement checklist */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {results.map((rule) => (
          <li key={rule.label} className="flex items-center gap-1.5 text-xs">
            {rule.passed ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground/50" />
            )}
            <span
              className={
                rule.passed ? 'text-emerald-500' : 'text-muted-foreground/60'
              }
            >
              {rule.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
