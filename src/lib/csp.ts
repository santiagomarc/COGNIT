import { createHash } from 'node:crypto';
import { THEME_BOOTSTRAP } from './theme-script';

/*
 * Content-Security-Policy (plan §6.2). Three policies:
 *
 *   baseline  every route that is NOT a nonce route, from next.config.ts:
 *             `script-src 'self' 'unsafe-inline'`. Prerendered routes (/, the
 *             static login pages) are built once and cannot carry a
 *             per-request nonce.
 *   strict    nonce routes (/dashboard, /s/): `'nonce-…' 'strict-dynamic'`
 *             and no 'unsafe-inline' for scripts; the theme bootstrap is
 *             allowed by hash.
 *   bridge    nonce routes until CSP_ENFORCE: enforces exactly what the
 *             baseline enforces, but carries the nonce (see buildBridgeCsp).
 *
 * How Next finds the nonce, measured on Vercel with a probe (2026-09-29):
 * the render reads the REQUEST's `content-security-policy`, falling back to
 * `-report-only`. Every response header the proxy sets is copied onto that
 * request (on `next start` too), and on Vercel so is every next.config.ts /
 * vercel.json header — after, and over, the proxy's own request override.
 * So whatever policy a nonce route ENFORCES is the one Next reads the nonce
 * from. The baseline therefore stays off nonce routes (NONCE_ROUTES_SOURCE),
 * and the proxy is the one source of CSP there.
 *
 * Styles keep 'unsafe-inline': React `style={…}` attributes are everywhere
 * and a nonce cannot cover attributes.
 */

const THEME_HASH = `'sha256-${createHash('sha256').update(THEME_BOOTSTRAP).digest('base64')}'`;

/** Route prefixes rendered per request, so their HTML can carry the nonce. */
export const NONCE_ROUTES = ['/dashboard', '/s/'] as const;

/**
 * next.config.ts `headers()` source for every path EXCEPT the nonce routes,
 * matching wantsNonce(): `/dashboard`, `/dashboard/…` and `/s/…`.
 */
export const NON_NONCE_ROUTES_SOURCE = '/:path((?!dashboard(?:/|$)|s/).*)';

export const CSP_ENFORCE = process.env.CSP_ENFORCE === 'true';

export function wantsNonce(pathname: string): boolean {
  return NONCE_ROUTES.some((prefix) => (prefix.endsWith('/')
    ? pathname.startsWith(prefix)
    : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

type PolicyOptions = { supabaseOrigin: string; dev: boolean };

/** Everything but the script directives, shared by all three policies. */
function otherDirectives(options: PolicyOptions): string[] {
  return [
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${options.supabaseOrigin} https://*.supabase.co wss://*.supabase.co`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
}

// 'unsafe-eval' is required by the Turbopack dev runtime and React Refresh;
// a production build needs neither.
const evalSource = (dev: boolean) => (dev ? " 'unsafe-eval'" : '');

export function buildBaselineCsp(options: PolicyOptions): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${evalSource(options.dev)}`,
    ...otherDirectives(options),
  ].join('; ');
}

export function buildStrictCsp(options: PolicyOptions & { nonce: string }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic' ${THEME_HASH}${evalSource(options.dev)}`,
    ...otherDirectives(options),
    'report-uri /api/csp-report',
  ].join('; ');
}

/**
 * The baseline, enforced on a nonce route during the report-only week, in a
 * form Next can read the nonce from.
 *
 * Browsers take `<script>` elements from `script-src-elem` and inline event
 * handlers from `script-src-attr` — both `'self' 'unsafe-inline'` as in the
 * baseline — so what is enforced does not change. Next reads the nonce from
 * the FIRST directive whose name starts with `script-src`, which is the
 * nonce-carrying `script-src` (it now governs only eval and workers, as
 * before). A browser without `-elem` (pre-2022) enforces that `script-src`
 * instead, where the nonce voids 'unsafe-inline' — every script it would meet
 * is nonced, from 'self', or the hashed theme bootstrap.
 */
export function buildBridgeCsp(options: PolicyOptions & { nonce: string }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'unsafe-inline' ${THEME_HASH}${evalSource(options.dev)}`,
    "script-src-elem 'self' 'unsafe-inline'",
    "script-src-attr 'unsafe-inline'",
    ...otherDirectives(options),
  ].join('; ');
}

/**
 * The response headers the proxy sets on a nonce route, which it also puts
 * on the request it forwards. Until CSP_ENFORCE: the bridge enforces and the
 * strict policy reports. After: the strict policy enforces alone.
 */
export function nonceRouteCsp(options: PolicyOptions & { nonce: string; enforce: boolean }): Record<string, string> {
  const strict = buildStrictCsp(options);
  return options.enforce
    ? { 'Content-Security-Policy': strict }
    : { 'Content-Security-Policy': buildBridgeCsp(options), 'Content-Security-Policy-Report-Only': strict };
}
