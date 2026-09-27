import { DECK_TAG_VALUES } from '@/lib/deck-tags';

/*
 * Client-side form checks without zod (plan §5.6, PERF-02).
 *
 * Four client forms used to import `@/lib/schemas`, which carried the whole of
 * zod into the login and shell bundles. The server actions revalidate every
 * input with those schemas anyway, so the browser only needs the fast,
 * friendly first pass: the same rules and the same messages, hand-written.
 * `form-checks.test.ts` runs each check against its zod schema on the same
 * inputs, so the two cannot drift apart silently.
 */

export type FieldErrors = Record<string, string[]>;
export type Checked<T> = { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors };

/** zod v4's `z.email()` pattern, so the browser accepts exactly what the server will. */
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
/** zod v4's `z.uuid()`: RFC 9562 versions 1–8 and the nil/max UUIDs. */
const UUID = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

/** Collects every failing rule per field, in order — what zod's `flatten().fieldErrors` reports. */
class Collector {
  readonly errors: FieldErrors = {};

  add(field: string, failed: boolean, message: string) {
    if (!failed) return;
    (this.errors[field] ??= []).push(message);
  }

  result<T>(data: T): Checked<T> {
    return Object.keys(this.errors).length > 0 ? { ok: false, fieldErrors: this.errors } : { ok: true, data };
  }
}

function checkEmail(errors: Collector, email: string) {
  errors.add('email', email.length < 1, 'Email is required');
  errors.add('email', !EMAIL.test(email), 'Please enter a valid email address');
}

function checkNewPassword(errors: Collector, password: string) {
  errors.add('password', password.length < 8, 'Password must be at least 8 characters');
  errors.add('password', password.length > 72, 'Password must be less than 72 characters');
  errors.add('password', !/[a-z]/.test(password), 'Password must contain a lowercase letter');
  errors.add('password', !/[A-Z]/.test(password), 'Password must contain an uppercase letter');
  errors.add('password', !/[0-9]/.test(password), 'Password must contain a number');
}

/** `loginSchema`. */
export function checkLogin(input: { email: string; password: string }): Checked<{ email: string; password: string }> {
  const errors = new Collector();
  checkEmail(errors, input.email);
  errors.add('password', input.password.length < 1, 'Password is required');
  return errors.result({ email: input.email.toLowerCase().trim(), password: input.password });
}

/** `signupSchema`. */
export function checkSignup(input: { email: string; password: string }): Checked<{ email: string; password: string }> {
  const errors = new Collector();
  checkEmail(errors, input.email);
  checkNewPassword(errors, input.password);
  return errors.result({ email: input.email.toLowerCase().trim(), password: input.password });
}

/** `resetPasswordSchema`. */
export function checkResetPassword(input: { email: string }): Checked<{ email: string }> {
  const errors = new Collector();
  checkEmail(errors, input.email);
  return errors.result({ email: input.email.toLowerCase().trim() });
}

/** `updatePasswordSchema`. zod v4 runs the `.refine` match check even when a field has already failed. */
export function checkUpdatePassword(input: { password: string; confirmPassword: string }): Checked<{ password: string; confirmPassword: string }> {
  const errors = new Collector();
  checkNewPassword(errors, input.password);
  errors.add('confirmPassword', input.confirmPassword.length < 1, 'Please confirm your password');
  errors.add('confirmPassword', input.password !== input.confirmPassword, 'Passwords do not match');
  return errors.result(input);
}

/** `createCardSchema`, for the fields the add-card form sends; `source` defaults as the schema's does. */
export function checkCreateCard(input: { deck_id: string; front: string; back: string }): Checked<{ deck_id: string; front: string; back: string; source: 'manual' }> {
  const errors = new Collector();
  errors.add('deck_id', !UUID.test(input.deck_id), 'Invalid deck id');
  errors.add('front', input.front.length < 1, 'Question is required');
  errors.add('front', input.front.length > 1000, 'Too big: expected string to have <=1000 characters');
  errors.add('back', input.back.length < 1, 'Answer is required');
  errors.add('back', input.back.length > 2000, 'Too big: expected string to have <=2000 characters');
  return errors.result({ ...input, source: 'manual' as const });
}

/** `createDeckSchema`, for the fields the create-deck dialog sends. */
export function checkCreateDeck(input: { title: string; accent_tag?: string }): Checked<{ title: string; accent_tag?: string; is_public: boolean }> {
  const errors = new Collector();
  const title = input.title.trim();
  const accentTag = input.accent_tag === undefined ? undefined : input.accent_tag.trim().toLowerCase();
  errors.add('title', title.length < 3, 'Title must be at least 3 characters long');
  errors.add(
    'accent_tag',
    Boolean(accentTag) && !DECK_TAG_VALUES.includes(accentTag as (typeof DECK_TAG_VALUES)[number]),
    'Select a valid deck tag',
  );
  return errors.result({ title, ...(accentTag === undefined ? {} : { accent_tag: accentTag }), is_public: false });
}
