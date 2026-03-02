'use server';

import { createClient } from '@/lib/supabase/server';
import {
  loginSchema,
  type LoginInput,
  signupSchema,
  type SignupInput,
  resetPasswordSchema,
  type ResetPasswordInput,
  updatePasswordSchema,
  type UpdatePasswordInput,
} from '@/lib/schemas';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

// ─── Sanitized error messages ───
// Never leak internal Supabase errors to the client.
// Map known error codes to user-friendly messages.
const AUTH_ERROR_MAP: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  email_not_confirmed: 'Please check your email and confirm your account first.',
  user_already_exists: 'An account with this email already exists.',
  over_email_send_rate_limit: 'Too many attempts. Please wait a minute and try again.',
  weak_password: 'Password is too weak. Please choose a stronger password.',
  same_password: 'New password must be different from your current password.',
  email_address_invalid: 'Please enter a valid email address.',
};

function sanitizeAuthError(error: { message: string; code?: string }): string {
  // Check by error code first (most reliable)
  if (error.code && AUTH_ERROR_MAP[error.code]) {
    return AUTH_ERROR_MAP[error.code];
  }
  // Fallback: check if message contains known phrases
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return AUTH_ERROR_MAP.invalid_credentials;
  }
  if (msg.includes('email not confirmed')) {
    return AUTH_ERROR_MAP.email_not_confirmed;
  }
  if (msg.includes('already registered') || msg.includes('already exists')) {
    return AUTH_ERROR_MAP.user_already_exists;
  }
  if (msg.includes('rate') || msg.includes('too many')) {
    return AUTH_ERROR_MAP.over_email_send_rate_limit;
  }
  // Generic fallback — never leak raw error
  return 'Something went wrong. Please try again.';
}

// ─── LOGIN ───
export async function login(data: LoginInput) {
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: sanitizeAuthError(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

// ─── SIGNUP ───
export async function signup(data: SignupInput) {
  const parsed = signupSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // Resolve the callback URL on the server (not from client's window.location)
  const headerStore = await headers();
  const origin = headerStore.get('origin') || headerStore.get('x-forwarded-host') || '';
  const protocol = headerStore.get('x-forwarded-proto') || 'https';
  const baseUrl = origin.startsWith('http') ? origin : `${protocol}://${origin}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: sanitizeAuthError(error) };
  }

  return { success: true, message: 'Check your email for a confirmation link!' };
}

// ─── FORGOT PASSWORD ───
export async function resetPassword(data: ResetPasswordInput) {
  const parsed = resetPasswordSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const headerStore = await headers();
  const origin = headerStore.get('origin') || headerStore.get('x-forwarded-host') || '';
  const protocol = headerStore.get('x-forwarded-proto') || 'https';
  const baseUrl = origin.startsWith('http') ? origin : `${protocol}://${origin}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${baseUrl}/auth/callback?next=/login/update-password`,
  });

  if (error) {
    return { error: sanitizeAuthError(error) };
  }

  // Always return success even if email doesn't exist (prevent email enumeration)
  return { success: true, message: 'If an account exists with that email, you will receive a password reset link.' };
}

// ─── UPDATE PASSWORD (after reset link) ───
export async function updatePassword(data: UpdatePasswordInput) {
  const parsed = updatePasswordSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Verify the user has an active session (they clicked the reset link)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Your reset link has expired. Please request a new one.' };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: sanitizeAuthError(error) };
  }

  revalidatePath('/', 'layout');
  return { success: true, message: 'Password updated successfully!' };
}

// ─── LOGOUT ───
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
