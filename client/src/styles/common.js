/**
 * @file common.js
 * @description Shared inline-style objects used across pages and wizard steps.
 * This project styles exclusively via the `style` attribute (no CSS classes);
 * anything used by 2+ components belongs here, single-component styles stay in
 * that component's local `styles` object at the bottom of its file.
 */
export const common = {

  // Page shell — centered, max 600px: the app is designed phone-first for
  // shop-floor use, and capping width keeps it readable on desktop too.
  container: {
    padding: '16px',
    maxWidth: '600px',
    width: '100%',
    boxSizing: 'border-box',
    margin: '0 auto',
  },

  // Wizard step wrapper — stacked column layout
  wizardContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0rem',
  },

  // "Loading…" text shown while data is fetching
  loadingText: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.9rem',
  },

  // Red error banner shown at the top of a page or step
  errorBox: {
    backgroundColor: 'var(--color-danger-soft)',
    color: 'var(--color-danger)',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
  },

  // Vertical list of cards in admin pages
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  // Standard card row in admin pages (non-clickable)
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
  },

  // Left column inside a card — stacks name and metadata vertically
  cardLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  // Primary name text inside a card
  cardName: {
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  },

  // Secondary info text inside a card (type, unit, code)
  cardType: {
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
  },

  // "›" chevron on the right side of a clickable card
  arrow: {
    color: 'var(--color-text-secondary)',
    fontSize: '20px',
  },

  // Text input in admin pages. px sizing here vs rem in wizardInput below:
  // the two form families were built at different times — unify eventually.
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  },

  // Primary action button in admin pages (Add, Link, Save)
  button: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--color-accent-link)',
    color: 'var(--color-on-accent)',
    fontSize: '14px',
    cursor: 'pointer',
  },

  // Vertical form column in admin pages
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px',
  },

  // Small uppercase section header used in detail and run pages
  sectionLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
  },

  // Text input in wizard and detail pages (rem sizing — see `input` above)
  wizardInput: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.95rem',
  },

  // Label above an input in wizard and detail pages
  label: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
  },

  // Wrapper for a label + input pair in wizard and detail pages
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    marginBottom: '1rem',
  },

  // "Next →" full-width button used by wizard steps 1–4
  nextButton: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    width: '100%',
  },

  // Input + unit label side by side (e.g. "120  kg")
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },

  // Unit label next to a numeric input ("kg", "kWh"); minWidth keeps mixed
  // units ("kg" vs "kWh") from making inputs different widths in one column.
  unit: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
    minWidth: '2rem',
  },

  // Empty-state box shown when a wizard step has no items to display
  emptyBox: {
    padding: '2rem',
    textAlign: 'center',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    marginBottom: '1rem',
  },

  // Primary text inside an empty-state box
  emptyText: {
    color: 'var(--color-text-primary)',
    marginBottom: '0.5rem',
  },

  // Secondary hint text inside an empty-state box
  emptySubtext: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
  },

  // Subtitle paragraph below a wizard step heading
  subheading: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
    marginBottom: '1.5rem',
  },
}
