import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildStrictCsp, newNonce, strictCspHeaders, wantsNonce } from './csp';
import { THEME_BOOTSTRAP } from './theme-script';

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

describe('strictCspHeaders', () => {
  it('reports until enforcement is switched on, and sends the same policy Next reads', () => {
    const reporting = strictCspHeaders({ ...base, enforce: false });
    expect(reporting.responseName).toBe('Content-Security-Policy-Report-Only');
    expect(reporting.request).toBe(reporting.response);

    expect(strictCspHeaders({ ...base, enforce: true }).responseName).toBe('Content-Security-Policy');
  });
});

describe('newNonce', () => {
  it('is fresh per call and safe inside a quoted CSP source', () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
