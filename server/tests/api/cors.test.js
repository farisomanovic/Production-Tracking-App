/**
 * @file cors.test.js
 * @description Proves the CLIENT_ORIGIN guard (todo.md Group 1 #5) actually
 * rejects a missing value, so cors() never silently falls back to "allow any
 * origin". Tests the extracted assertClientOriginConfigured predicate
 * directly rather than re-importing app.js: app.js's other imports
 * transitively construct a PrismaClient, which has its own env-loading side
 * effect (reads server/.env off disk) that would repopulate CLIENT_ORIGIN in
 * this dev environment before a re-import could observe it missing.
 */
import { describe, it, expect } from 'vitest'
import { assertClientOriginConfigured } from '../../lib/assertClientOrigin.js'

describe('assertClientOriginConfigured', () => {
    it('throws when CLIENT_ORIGIN is missing', () => {
        expect(() => assertClientOriginConfigured(undefined)).toThrow('CLIENT_ORIGIN must be set')
        expect(() => assertClientOriginConfigured('')).toThrow('CLIENT_ORIGIN must be set')
    })

    it('does not throw when CLIENT_ORIGIN is set', () => {
        expect(() => assertClientOriginConfigured('http://localhost:5173')).not.toThrow()
    })
})
