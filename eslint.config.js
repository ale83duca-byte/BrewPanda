import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tseslintParser from "@typescript-eslint/parser";

import pluginReactRefresh from "eslint-plugin-react-refresh";
import hooksPlugin from 'eslint-plugin-react-hooks';

export default [
  pluginJs.configs.recommended,
  {
    ignores: ['dist/**', 'service-worker.js'],
  },
  {
    files: ['**/*.config.js'],
    ...pluginJs.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.config.ts'],
    languageOptions: {
      parser: tseslintParser,
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{ts,tsx}', '!**/*.config.js', '!**/*.config.ts'],
    languageOptions: {
      globals: globals.browser,
      parser: tseslintParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-refresh': pluginReactRefresh,
      'react-hooks': hooksPlugin,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

];
