import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/*
 * TEMPORARY diagnostic (plan §6.2, G3): which CSP request headers reach the
 * function behind the proxy on this platform. Reports each header's
 * script-src only — the same text the response headers already publish.
 * Delete once the nonce fix is verified on Vercel.
 */
function scriptSrc(value: string | null) {
  if (value === null) return null;
  return value.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) ?? '(no script-src)';
}

export function GET(request: NextRequest) {
  const h = request.headers;
  return NextResponse.json({
    'content-security-policy': scriptSrc(h.get('content-security-policy')),
    'content-security-policy-report-only': scriptSrc(h.get('content-security-policy-report-only')),
    'x-cognit-nonce': h.get('x-cognit-nonce') !== null,
    'middleware-headers': [...h.keys()].filter((k) => k.startsWith('x-middleware')),
  });
}
