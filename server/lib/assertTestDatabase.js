/**
 * @file assertTestDatabase.js
 * @description Refuses to proceed unless DATABASE_URL points at a test
 * database. Imported for its side effect, as the first line, by every script
 * that writes throwaway data (the Vitest setup and globalSetup, the test-DB
 * seed script) so a missing or misconfigured .env.test fails loudly instead of
 * silently running against real production data.
 *
 * assertTestDatabaseUrl is split out as a pure, throwing predicate (mirroring
 * assertClientOrigin.js) so it's unit-testable without a real process exit.
 * The check is an allowlist, not a blocklist: only a database name ending in
 * "_test" is accepted, everything else is refused — a renamed production DB,
 * a colleague's DB, or a typo'd .env.test all fail closed instead of passing
 * silently through a check for one exact known name.
 */
const PRODUCTION_DB_NAME = 'production_tracker'
const TEST_DB_SUFFIX = '_test'

export function assertTestDatabaseUrl(databaseUrl) {
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set. Run this via its npm script (e.g. "npm test" or "npm run seed:test"), not directly with node, so --env-file=.env.test loads it.')
    }

    let dbName
    try {
        dbName = new URL(databaseUrl).pathname.replace(/^\//, '')
    } catch {
        throw new Error(`DATABASE_URL is not a valid URL: "${databaseUrl}". Check server/.env.test.`)
    }

    if (dbName === PRODUCTION_DB_NAME) {
        throw new Error(`Refusing to run: DATABASE_URL points at "${dbName}", the production database. Create server/.env.test with a DATABASE_URL for a separate database (e.g. "${PRODUCTION_DB_NAME}_test").`)
    }

    if (!dbName.endsWith(TEST_DB_SUFFIX)) {
        throw new Error(`Refusing to run: DATABASE_URL points at "${dbName}", which doesn't look like a test database (name must end in "${TEST_DB_SUFFIX}"). Create server/.env.test with a DATABASE_URL for a database like "${dbName}${TEST_DB_SUFFIX}".`)
    }
}

try {
    assertTestDatabaseUrl(process.env.DATABASE_URL)
} catch (err) {
    console.error(err.message)
    process.exit(1)
}
