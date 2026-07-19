/**
 * @file shutdown.js
 * @description Builds the SIGTERM/SIGINT handler wired up in index.js. Kept
 * separate from index.js so the handler's logic can be unit-tested with a
 * mocked server/prisma/exit instead of sending real OS signals to a real
 * listening process.
 */

export function createShutdownHandler({ server, prisma, exit = process.exit }) {
    let shuttingDown = false

    return function shutdown(signal) {
        if (shuttingDown) return
        shuttingDown = true

        console.log(`${signal} received, shutting down gracefully`)

        // server.close() stops accepting new connections and waits for
        // in-flight requests to finish before its callback fires.
        server.close(async (err) => {
            if (err) {
                console.error(err)
                exit(1)
                return
            }

            try {
                await prisma.$disconnect()
                exit(0)
            } catch (disconnectErr) {
                console.error(disconnectErr)
                exit(1)
            }
        })
    }
}
