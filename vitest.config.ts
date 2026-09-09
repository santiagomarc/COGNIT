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
      // functions dropped 30.3 -> 29.2 when the migration-fallback paths were
      // deleted: legacy-mastery.ts was 83% covered, so removing it took more
      // covered functions out than uncovered ones. A ratchet down for dead-code
      // removal, not for test rot.
      //
      // Raised at the close of the redesign programme: the navigation phase
      // added `command-palette.ts` with 16 tests, which moved the measured
      // figures to lines 34.96 / functions 31.81 / branches 35.14.
      thresholds: { lines: 34, functions: 31, branches: 35 },
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
