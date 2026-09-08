import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // @vitest/coverage-v8 is pinned to the exact vitest version: it declares an
    // exact peer, and installing it by range re-resolves vitest itself.
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/app/actions/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/lib/database.types.ts', 'src/test/**'],
      // Ratchet thresholds: set to current measured baseline so CI passes
      // and blocks regressions. Crank them up as test coverage expands.
      thresholds: { lines: 33, functions: 30, branches: 32 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a Next.js build-time guard with no runtime behaviour
      // and is not resolvable outside the Next build.
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
});
