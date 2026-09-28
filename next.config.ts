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
      // Both limits must sit ABOVE the app's own 10MB PDF cap
      // (MAX_PDF_BYTES in actions/ai-generate.ts). A multipart upload carries
      // form overhead on top of the file, so a limit of exactly 10mb rejects a
      // legitimate 10MB PDF at the transport layer — before the action can run
      // and return its friendly "PDF must be under 10 MB." message.
      bodySizeLimit: '12mb',
    },
    // proxy.ts matches /dashboard/*, so it buffers every PDF upload body.
    // Its default 10MB cap silently truncates the stream, which surfaces as an
    // uncaught "Unexpected end of form" and a generic client-side failure.
    proxyClientMaxBodySize: '12mb',
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
