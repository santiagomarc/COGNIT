const PROVIDER_NAMES: Record<string, string> = {
  email: 'Email and password',
  google: 'Google',
  github: 'GitHub',
};

/**
 * The account's sign-in methods in words, for Settings → Sign-in & security
 * (sidebar plan §5.3): "Google", or "Email and password and GitHub". An
 * unknown provider id is shown as-is rather than hidden.
 */
export function providerLine(providers: readonly string[]): string {
  const names = [...new Set(providers)].map((provider) => PROVIDER_NAMES[provider] ?? provider);
  if (names.length === 0) return 'Unknown';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Only an account with the `email` provider has a password to reset. */
export function hasPassword(providers: readonly string[]): boolean {
  return providers.includes('email');
}
