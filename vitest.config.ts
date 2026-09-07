import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // Requires a one-time `npm install -D @vitest/coverage-v8`. Left configured
    // but uninstalled: adding it to package.json without a matching
    // package-lock.json entry would break `npm ci`, and the local node_modules
    // tree currently rejects `npm install` (see README → Troubleshooting).
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
