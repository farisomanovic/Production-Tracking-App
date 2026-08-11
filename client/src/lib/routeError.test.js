/**
 * @file routeError.test.js
 * @description Guards the one decision RouteErrorPage delegates: what, if anything,
 * a crashed route tells the operator beyond "something went wrong".
 *
 * The component itself cannot be asserted on — this suite runs with
 * `environment: 'node'` and no jsdom (client/vitest.config.js). What is guardable
 * is the type dispatch, and that is where the risk actually lives: an error element
 * is handed an `unknown`, and the one component whose own throw React Router will
 * NOT catch is the error element itself. A `.trim()` reached by a null is not a
 * failed test, it is a white screen in the factory.
 */
import { describe, it, expect } from 'vitest'
import { routeErrorMessage } from './routeError'

describe('routeErrorMessage', () => {
  // The overwhelmingly common case: a page threw while rendering. This message is
  // the only diagnostic that exists — the app has no logging, so an operator
  // reading this line off their phone is how the bug gets reported at all.
  it('reports the message of a thrown Error', () => {
    const error = new Error('Cannot read properties of undefined')
    expect(routeErrorMessage(error)).toBe('Cannot read properties of undefined')
  })

  // A route loader throwing a Response. Nothing in this app can produce one yet,
  // so this test is what keeps the branch honest rather than merely present. The
  // fabricated object works because isRouteErrorResponse duck-types these four
  // fields; if react-router ever switches to an instanceof check, this goes red,
  // which is correct signal.
  it('reports status and statusText for a route error response', () => {
    const response = { status: 404, statusText: 'Not Found', internal: false, data: null }
    expect(routeErrorMessage(response)).toBe('404 Not Found')
  })

  // `throw 'something broke'` is legal JavaScript and some libraries do it.
  // The string is already the message; there is no .message to reach for.
  it('reports a thrown string as itself', () => {
    expect(routeErrorMessage('boom')).toBe('boom')
  })

  // The branch that exists to not crash. React Router stringifies here; we refuse
  // to, because JSON.stringify throws on a circular reference and a throw inside
  // an error element is uncatchable. '{}' would tell the operator nothing anyway.
  it('has nothing to add for a value that is not an error', () => {
    expect(routeErrorMessage({ some: 'object' })).toBe('')
    expect(routeErrorMessage(undefined)).toBe('')
  })

  // Whitespace is invisible, so a blank-but-present message would render an empty
  // <p> that still takes up its margin — a mystery gap under the banner with no
  // way to tell it from a layout bug.
  it('treats a whitespace-only message as nothing to say', () => {
    expect(routeErrorMessage(new Error('   '))).toBe('')
  })
})
