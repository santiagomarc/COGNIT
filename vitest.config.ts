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
      // Deliberately modest: high enough to catch regressions in the paths that
      // matter, low enough that nobody is tempted to game it with assertion-free
      // tests. Raise it when the coverage is real, not to make a number look good.
      thresholds: { lines: 45, functions: 55, branches: 60 },
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
