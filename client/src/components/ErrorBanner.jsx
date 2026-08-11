/**
 * @file ErrorBanner.jsx
 * @description Dismissible error banner shown above page content instead of
 * blanking the whole page. Stateless — the parent page owns the message state
 * (`error` from useApi, or a page's own `actionError`) and passes it down, so
 * the banner has no internal dismissed-state that could go stale (e.g. an
 * identical repeated error string still reappears correctly).
 *
 * Rendering nothing on a falsy message is deliberate and stays: at all twelve
 * inline call sites this banner sits above real page content, and a component
 * that always rendered would leave a permanent empty red bar on every page.
 * React gives a component no way to detect that it is an only child, so the
 * one context where rendering nothing IS wrong — a failed load, where the
 * banner is the entire page — is handled by LoadErrorState.jsx instead.
 */
import { common } from '../styles/common'

/**
 * Renders nothing when `message` is falsy.
 *
 * @param {string|null} message - Error text to show.
 * @param {Function} onDismiss - Called when the button is clicked. Pass `reload`
 * for a load-error banner (acts as "Retry"), or `() => setActionError(null)` for
 * a mutation-error banner (acts as "Dismiss").
 * @param {string} [dismissLabel] - Button text — defaults to "Dismiss", pass "Retry" for load errors.
 *
 * @example
 * <ErrorBanner message={error} onDismiss={reload} dismissLabel="Retry" />
 * <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
 */
export default function ErrorBanner({ message, onDismiss, dismissLabel = 'Dismiss' }) {
  if (!message) return null

  return (
    <div style={styles.banner}>
      <span style={styles.message}>{message}</span>
      <button style={styles.button} onClick={onDismiss}>{dismissLabel}</button>
    </div>
  )
}

const styles = {
  banner: {
    ...common.errorBox,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  message: {
    flex: 1,
  },
  button: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--color-danger)',
    backgroundColor: 'transparent',
    color: 'var(--color-danger)',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
}
