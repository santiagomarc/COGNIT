import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // pdf-parse and pdfjs-dist use native Node.js APIs and dynamic requires
  // that break when Turbopack tries to bundle them. Keep them external.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
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
  },
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co';
    let supabaseHost = '';
    try {
      supabaseHost = new URL(supabaseUrl).origin;
    } catch {
      supabaseHost = 'https://*.supabase.co';
    }

    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${supabaseHost} https://*.supabase.co wss://*.supabase.co`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
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
