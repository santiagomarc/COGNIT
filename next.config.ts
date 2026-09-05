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
};

export default nextConfig;
