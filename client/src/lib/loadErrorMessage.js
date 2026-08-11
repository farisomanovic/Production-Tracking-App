/**
 * @file loadErrorMessage.js
 * @description Guarantees a non-empty message for a page's load-failure state.
 * Separate from errorMessage.js: that one extracts what the *server* said from
 * an Axios error, while this one guarantees that *something* gets said at all.
 * Split out of LoadErrorState.jsx so the invariant is testable — the client
 * suite runs in node with no jsdom, so a rendered component cannot be asserted.
 */

/**
 * Resolves the text a failed-to-load page shows, never returning a falsy value.
 *
 * @param {string|null} error - The page's load error, usually already through getErrorMessage().
 * @param {string} [fallback] - Page-specific text for "loaded fine, but there was nothing there"
 * (e.g. 'Machine not found.') — the case no error describes because no request failed.
 * @returns {string} Always a non-empty string.
 *
 * @example
 * loadErrorMessage(null, 'Machine not found.')  // → 'Machine not found.'
 * loadErrorMessage('Network Error', 'Machine not found.')  // → 'Network Error'
 */
export function loadErrorMessage(error, fallback) {
  // `||` rather than `??` on purpose: an empty string is exactly the value that
  // would render an empty banner, so it has to fall through like null does.
  return error || fallback || 'This page could not be loaded.'
}
