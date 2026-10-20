const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist-renderer/**', 'dist/**', 'node_modules/**', 'build/**', 'docs/**'] },
  js.configs.recommended,
  {
    // proceso principal de Electron y pruebas: CommonJS en Node
    files: ['main/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // interfaz: módulos ES en el navegador
    files: ['src/**/*.js', 'vite.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
