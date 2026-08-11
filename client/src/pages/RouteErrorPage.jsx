/**
 * @file RouteErrorPage.jsx
 * @description The whole screen when a page throws while rendering. Wired as the
 * root route's `errorElement` in App.jsx, so it is what React Router shows instead
 * of its own built-in screen — which is unstyled, says "Unexpected Application
 * Error!", prints the raw stack trace in production too, and offers no way off
 * itself but the browser's Back button.
 *
 * Lives in pages/ rather than components/ because it occupies the viewport and is
 * named in the route table, like NotFoundPage.
 *
 * Sitting at the root means this replaces RootLayout, so there is no BottomNav
 * here — that is the deliberate cost of also covering a crash inside RootLayout or
 * BottomNav itself. Do NOT render BottomNav here to win the nav back: if BottomNav
 * is what threw, it throws again inside this component, and React Router does not
 * catch an error thrown by an error element.
 */
import { useNavigate, useRouteError } from 'react-router-dom'

import ErrorBanner from '../components/ErrorBanner'
import { routeErrorMessage } from '../lib/routeError'
import { common } from '../styles/common'

/**
 * Renders a fixed human sentence, the error's own text when it has any, and a way out.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * createBrowserRouter([{ element: <RootLayout />, errorElement: <RouteErrorPage />, children: [...] }])
 */
export default function RouteErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()

  // Two lines rather than one because they answer different people. The banner is
  // for the operator, who needs to know the app broke and not that they did
  // something wrong; the detail below is for whoever they read it out to.
  const detail = routeErrorMessage(error)

  return (
    <div style={common.container}>
      {/* No console.error here despite the house rule for catch blocks: React
          Router's own boundary already logs "React Router caught the following
          error during render" whenever no onError option was passed, and
          createBrowserRouter is called with no options at all. A second log would
          just double every crash in the console. */}
      <ErrorBanner
        message="Something went wrong on this page."
        onDismiss={() => window.location.reload()}
        dismissLabel="Reload"
      />

      {/* A full reload rather than a state reset because there is no reset: the
          error lives in router state and cannot be cleared from inside the
          boundary. Reload is also the only option that recovers from bad module
          state, which a client-side navigation would carry straight over. */}

      {detail && <p style={styles.detail}>{detail}</p>}

      <button style={common.button} onClick={() => navigate('/')}>
        Go to Dashboard
      </button>
    </div>
  )
}

const styles = {
  detail: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
    marginBottom: '1rem',
    // An unminified stack-adjacent message is long and has no spaces to break at.
    wordBreak: 'break-word',
  },
}
