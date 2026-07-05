/**
 * @file eslint.config.js
 * @description ESLint flat config for the client: JS recommended rules plus the
 * React Hooks rules (catch missing effect deps) and React Refresh rules (catch
 * exports that would break Vite HMR). Server linting is separate and does not
 * exist yet — see todo.md Group 8 #5.
 */
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist is generated output — linting it would only report noise.
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
