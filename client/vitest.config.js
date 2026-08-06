/**
 * @file vitest.config.js
 * @description Vitest configuration for the frontend. Intentionally minimal:
 * the only tests here today cover pure functions in src/lib, so there is no
 * jsdom environment, no setup files and no global setup. The server's config
 * carries all three because its suite shares one Postgres database — none of
 * that applies to a function that takes two strings and returns one.
 *
 * Add `environment: 'jsdom'` (and the dependency) only when component tests
 * actually arrive. todo.md Group 8 #22.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
