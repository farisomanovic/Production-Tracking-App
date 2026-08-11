/**
 * @file routeError.js
 * @description Turns whatever `useRouteError()` handed back into one line of text
 * a person can read out loud. Split out of RouteErrorPage.jsx for the same reason
 * loadErrorMessage.js was split out of LoadErrorState.jsx: the client suite runs
 * `environment: 'node'` with no jsdom (client/vitest.config.js), so a rendered
 * component cannot be asserted on — only a pure function can.
 *
 * Why this may return an empty string when loadErrorMessage.js may not: there,
 * the result IS the banner, so a falsy value means a blank page. Here the banner
 * carries a fixed human sentence and this function only supplies the optional
 * technical line beneath it, so "nothing useful to add" is a legitimate answer.
 * Different guarantee, different function — do not merge the two.
 *
 * Why the last branch returns '' instead of React Router's own JSON.stringify:
 * an error element is the one component whose own throw is fatal. React Router
 * does not catch an error thrown by an error boundary, so the operator would get
 * a white screen with nothing on it at all. JSON.stringify throws on a circular
 * reference, and a thrown DOM node or Response is exactly the kind of object that
 * has one. Returning '' cannot throw.
 */
import { isRouteErrorResponse } from 'react-router-dom'

/**
 * Extracts the technical detail line for a crashed route, if there is one.
 *
 * @param {unknown} error - Whatever was thrown, straight from `useRouteError()`.
 * That type is not a shrug: a render can throw a string, an object, or nothing
 * meaningful at all, and this is the one place that cannot assume otherwise.
 * @returns {string} The detail text, or '' when the thrown value says nothing
 * worth showing.
 *
 * @example
 * routeErrorMessage(new Error("Cannot read properties of undefined"))
 * // → 'Cannot read properties of undefined'
 * routeErrorMessage({ notAnError: true })  // → ''
 */
export function routeErrorMessage(error) {
  // Unreachable today — nothing throws this shape until some route grows a
  // `loader`, and none has one. Kept because it is the documented shape of
  // useRouteError()'s return, and because dropping it means a future loader's
  // "404 Not Found" would silently degrade to the generic sentence.
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim()

  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'string') return error.trim()

  return ''
}
