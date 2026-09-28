import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { tryToParsePath } from 'next/dist/lib/try-to-parse-path';
import { getScriptNonceFromHeader } from 'next/dist/server/app-render/get-script-nonce-from-header';
import {
  NON_NONCE_ROUTES_SOURCE,
  buildBaselineCsp,
  buildBridgeCsp,
  buildStrictCsp,
  newNonce,
  nonceRouteCsp,
  wantsNonce,
} from './csp';
import { THEME_BOOTSTRAP } from './theme-script';

const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.split(' ')[0] === name);

const base = { nonce: 'abc123', supabaseOrigin: 'https://proj.supabase.co', dev: false };

describe('wantsNonce', () => {
  it('matches the dashboard tree and share pages, and nothing that merely shares a prefix', () => {
    expect(wantsNonce('/dashboard')).toBe(true);
    expect(wantsNonce('/dashboard/stats')).toBe(true);
    expect(wantsNonce('/s/token-1')).toBe(true);
    expect(wantsNonce('/dashboards')).toBe(false);
    expect(wantsNonce('/s')).toBe(false);
    expect(wantsNonce('/')).toBe(false);
    expect(wantsNonce('/login')).toBe(false);
  });
});

describe('buildStrictCsp', () => {
  it('allows scripts by nonce and strict-dynamic only, never unsafe-inline', () => {
    const policy = buildStrictCsp(base);
    const scriptSrc = policy.split('; ').find((directive) => directive.startsWith('script-src'));
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(policy).toContain('report-uri /api/csp-report');
  });

  it('allows the theme bootstrap by the hash of the exact string the layout renders', () => {
    const hash = createHash('sha256').update(THEME_BOOTSTRAP).digest('base64');
    expect(buildStrictCsp(base)).toContain(`'sha256-${hash}'`);
  });

  it('adds unsafe-eval in development only, for the Turbopack runtime', () => {
    expect(buildStrictCsp({ ...base, dev: true })).toContain("'unsafe-eval'");
  });
});

describe('NON_NONCE_ROUTES_SOURCE', () => {
  it("is wantsNonce's complement under the regex Next writes to the routes manifest", () => {
    const { regexStr, error } = tryToParsePath(NON_NONCE_ROUTES_SOURCE);
    expect(error).toBeFalsy();
    const matches = new RegExp(regexStr!);
    const paths = ['/', '/login', '/login/update-password', '/explore', '/dashboard', '/dashboard/stats',
      '/dashboard/abc/synthesis', '/dashboards', '/s', '/s/token-1', '/sitemap.xml'];
    for (const path of paths) expect(matches.test(path), path).toBe(!wantsNonce(path));
  });
});

describe('buildBridgeCsp', () => {
  const bridge = buildBridgeCsp(base);

  it('gives Next the nonce — the render reads it from the enforced policy', () => {
    expect(getScriptNonceFromHeader(bridge)).toBe('abc123');
  });

  it('enforces what the baseline enforces on script elements and handlers', () => {
    const baselineScripts = directive(buildBaselineCsp(base), 'script-src')!.replace('script-src', '');
    expect(directive(bridge, 'script-src-elem')).toBe(`script-src-elem${baselineScripts}`);
    expect(directive(bridge, 'script-src-attr')).toBe("script-src-attr 'unsafe-inline'");
  });

  it('lists script-src first, since Next takes the first script-src* directive', () => {
    const names = bridge.split('; ').map((d) => d.split(' ')[0]);
    expect(names.findIndex((n) => n.startsWith('script-src'))).toBe(names.indexOf('script-src'));
  });

  it('allows the theme bootstrap by hash for browsers that fall back to script-src', () => {
    expect(directive(bridge, 'script-src')).toContain(directive(buildStrictCsp(base), 'script-src')!.match(/'sha256-[^']+'/)![0]);
  });
});

describe('nonceRouteCsp', () => {
  it('enforces the bridge and reports the strict policy until enforcement is switched on', () => {
    const headers = nonceRouteCsp({ ...base, enforce: false });
    expect(headers['Content-Security-Policy']).toBe(buildBridgeCsp(base));
    expect(headers['Content-Security-Policy-Report-Only']).toBe(buildStrictCsp(base));
  });

  it('then enforces the strict policy alone', () => {
    expect(nonceRouteCsp({ ...base, enforce: true })).toEqual({ 'Content-Security-Policy': buildStrictCsp(base) });
  });

  it('puts the nonce in whichever policy Next reads first, in both modes', () => {
    for (const enforce of [false, true]) {
      expect(getScriptNonceFromHeader(nonceRouteCsp({ ...base, enforce })['Content-Security-Policy'])).toBe('abc123');
    }
  });
});

describe('newNonce', () => {
  it('is fresh per call and safe inside a quoted CSP source', () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
