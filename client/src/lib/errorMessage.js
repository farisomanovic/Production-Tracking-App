/**
 * @file errorMessage.js
 * @description Extracts the server's error text from a failed Axios call, the
 * same extraction axiosInstance.js's interceptor used to do centrally before
 * every page's own catch block owned error display.
 */

/**
 * Prefers the server's own error message over a generic fallback.
 *
 * @param {Object} err - The caught error (an Axios error when available).
 * @param {string} fallback - Shown when the server sent nothing useful, or
 * the request never reached it (network error).
 * @returns {string} The message to show the user.
 *
 * @example
 * getErrorMessage(err, 'Failed to unlink parameter')
 */
export function getErrorMessage(err, fallback) {
  return err.response?.data?.error || err.response?.data?.message || fallback
}
