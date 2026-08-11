/**
 * @file LoadErrorState.jsx
 * @description The whole page when a detail page's initial load failed and the
 * entity it needs was never populated. Exists because that branch has two
 * requirements no single ErrorBanner can meet: it must never render nothing
 * (ErrorBanner returns null on a falsy message, which as a page's only child is
 * a blank screen), and it must offer a way off the page — Retry alone is a dead
 * end when the id in the URL is simply wrong, since retrying re-fetches the same
 * missing row forever.
 *
 * Keeping both guarantees in a component rather than at each call site is the
 * point: the next detail page inherits them by using this instead of remembering
 * two rules.
 */
import ErrorBanner from './ErrorBanner'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { common } from '../styles/common'

/**
 * Renders a back button above a guaranteed-visible error banner.
 *
 * @param {string|null} message - The page's load error, if a request actually failed.
 * @param {Function} onRetry - Refetches the page's data; wired to the banner's Retry button.
 * @param {Function} onBack - Navigates away. A callback rather than a route string, so this
 * component stays router-agnostic like ErrorBanner's onDismiss.
 * @param {string} [fallback] - Page-specific text when nothing threw but the entity is absent
 * (e.g. 'Machine not found.'). Optional — loadErrorMessage supplies a generic default.
 * @param {string} [backLabel] - Button text, for pages whose back target needs naming.
 *
 * @example
 * if (!machine) return (
 *   <LoadErrorState
 *     message={error}
 *     fallback="Machine not found."
 *     onRetry={loadMachineDetails}
 *     onBack={() => navigate('/admin')}
 *   />
 * )
 */
export default function LoadErrorState({ message, onRetry, onBack, fallback, backLabel = '← Back' }) {
  return (
    <div style={common.container}>
      {/* Above the banner because that is where every detail page puts its back
          button in the loaded view — so a successful Retry doesn't shift it. */}
      <button style={styles.backButton} onClick={onBack}>
        {backLabel}
      </button>

      <ErrorBanner
        message={loadErrorMessage(message, fallback)}
        onDismiss={onRetry}
        dismissLabel="Retry"
      />
    </div>
  )
}

const styles = {
  backButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent-link)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0',
    marginBottom: '16px',
  },
}
