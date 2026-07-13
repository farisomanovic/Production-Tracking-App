/**
 * @file cors.test.js
 * @description Proves the CLIENT_ORIGIN guard (todo.md Group 1 #5) actually
 * rejects a missing/blank value and trims a padded one, AND that app.js is
 * actually wired to it (not just the predicate in isolation).
 *
 * The predicate tests call assertClientOriginConfigured directly rather than
 * re-importing app.js: app.js's other imports transitively construct a
 * PrismaClient, which has its own env-loading side effect (reads server/.env
 * off disk) that would repopulate CLIENT_ORIGIN in this dev environment
 * before a re-import could observe it missing.
 *
 * The wiring test mocks @prisma/client to a no-op stub to remove that same
 * side effect, which unblocks a real dynamic re-import of app.js — proving
 * the guard is actually called before app.use(cors(...)) runs, not just that
 * the standalone function works. A reordered call or a typo'd env var name
 * in app.js would make this test fail; the predicate tests alone would not
 * have caught either.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { assertClientOriginConfigured } from '../../lib/assertClientOrigin.js'

// $disconnect is a no-op stub, not left off: tests/setup.js's global afterAll
// hook calls prisma.$disconnect() on whatever PrismaClient instance exists in
// this worker, including this mocked one — without it, that hook throws.
vi.mock('@prisma/client', () => ({
    PrismaClient: class {
        async $disconnect() {}
    }
}))

describe('assertClientOriginConfigured', () => {
    it('throws when CLIENT_ORIGIN is missing or blank', () => {
        expect(() => assertClientOriginConfigured(undefined)).toThrow('CLIENT_ORIGIN must be set')
        expect(() => assertClientOriginConfigured('')).toThrow('CLIENT_ORIGIN must be set')
        expect(() => assertClientOriginConfigured('   ')).toThrow('CLIENT_ORIGIN must be set')
    })

    it('returns the trimmed value when set', () => {
        expect(assertClientOriginConfigured('http://localhost:5173')).toBe('http://localhost:5173')
        expect(assertClientOriginConfigured('  http://localhost:5173  ')).toBe('http://localhost:5173')
    })
})

describe('app.js CORS wiring', () => {
    const ORIGINAL_CLIENT_ORIGIN = process.env.CLIENT_ORIGIN

    afterEach(() => {
        process.env.CLIENT_ORIGIN = ORIGINAL_CLIENT_ORIGIN
    })

    it('refuses to build the app when CLIENT_ORIGIN is missing', async () => {
        delete process.env.CLIENT_ORIGIN

        const specifier = `../../app.js?cors-wiring-test=${Date.now()}`
        await expect(import(/* @vite-ignore */ specifier)).rejects.toThrow('CLIENT_ORIGIN must be set')
    })
})
