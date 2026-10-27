import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/coverage/**', 'docs/reference/**', 'mobile/src/api/generated/**'] },
  {
    files: ['mobile/src/**/*.{ts,tsx}', 'shared/**/*.ts', 'dev-server/src/**/*.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': hooks },
    rules: {
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
