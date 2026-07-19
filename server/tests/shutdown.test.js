/**
 * @file shutdown.test.js
 * @description Unit tests for createShutdownHandler (lib/shutdown.js). Mocks
 * server/prisma/exit directly instead of sending real OS signals to a real
 * listening process — this is process-lifecycle plumbing, not an API route,
 * so it lands at happy-path + main-failure-case depth per CLAUDE.md.
 */
import { describe, it, expect, vi } from 'vitest'
import { createShutdownHandler } from '../lib/shutdown.js'

describe('createShutdownHandler', () => {
    it('closes the server, disconnects prisma, then exits 0, in order', async () => {
        const calls = []
        const server = { close: vi.fn((cb) => { calls.push('close'); cb(null) }) }
        const prisma = { $disconnect: vi.fn(async () => { calls.push('disconnect') }) }
        const exit = vi.fn((code) => calls.push(`exit:${code}`))

        const shutdown = createShutdownHandler({ server, prisma, exit })
        shutdown('SIGTERM')

        await vi.waitFor(() => expect(exit).toHaveBeenCalled())

        expect(calls).toEqual(['close', 'disconnect', 'exit:0'])
    })

    it('exits 1 and logs when prisma.$disconnect rejects', async () => {
        const server = { close: vi.fn((cb) => cb(null)) }
        const disconnectError = new Error('connection already closed')
        const prisma = { $disconnect: vi.fn(async () => { throw disconnectError }) }
        const exit = vi.fn()
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const shutdown = createShutdownHandler({ server, prisma, exit })
        shutdown('SIGINT')

        await vi.waitFor(() => expect(exit).toHaveBeenCalled())

        expect(exit).toHaveBeenCalledWith(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith(disconnectError)

        consoleErrorSpy.mockRestore()
    })

    it('exits 1 and logs when server.close itself errors', async () => {
        const closeError = new Error('server was not running')
        const server = { close: vi.fn((cb) => cb(closeError)) }
        const prisma = { $disconnect: vi.fn(async () => {}) }
        const exit = vi.fn()
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const shutdown = createShutdownHandler({ server, prisma, exit })
        shutdown('SIGTERM')

        await vi.waitFor(() => expect(exit).toHaveBeenCalled())

        expect(exit).toHaveBeenCalledWith(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith(closeError)
        expect(prisma.$disconnect).not.toHaveBeenCalled()

        consoleErrorSpy.mockRestore()
    })

    it('ignores a second signal while shutdown is already in progress', async () => {
        const server = { close: vi.fn((cb) => cb(null)) }
        const prisma = { $disconnect: vi.fn(async () => {}) }
        const exit = vi.fn()

        const shutdown = createShutdownHandler({ server, prisma, exit })
        shutdown('SIGTERM')
        shutdown('SIGTERM')

        await vi.waitFor(() => expect(exit).toHaveBeenCalled())

        expect(server.close).toHaveBeenCalledTimes(1)
        expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
        expect(exit).toHaveBeenCalledTimes(1)
    })
})
