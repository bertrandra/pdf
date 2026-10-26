// Configuration a plat (ESLint 9) : aucun `any` dans le moteur, aucune
// assertion `!`, aucune fonction de plus de 150 lignes.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json', ecmaVersion: 2022, sourceType: 'module' },
      globals: { console: 'readonly' }
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Une promesse laissee sans .catch() fait disparaitre une erreur en silence (lecon de Plan).
      '@typescript-eslint/no-floating-promises': 'error',
      // TypeScript verifie deja l'existence des identifiants, et mieux.
      'no-undef': 'off'
    }
  },
  {
    // Le moteur ne connait pas `any`, et aucun `eslint-disable` n'y est admis.
    files: ['src/model/**/*.ts', 'src/engine/**/*.ts', 'src/geometry/**/*.ts'],
    linterOptions: { noInlineConfig: true },
    rules: { '@typescript-eslint/no-explicit-any': 'error' }
  },
  {
    // Aucune assertion `!` : un `!` affirme ce que le compilateur ne peut pas prouver et laisse passer
    // `undefined` s'il se trompe ; `au` (util/tableaux.ts) leve une RangeError nommee.
    // Aucune fonction de plus de 150 lignes, sans exception.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      'max-lines-per-function': ['error', { max: 150 }]
    }
  },
  {
    // Les tests s'executent sous Node.
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { __dirname: 'readonly', process: 'readonly' } }
  }
];
