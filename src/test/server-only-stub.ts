/**
 * Vitest stub for Next.js's `server-only` guard.
 *
 * That package exists purely to make a build fail if server code is imported
 * into a client bundle. It has no runtime behaviour, and it is not resolvable
 * outside the Next.js build, so tests alias it here.
 */
export {};
