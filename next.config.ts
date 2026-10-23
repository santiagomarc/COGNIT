import type { NextConfig } from "next";
import { buildBaselineCsp, NON_NONCE_ROUTES_SOURCE } from "./src/lib/csp";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // pdf-parse and pdfjs-dist use native Node.js APIs and dynamic requires
  // that break when Turbopack tries to bundle them. Keep them external.
  // @napi-rs/canvas is native (pdf-parse/worker's DOMMatrix polyfill).
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  experimental: {
    serverActions: {
      // The largest Server Action body is a bulk import: 200 cards of up to
      // 3,000 characters, which as non-Latin UTF-8 can pass the 1 MB default.
      // PDFs no longer come this way: they go to /api/generate, a route
      // handler outside the proxy's matcher (performance plan AI-18).
      bodySizeLimit: '4mb',
    },
    /*
     * How long the client router keeps a dynamic page it has already rendered.
     * The default is zero, so back/forward and re-visiting a deck all pay a
     * fresh server render. Thirty seconds makes returning to a page you just
     * left instant. It is safe because every mutating server action calls
     * `revalidatePath`, which purges this cache — a write is never followed by
     * a stale read.
     */
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    let supabaseOrigin = 'https://*.supabase.co';
    try {
      supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
    } catch {
      // keep the wildcard
    }
    const baseline = buildBaselineCsp({ supabaseOrigin, dev: process.env.NODE_ENV !== 'production' });

    return [
      {
        // Not on the nonce routes: there the proxy sets the only CSP. On
        // Vercel this header is also copied onto the request Next renders
        // from, over the proxy's, and would hide the nonce (src/lib/csp.ts).
        source: NON_NONCE_ROUTES_SOURCE,
        headers: [{ key: 'Content-Security-Policy', value: baseline }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
