import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Non-type-aware on purpose: apps/api/prisma/seed*.ts sit outside tsconfig.include.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.next/**',
      'apps/api/prisma/migrations/**',
      'design/**',
      'docs/**',
      'resources/**',
      'infra/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    languageOptions: { globals: globals.jest },
    rules: {
      // tests mock Nest/passport internals (3 hits) and use require() for supertest/CJS interop (5 hits);
      // src stays strict. ponytail: spec-only relaxation -> fix in tests and drop if desired.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // apps/web: append next/core-web-vitals block here
  eslintConfigPrettier,
);
