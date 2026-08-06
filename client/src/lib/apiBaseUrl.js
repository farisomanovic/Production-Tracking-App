/**
 * @file apiBaseUrl.js
 * @description Decides the Axios base URL from a raw `VITE_API_URL` value, or
 * throws so a production build is never *produced* — and never *runs* — with the
 * localhost fallback baked in.
 *
 * Vite inlines `import.meta.env` at BUILD time, not run time. A deploy built
 * without `VITE_API_URL` therefore ships a bundle that tells every user's browser
 * to call their own machine on port 3000: the app loads, renders, navigates, and
 * every request fails with a network error that reads like "the server is down".
 * That is the same failure class as a falsy CORS origin on the server — a config
 * value whose absence lets everything boot healthy and then breaks every real
 * request — which is why this mirrors `server/lib/assertClientOrigin.js`.
 *
 * Two call sites share this one function:
 *   - `vite.config.js` reads the value with `loadEnv()` during `vite build`, so a
 *     misconfigured build fails in the terminal of the person who can still fix
 *     it, before a broken bundle exists at all. That is the guard that matters.
 *   - `api/axiosInstance.js` calls it at module load as a backstop, covering a
 *     bundle produced some other way (a build that bypassed this config, a hand
 *     edited `dist/`).
 *
 * Why `isDev` is an argument instead of a read of `import.meta.env`: that global
 * does not exist in Node, where both `vite.config.js` and this file's test run.
 * Keeping the decision pure is what makes it testable at all — the same reason
 * `assertClientOrigin.js` was split out of `app.js`. For the same reason this
 * file must stay dependency-free plain ESM with no browser globals, no JSX and no
 * asset imports: `vite build` bundles it straight into the config, so anything
 * Node cannot evaluate breaks the build itself.
 *
 * Why presence-only validation and no URL shape check: a same-origin deploy behind
 * a reverse proxy legitimately uses a relative `/api`, which `new URL()` would
 * reject — a shape check would refuse a correct config. Whitespace is trimmed
 * rather than rejected because it is invisible in a `.env` file; you cannot fix
 * what you cannot see.
 *
 * What this deliberately does NOT catch: a value that is present and wrong —
 * notably the `http://localhost:3000/api` that `.env.example` ships and every dev
 * machine already has in `client/.env`. Presence is the only thing checkable
 * without guessing at the deployment topology. See todo.md Group 1 #7.
 */

/** Where the API sits when both packages run locally — the server's own default port. */
const DEV_FALLBACK = 'http://localhost:3000/api'

/**
 * @param {unknown} rawUrl - The raw `VITE_API_URL` value: a string from
 * `import.meta.env` or `loadEnv()`, or `undefined` when it was never set.
 * @param {Object} options
 * @param {boolean} options.isDev - True for the dev server, false for a production
 * build. Passed in because only the caller knows which one it is.
 * @returns {string} The trimmed base URL, or the localhost fallback in dev.
 * @throws {Error} When the value is missing or blank outside dev.
 *
 * @example
 * resolveApiBaseUrl(' https://tracker.pakom.ba/api ', { isDev: false })
 * // → 'https://tracker.pakom.ba/api'
 */
export function resolveApiBaseUrl(rawUrl, { isDev }) {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (trimmed) return trimmed

  if (isDev) return DEV_FALLBACK

  // Read off a build terminal or a devtools console by someone with no other clue
  // what broke, so the message carries the variable, the file, and the stakes.
  throw new Error(
    `VITE_API_URL must be set for a production build — refusing to fall back to ` +
      `"${DEV_FALLBACK}", which would point every user's browser at their own machine. ` +
      `Set it in client/.env (see client/.env.example) and rebuild.`
  )
}
