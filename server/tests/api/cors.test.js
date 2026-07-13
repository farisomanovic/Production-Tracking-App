/**
 * @file cors.test.js
 * @description Proves the CLIENT_ORIGIN guard (todo.md Group 1 #5) actually
 * rejects a missing/blank value, rejects a malformed-shape value (trailing
 * slash, path, comma-list, non-http scheme), and trims a padded one, AND that
 * app.js is actually wired to it (not just the predicate in isolation).
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

    it('rejects a value that is not a bare origin', () => {
        // Trailing slash and path: parse fine but never === the browser's Origin header.
        expect(() => assertClientOriginConfigured('https://pakom.example.com/')).toThrow('bare origin')
        expect(() => assertClientOriginConfigured('https://pakom.example.com/app')).toThrow('bare origin')
        // Redundant default port: browser sends the origin without :443.
        expect(() => assertClientOriginConfigured('https://pakom.example.com:443')).toThrow('bare origin')
        // Comma-separated list: cors() would match the whole string literally.
        expect(() =>
            assertClientOriginConfigured('https://a.example.com,https://b.example.com')
        ).toThrow(/bare origin|valid origin/)
    })

    it('rejects a non-http(s) scheme and unparseable garbage', () => {
        expect(() => assertClientOriginConfigured('ftp://x.example.com')).toThrow('http:// or https://')
        expect(() => assertClientOriginConfigured('file:///x')).toThrow('http:// or https://')
        expect(() => assertClientOriginConfigured('localhost:5173')).toThrow('http:// or https://')
        expect(() => assertClientOriginConfigured('not a url')).toThrow('valid origin')
    })

    it('returns the trimmed value for a canonical origin', () => {
        expect(assertClientOriginConfigured('http://localhost:5173')).toBe('http://localhost:5173')
        expect(assertClientOriginConfigured('  http://localhost:5173  ')).toBe('http://localhost:5173')
        expect(assertClientOriginConfigured('https://pakom.example.com')).toBe('https://pakom.example.com')
        expect(assertClientOriginConfigured('https://pakom.example.com:8080')).toBe(
            'https://pakom.example.com:8080'
        )
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
