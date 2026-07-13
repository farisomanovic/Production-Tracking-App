/**
 * @file assertClientOrigin.js
 * @description Validates CLIENT_ORIGIN at startup and returns it normalized,
 * or throws so the server refuses to boot on a misconfigured value. Split out
 * of app.js so it can be unit-tested directly: app.js's other imports
 * transitively construct a PrismaClient, which has its own env-loading side
 * effect (it reads the local .env off disk to find DATABASE_URL) that would
 * silently repopulate CLIENT_ORIGIN before a test re-importing the whole
 * app.js chain could observe it missing.
 *
 * Why shape-validate, not just non-blank: the cors package compares this
 * string with `===` against the browser's Origin header, which per the Fetch
 * spec is a bare origin — scheme + host + optional non-default port, never a
 * trailing slash, path, query, or fragment, and never a comma-separated list
 * (cors() would treat that as one literal string matching nothing). So a
 * value like "https://app.example.com/" (an easy copy from a browser address
 * bar) passes a truthiness check, lets the server boot healthy, then silently
 * rejects EVERY real request from the actual frontend — the same silent-CORS
 * failure this guard exists to prevent, moved one layer deeper and harder to
 * diagnose. We follow the codebase precedent set by assertTestDatabase.js
 * (parsing a URL-shaped env var with `new URL()` to catch malformed values).
 *
 * Whitespace is auto-trimmed rather than rejected because it's invisible in a
 * .env file — you can't fix what you can't see. Everything else that isn't
 * already a canonical bare origin is rejected loudly, with the error naming
 * the exact value to use, because those malformations ARE visible and the
 * operator can act on the message.
 */
export function assertClientOriginConfigured(clientOrigin) {
  const trimmed = typeof clientOrigin === 'string' ? clientOrigin.trim() : ''
  if (!trimmed) {
    throw new Error('CLIENT_ORIGIN must be set — refusing to start with CORS open to all origins')
  }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(
      `CLIENT_ORIGIN must be a valid origin URL like "https://app.example.com" (scheme + host, no path). Got: "${trimmed}"`
    )
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`CLIENT_ORIGIN must use http:// or https://. Got: "${trimmed}"`)
  }

  // parsed.origin is the canonical bare origin the browser's Origin header
  // will actually carry. Any divergence (trailing slash, path, redundant
  // default port, comma-separated list) means cors()'s strict === would never
  // match a real request — reject and hand back the value that would work.
  if (parsed.origin !== trimmed) {
    throw new Error(
      `CLIENT_ORIGIN must be a bare origin with no trailing slash, path, query, fragment, ` +
        `or comma-separated list (cors() matches one origin literally). ` +
        `Got: "${trimmed}"; use "${parsed.origin}"`
    )
  }

  return trimmed
}
