/**
 * @file shutdown.js
 * @description Builds the SIGTERM/SIGINT handler wired up in index.js. Kept
 * separate from index.js so the handler's logic can be unit-tested with a
 * mocked server/prisma/exit instead of sending real OS signals to a real
 * listening process.
 *
 * Two things guarantee this handler always terminates the process:
 *
 * 1. A force-exit timer bounds the whole thing. server.close() fires its
 *    callback only once every non-idle socket has ended, so one request that
 *    never responds — or one client that connects and then says nothing —
 *    means prisma.$disconnect() is never reached and the process never exits,
 *    leaving it killable only by SIGKILL, the outcome graceful shutdown exists
 *    to avoid. Both cases were reproduced against a real http server before
 *    this was written; neither is hypothetical.
 * 2. A repeated signal exits immediately. Swallowing it (the previous
 *    behaviour) removed the operator's last escape hatch, silently.
 *
 * Deliberately NOT here: server.closeIdleConnections(). Idle keep-alive
 * sockets used to block close() and were the obvious suspect, but Node ≥19
 * reaps them inside close() itself ("there's no need for calling this method
 * in conjunction with server.close" — Node http docs), and this project runs
 * Node 24. Measured: an idle keep-alive socket held open across a plain
 * close() delayed its callback by 1ms.
 */

// Under systemd's 90s TimeoutStopSec and Kubernetes' 30s
// terminationGracePeriodSeconds, so the process still gets to log its own
// forced exit rather than being SIGKILLed mid-shutdown.
const DEFAULT_GRACE_MS = 10_000

export function createShutdownHandler({ server, prisma, exit = process.exit, graceMs = DEFAULT_GRACE_MS }) {
    let shuttingDown = false
    let forceExitTimer = null

    const finish = (code) => {
        clearTimeout(forceExitTimer)
        exit(code)
    }

    return function shutdown(signal) {
        if (shuttingDown) {
            console.error(`${signal} received again — exiting immediately`)
            finish(1)
            return
        }
        shuttingDown = true

        console.log(`${signal} received, shutting down gracefully`)

        forceExitTimer = setTimeout(() => {
            console.error(`Shutdown did not complete within ${graceMs}ms, forcing exit`)
            exit(1)
        }, graceMs)
        // An armed timer is itself a reason for Node to stay alive, so a
        // shutdown that finishes early would still idle here for the full
        // grace period. unref() means "don't keep the process alive for me".
        forceExitTimer.unref()

        // server.close() stops accepting new connections and waits for
        // in-flight requests to finish before its callback fires.
        server.close(async (err) => {
            if (err) {
                console.error(err)
                finish(1)
                return
            }

            try {
                await prisma.$disconnect()
                // Cleared only here, AFTER $disconnect resolved: if the
                // disconnect is what hangs, the timer must still be armed.
                finish(0)
            } catch (disconnectErr) {
                console.error(disconnectErr)
                finish(1)
            }
        })
    }
}
