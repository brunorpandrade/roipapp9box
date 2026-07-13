import stylistic from '@stylistic/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'next-env.d.ts'],
  },
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      // RV-14 — código minificado é proibido: auditável linha a linha.
      '@stylistic/max-len': ['error', { code: 100, ignoreUrls: true }],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
    },
  },
);
