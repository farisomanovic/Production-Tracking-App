/**
 * @file assertClientOrigin.js
 * @description Throws if CLIENT_ORIGIN is missing. Split out of app.js so it
 * can be unit-tested directly: app.js's other imports transitively construct
 * a PrismaClient, which has its own env-loading side effect (it reads the
 * local .env off disk to find DATABASE_URL) that would silently repopulate
 * CLIENT_ORIGIN before a test re-importing the whole app.js chain could
 * observe it missing.
 */
export function assertClientOriginConfigured(clientOrigin) {
  if (!clientOrigin) {
    throw new Error('CLIENT_ORIGIN must be set — refusing to start with CORS open to all origins')
  }
}
