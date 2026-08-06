/**
 * @file vitest.config.js
 * @description Vitest configuration for the backend API test suite. The
 * load-bearing choice: files run one at a time, because they share one test
 * database.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        // API tests against a real Postgres — no browser DOM needed.
        environment: 'node',

        // All test files share ONE test database, so they must never run at
        // the same time. This makes Vitest run them one after another; each
        // file still gets its own fresh child process, so module state and
        // the Prisma client never leak between files.
        fileParallelism: false,

        // Runs before EACH test file, inside its worker process:
        // loads .env.test, then refuses to continue unless it's the test DB.
        setupFiles: ['./tests/setup.js'],

        // Runs ONCE per `vitest` invocation, in a separate process:
        // resets the test database to the seed baseline.
        globalSetup: ['./tests/globalSetup.js'],

        include: ['tests/**/*.test.js'],
    },
})
