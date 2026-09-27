import { createHash } from 'node:crypto';
import { THEME_BOOTSTRAP } from './theme-script';

/*
 * Content-Security-Policy (plan §6.2). Two policies:
 *
 *   baseline  every route, from next.config.ts: `script-src 'self'
 *             'unsafe-inline'`. Prerendered routes (/, the static login
 *             pages) are built once and cannot carry a per-request nonce.
 *   strict    nonce routes (/dashboard, /s/): `'nonce-…' 'strict-dynamic'`
 *             and no 'unsafe-inline' for scripts. Next.js stamps the nonce on
 *             its own scripts when it finds it in the REQUEST's CSP header;
 *             the theme bootstrap is allowed by hash.
 *
 * Rollout (CSP_ENFORCE): until it is 'true', every route keeps ENFORCING the
 * baseline and nonce routes additionally REPORT the strict policy; after it,
 * nonce routes ENFORCE the strict policy, which replaces the same-named
 * baseline header there (measured on `next start`).
 *
 * Styles keep 'unsafe-inline': React `style={…}` attributes are everywhere
 * and a nonce cannot cover attributes.
 */

const THEME_HASH = `'sha256-${createHash('sha256').update(THEME_BOOTSTRAP).digest('base64')}'`;

/** Route prefixes rendered per request, so their HTML can carry the nonce. */
export const NONCE_ROUTES = ['/dashboard', '/s/'] as const;

export const CSP_ENFORCE = process.env.CSP_ENFORCE === 'true';

export function wantsNonce(pathname: string): boolean {
  return NONCE_ROUTES.some((prefix) => (prefix.endsWith('/')
    ? pathname.startsWith(prefix)
    : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

export function buildStrictCsp(options: { nonce: string; supabaseOrigin: string; dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic' ${THEME_HASH}${options.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${options.supabaseOrigin} https://*.supabase.co wss://*.supabase.co`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'report-uri /api/csp-report',
  ].join('; ');
}

/**
 * What the proxy sets on a nonce route: the REQUEST header Next reads to
 * stamp its scripts, and the one RESPONSE header for the strict policy —
 * report-only until CSP_ENFORCE, enforcing after.
 *
 * Measured on `next start`: Next also reads the nonce from an enforcing CSP
 * the proxy sets on the response, so the proxy must never set a nonce-less
 * enforcing header on a nonce route. That is why the baseline lives in
 * next.config.ts, not here.
 */
export function strictCspHeaders(options: { nonce: string; supabaseOrigin: string; dev: boolean; enforce: boolean }) {
  const strict = buildStrictCsp(options);
  return {
    request: strict,
    responseName: options.enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
    response: strict,
  };
}
