import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // pdf-parse and pdfjs-dist use native Node.js APIs and dynamic requires
  // that break when Turbopack tries to bundle them. Keep them external.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  experimental: {
    serverActions: {
      // Default is 1MB — raise it so PDFs up to 10MB can be uploaded
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
