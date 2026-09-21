import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
import react from 'eslint-plugin-react';
export default [{ ignores: ['dist'] }, { files: ['**/*.{js,jsx}'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { react, 'react-hooks': hooks, 'react-refresh': refresh }, rules: { ...hooks.configs.recommended.rules, ...refresh.configs.vite.rules, 'react/jsx-uses-vars': 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }];
