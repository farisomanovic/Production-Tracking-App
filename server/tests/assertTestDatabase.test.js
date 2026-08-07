/**
 * @file assertTestDatabase.test.js
 * @description Proves the DATABASE_URL guard refuses
 * the production database name, refuses any other non-"_test" database name
 * (the fail-open bug this fix closes), refuses a malformed URL with a clean
 * message instead of an unhandled crash, and accepts a real "_test" URL.
 *
 * Calls assertTestDatabaseUrl directly rather than re-importing
 * assertTestDatabase.js: that module's top-level side effect already ran via
 * tests/setup.js for this worker, and importing it again wouldn't let us vary
 * DATABASE_URL per case anyway (its own process.env read runs once).
 */
import { describe, it, expect } from 'vitest'
import { assertTestDatabaseUrl } from '../lib/assertTestDatabase.js'

describe('assertTestDatabaseUrl', () => {
    it('throws when DATABASE_URL is missing or empty', () => {
        expect(() => assertTestDatabaseUrl(undefined)).toThrow('DATABASE_URL is not set')
        expect(() => assertTestDatabaseUrl('')).toThrow('DATABASE_URL is not set')
    })

    it('throws a clean error for a malformed URL instead of crashing', () => {
        expect(() => assertTestDatabaseUrl('not-a-valid-url')).toThrow('DATABASE_URL is not a valid URL')
    })

    it('refuses the exact production database name', () => {
        expect(() =>
            assertTestDatabaseUrl('postgresql://user@localhost:5432/production_tracker')
        ).toThrow('the production database')
    })

    it('refuses any other database name that does not end in "_test"', () => {
        expect(() =>
            assertTestDatabaseUrl('postgresql://user@remote-host:5432/renamed_prod_db')
        ).toThrow('doesn\'t look like a test database')
        expect(() =>
            assertTestDatabaseUrl('postgresql://user@localhost:5432/staging')
        ).toThrow('doesn\'t look like a test database')
        expect(() =>
            assertTestDatabaseUrl('postgresql://user@localhost:5432/production_tracker_tes')
        ).toThrow('doesn\'t look like a test database')
    })

    it('accepts a database name ending in "_test"', () => {
        expect(() =>
            assertTestDatabaseUrl('postgresql://user@localhost:5432/production_tracker_test?schema=public')
        ).not.toThrow()
    })
})
