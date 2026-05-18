/**
 * Renders the fallback route for unknown frontend paths.
 * Provides a simple 404 message when no configured route matches.
 * Keeps unmatched URLs from rendering an empty application shell.
 */
function NotFoundPage() {
  return <h1>404 - Page Not Found</h1>
}

export default NotFoundPage
