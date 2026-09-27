import { describe, expect, it } from 'vitest';
import {
  checkCreateCard,
  checkCreateDeck,
  checkLogin,
  checkResetPassword,
  checkSignup,
  checkUpdatePassword,
  type Checked,
} from '@/lib/form-checks';
import {
  createCardSchema,
  createDeckSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updatePasswordSchema,
} from '@/lib/schemas';

/*
 * The client checks must say exactly what the server's zod schemas say:
 * same pass/fail, same field errors in the same order, same parsed data.
 */
type SafeParse = { success: true; data: unknown } | { success: false; error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } } };

function asChecked(result: SafeParse): Checked<unknown> {
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors = Object.fromEntries(
    Object.entries(result.error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1])),
  );
  return { ok: false, fieldErrors };
}

const EMAILS = ['', 'student@example.com', ' Student@Example.COM ', 'not-an-email', 'a@b', 'x..y@example.com', '.lead@example.com', 'first.last+tag@sub.example.org'];
const PASSWORDS = ['', 'short', 'alllowercase1', 'ALLUPPERCASE1', 'NoDigitsHere', 'Valid1password', `A1${'a'.repeat(71)}`];
const UUIDS = ['6f1c2a4e-0000-4000-8000-000000000001', 'not-a-uuid', '', '6F1C2A4E-0000-4000-8000-000000000001'];

describe('client form checks match the zod schemas (plan §5.6, PERF-02)', () => {
  it('login and reset password', () => {
    for (const email of EMAILS) {
      expect(checkResetPassword({ email })).toEqual(asChecked(resetPasswordSchema.safeParse({ email }) as SafeParse));
      for (const password of ['', 'anything']) {
        expect(checkLogin({ email, password })).toEqual(asChecked(loginSchema.safeParse({ email, password }) as SafeParse));
      }
    }
  });

  it('signup: every password rule, with every message zod reports', () => {
    for (const email of EMAILS) {
      for (const password of PASSWORDS) {
        expect(checkSignup({ email, password })).toEqual(asChecked(signupSchema.safeParse({ email, password }) as SafeParse));
      }
    }
  });

  it('update password, including the match check (which zod runs even when a field has failed)', () => {
    for (const password of PASSWORDS) {
      for (const confirmPassword of ['', password, 'Different1pass']) {
        expect(checkUpdatePassword({ password, confirmPassword })).toEqual(
          asChecked(updatePasswordSchema.safeParse({ password, confirmPassword }) as SafeParse),
        );
      }
    }
  });

  it('create card', () => {
    for (const deck_id of UUIDS) {
      for (const [front, back] of [['', ''], ['Q', 'A'], ['Q'.repeat(1001), 'A'.repeat(2001)], ['Q', '']]) {
        expect(checkCreateCard({ deck_id, front, back })).toEqual(asChecked(createCardSchema.safeParse({ deck_id, front, back }) as SafeParse));
      }
    }
  });

  it('create deck, with its trimmed title and lowercased tag', () => {
    for (const title of ['', 'ab', '  Biology  ', 'Organic chemistry']) {
      for (const accent_tag of [undefined, '', 'BIOLOGY', 'not-a-tag']) {
        const input = { title, ...(accent_tag === undefined ? {} : { accent_tag }), is_public: false };
        expect(checkCreateDeck({ title, accent_tag })).toEqual(asChecked(createDeckSchema.safeParse(input) as SafeParse));
      }
    }
  });
});
