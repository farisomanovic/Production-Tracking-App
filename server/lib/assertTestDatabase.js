/**
 * @file assertTestDatabase.js
 * @description Refuses to proceed if DATABASE_URL points at the production
 * database. Imported for its side effect, as the first line, by every script
 * that writes throwaway data (the e2e test suite, the test-DB seed script) so
 * a missing or misconfigured .env.test fails loudly instead of silently
 * running against real production data.
 */
const PRODUCTION_DB_NAME = 'production_tracker'

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Run this via its npm script (e.g. "npm test" or "npm run seed:test"), not directly with node, so --env-file=.env.test loads it.')
    process.exit(1)
}

const dbName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '')

if (dbName === PRODUCTION_DB_NAME) {
    console.error(`Refusing to run: DATABASE_URL points at "${dbName}", the production database. Create server/.env.test with a DATABASE_URL for a separate database (e.g. "${PRODUCTION_DB_NAME}_test").`)
    process.exit(1)
}
