/**
 * @file loadErrorMessage.test.js
 * @description Guards the one invariant behind LoadErrorState: a page that failed
 * to load always has something to say.
 *
 * The component itself cannot be asserted on — this suite runs with
 * `environment: 'node'` and no jsdom (client/vitest.config.js). What is guardable
 * is the decision the component delegates: which of `error`, `fallback` and the
 * generic default wins. That decision is the whole point, because a falsy result
 * makes ErrorBanner render null (ErrorBanner.jsx:25), and an ErrorBanner rendering
 * null as a page's only child is a blank white screen.
 */
import { describe, it, expect } from 'vitest'
import { loadErrorMessage } from './loadErrorMessage'

describe('loadErrorMessage', () => {
  // The server knows more than the page does. "A run is in progress on this
  // machine" has to beat "Machine not found." — the machine was found.
  it('prefers a real error over the page fallback', () => {
    expect(loadErrorMessage('Boom', 'Machine not found.')).toBe('Boom')
  })

  // The no-error-but-no-entity case: nothing was thrown, so `error` is null and
  // only the page knows what noun is missing.
  it('uses the page fallback when there is no error', () => {
    expect(loadErrorMessage(null, 'Machine not found.')).toBe('Machine not found.')
  })

  // The actual "one guard instead of one per caller" win — a page that forgets
  // to pass a fallback still cannot render blank.
  it('uses the generic default when neither is given', () => {
    expect(loadErrorMessage(null, undefined)).toBe('This page could not be loaded.')
  })

  // The case that would reintroduce the bug this file exists for. `getErrorMessage`
  // can only return '' if its own fallback is ever emptied, but an empty string is
  // indistinguishable from null to ErrorBanner, so it must fall through the same way.
  it('treats empty strings as nothing to say', () => {
    expect(loadErrorMessage('', '')).toBe('This page could not be loaded.')
  })
})
