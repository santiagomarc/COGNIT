import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    // Tests assert on mocked clients (`expect(client.rpc).toHaveBeenCalled`),
    // where a bare `.rpc` reference is the point.
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // supabase.rpc() reads `this.rest` internally. Detaching it — by
      // aliasing, destructuring, or casting it to a bare function type —
      // type-checks and builds cleanly, then throws "Cannot read properties
      // of undefined (reading 'rest')" the first time it runs. Six call sites
      // shipped that way once already.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='rpc']:not(CallExpression > MemberExpression.callee)",
          message: 'Call supabase.rpc(...) directly. Aliasing or casting it detaches `this` and crashes at runtime.',
        },
        {
          selector: "ObjectPattern > Property[key.name='rpc']",
          message: 'Do not destructure `rpc` off the Supabase client. It detaches `this` and crashes at runtime.',
        },
      ],
    },
  },
  {
    files: ['src/app/actions/**/*.ts', 'src/app/api/**/*.ts', 'src/lib/**/*.ts'],
    ignores: ['**/*.test.ts', 'src/lib/logger.ts'],
    rules: {
      'no-console': 'error',
    },
  },
]);

export default eslintConfig;
