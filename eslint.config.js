import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-server',
      'dev-dist',
      'dist-pages',
      'supabase/functions/api/index.js',
      'playwright-report',
      'test-results',
      'data',
      '.e2e-data',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['server/**/*.ts', 'scripts/**/*.mjs', 'tests/**/*.ts', '*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Os trechos passados a page.evaluate() rodam dentro do navegador.
    files: ['scripts/screenshots.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
