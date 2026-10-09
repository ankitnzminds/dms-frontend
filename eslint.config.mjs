import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// eslint-config-next already registers eslint-plugin-jsx-a11y (a11y rules for JSX).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react/no-danger': 'error',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'node_modules/**',
    'src/lib/api-client/schema.d.ts',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);
