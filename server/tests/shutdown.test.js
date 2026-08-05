/**
 * @file shutdown.test.js
 * @description Unit tests for createShutdownHandler (lib/shutdown.js). Mocks
 * server/prisma/exit directly instead of sending real OS signals to a real
 * listening process — this is process-lifecycle plumbing, not an API route,
 * so it lands at happy-path + main-failure-case depth per CLAUDE.md.
 *
 * A mocked server can't show that a real socket keeps close() from calling
 * back — that half was verified separately against a real http.Server (see the
 * PR description). What's testable here is the handler's own decision-making:
 * when it force-exits, when it must NOT, and what a repeated signal does.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createShutdownHandler } from '../lib/shutdown.js'

describe('createShutdownHandler', () => {
    // Fake timers would otherwise leak into setup.js's afterAll prisma
    // disconnect and hang the worker.
    afterEach(() => {
        vi.useRealTimers()
    })

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

    it('force-exits after the grace period when server.close never completes', async () => {
        vi.useFakeTimers()
        // No callback invocation: the exact shape of a socket that never ends.
        const server = { close: vi.fn(() => {}) }
        const prisma = { $disconnect: vi.fn(async () => {}) }
        const exit = vi.fn()
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const shutdown = createShutdownHandler({ server, prisma, exit, graceMs: 10_000 })
        shutdown('SIGTERM')

        await vi.advanceTimersByTimeAsync(9_999)
        expect(exit).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)

        expect(exit).toHaveBeenCalledWith(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith('Shutdown did not complete within 10000ms, forcing exit')
        expect(prisma.$disconnect).not.toHaveBeenCalled()

        consoleErrorSpy.mockRestore()
    })

    it('does not force-exit later when the shutdown completed in time', async () => {
        vi.useFakeTimers()
        const server = { close: vi.fn((cb) => cb(null)) }
        const prisma = { $disconnect: vi.fn(async () => {}) }
        const exit = vi.fn()

        const shutdown = createShutdownHandler({ server, prisma, exit, graceMs: 10_000 })
        shutdown('SIGTERM')

        await vi.advanceTimersByTimeAsync(0)
        expect(exit).toHaveBeenCalledWith(0)

        await vi.advanceTimersByTimeAsync(60_000)

        expect(exit).toHaveBeenCalledTimes(1)
    })

    it('unrefs the force-exit timer so it never keeps the process alive by itself', () => {
        const unref = vi.fn()
        // Returning a stub handle keeps this assertion about the one line that
        // has no observable behaviour of its own — nothing real gets scheduled.
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue({ unref })
        const server = { close: vi.fn(() => {}) }
        const prisma = { $disconnect: vi.fn(async () => {}) }

        const shutdown = createShutdownHandler({ server, prisma, exit: vi.fn() })
        shutdown('SIGTERM')

        expect(setTimeoutSpy).toHaveBeenCalledTimes(1)
        expect(unref).toHaveBeenCalledTimes(1)

        setTimeoutSpy.mockRestore()
    })

    it('hard-exits on a repeated signal instead of silently ignoring it', () => {
        const server = { close: vi.fn(() => {}) }
        const prisma = { $disconnect: vi.fn(async () => {}) }
        const exit = vi.fn()
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const shutdown = createShutdownHandler({ server, prisma, exit })
        shutdown('SIGINT')
        expect(exit).not.toHaveBeenCalled()

        shutdown('SIGINT')

        expect(exit).toHaveBeenCalledTimes(1)
        expect(exit).toHaveBeenCalledWith(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith('SIGINT received again — exiting immediately')
        expect(server.close).toHaveBeenCalledTimes(1)

        consoleErrorSpy.mockRestore()
    })
})
