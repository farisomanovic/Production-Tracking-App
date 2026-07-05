/**
 * @file NotFoundPage.jsx
 * @description Catch-all for unknown routes (App.jsx's path="*") so a typo'd
 * URL shows a message instead of an empty shell with only the bottom nav.
 */

/**
 * Renders the 404 message.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="*" element={<NotFoundPage />} />
 */
function NotFoundPage() {
  return <h1>404 - Page Not Found</h1>
}

export default NotFoundPage
