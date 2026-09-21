import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Live-model tests (execution plan D9): they call Gemini with the key in
 * `.env.local`, cost real (tiny) money, and are never part of `npm test`.
 * `npm run ai:smoke` runs one check-shaped call with the production config;
 * `npm run ai:calibrate` runs the §11.3 calibration set. Both skip cleanly
 * when no key is present.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/live/**/*.live.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
});
