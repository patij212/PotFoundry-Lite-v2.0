import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'artifacts/**',
      '**/*.d.ts',
    ],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // TypeScript compiler enforces strictness in this repository.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
      'no-constant-condition': 'off',
      'no-extra-boolean-cast': 'off',
      'no-empty': 'off',
      // Start with a non-blocking baseline and tighten iteratively.
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      // Prevent new `any` from creeping in. Existing justified uses have eslint-disable comments.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Test files and webgpu_core.ts (under active refactor) are exempt from no-explicit-any.
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/webgpu_core.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
