import js from '@eslint/js';
import tseslint from 'typescript-eslint';
// Its globSync resolver uses the scoped tinyglobby alias in package.json, without braces.
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'public/ocr/**', 'public/pdf/**', 'output/**', 'test-results/**', 'playwright-report/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: { ...nextPlugin.configs['core-web-vitals'].rules },
  },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly', process: 'readonly', Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', URL: 'readonly', crypto: 'readonly', fetch: 'readonly', Uint8Array: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', Blob: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
