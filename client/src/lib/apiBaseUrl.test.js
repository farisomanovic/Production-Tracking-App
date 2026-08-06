/**
 * @file apiBaseUrl.test.js
 * @description Guards the one decision standing between a missing `VITE_API_URL`
 * and a deployed bundle that calls localhost from every user's browser.
 *
 * Worth testing because neither call site is reachable from where manual testing
 * actually happens: the build-time one only fires on `vite build` with the
 * variable unset, and the runtime one only inside a production bundle. Neither
 * ever runs during `npm run dev`, so without these tests the guard is code nobody
 * exercises until the day it matters.
 *
 * These run in Node (`vitest.config.js` sets `environment: 'node'`), which is
 * exactly why `resolveApiBaseUrl` takes `isDev` as an argument — there is no
 * `import.meta.env` here to read. What is NOT covered, and cannot be: that the two
 * call sites pass the right `isDev`, and that Vite actually inlines the result.
 * Those are verified by running `npm run build` with and without the variable and
 * grepping `dist/assets/*.js`.
 */
import { describe, it, expect } from 'vitest'
import { resolveApiBaseUrl } from './apiBaseUrl'

const PROD = { isDev: false }
const DEV = { isDev: true }

describe('resolveApiBaseUrl in a production build', () => {
  it('returns the configured URL', () => {
    expect(resolveApiBaseUrl('https://tracker.pakom.ba/api', PROD)).toBe('https://tracker.pakom.ba/api')
  })

  // A .env value cannot be quoted, so a stray space or a trailing newline is
  // invisible in the file and would otherwise be prefixed onto every request URL.
  it('trims surrounding whitespace', () => {
    expect(resolveApiBaseUrl('  https://tracker.pakom.ba/api\t\n', PROD)).toBe('https://tracker.pakom.ba/api')
  })

  // Deliberate: a same-origin deploy behind a reverse proxy serves the API at a
  // relative path. This asserts the ABSENCE of a shape check, so a future
  // `new URL()` "improvement" fails here rather than in production.
  it('accepts a relative same-origin path', () => {
    expect(resolveApiBaseUrl('/api', PROD)).toBe('/api')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace only', '   \t\n'],
    ['a non-string', 3000],
  ])('throws when the value is %s', (_label, value) => {
    expect(() => resolveApiBaseUrl(value, PROD)).toThrow(/VITE_API_URL/)
  })

  // The message is this guard's entire user interface: it is read off a terminal or
  // a devtools console by someone with no other clue what broke.
  it('names the file to fix in the error message', () => {
    expect(() => resolveApiBaseUrl(undefined, PROD)).toThrow(/client\/\.env/)
  })
})

describe('resolveApiBaseUrl in dev', () => {
  // The URL is hardcoded here rather than imported on purpose: it duplicates the
  // server's default port, and the point is to fail if one side moves without the
  // other.
  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('falls back to localhost when the value is %s', (_label, value) => {
    expect(resolveApiBaseUrl(value, DEV)).toBe('http://localhost:3000/api')
  })

  it('still prefers an explicit value, so dev can point at a staging API', () => {
    expect(resolveApiBaseUrl('https://staging.example.com/api', DEV)).toBe('https://staging.example.com/api')
  })
})
