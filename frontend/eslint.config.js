// EgoPay frontend linting — deliberately narrow.
//
// The point of this config is to prevent effect-dependency regressions of the
// kind that caused the Dashboard's infinite fetch loop (an effect keyed on a
// freshly-created object identity instead of a stable primitive id):
//
//   react-hooks/exhaustive-deps (error)
//     Every value referenced inside an effect must appear in its dependency
//     list, and any function/object dependency must be memoized or keyed by a
//     stable primitive (an id, not the object). This is enforced as an error
//     so a regression fails `npm run lint` instead of shipping.
//
//   react-hooks/rules-of-hooks (error)
//     Hooks only called from components/hooks, at the top level.
//
// Identity-churn loops have a second, structural half that no stock rule can
// fully see (an effect may legitimately list a context object AND update it):
// AuthContext's account/customer setters therefore preserve object identity
// when the data is unchanged, so effects keyed on those objects cannot loop.
//
// Scope is limited to `src`; dist output and config files are not linted.
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['dist', 'node_modules', 'public'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
