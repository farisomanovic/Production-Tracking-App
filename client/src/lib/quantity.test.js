/**
 * @file quantity.test.js
 * @description Guards `formatQuantity` — the only executable part of the fix that
 * stopped the app hardcoding "pcs" next to a quantity that is actually recorded in
 * the product's own unit (kg, m, roll or pcs).
 *
 * The four label sites this fix touches are all JSX, and this suite runs with
 * `environment: 'node'` and no jsdom (client/vitest.config.js), so none of them can
 * be asserted on directly. Pulling the formatting decision out into a pure function
 * is what makes the change guardable at all: the two branches below (a quantity that
 * was never recorded, and a unit that failed to arrive) are exactly the cases where
 * a careless rewrite prints "null kg" or "500 undefined" into a completed run's
 * detail page, which reads as real data.
 */
import { describe, it, expect } from 'vitest'
import { formatQuantity } from './quantity'

describe('formatQuantity', () => {
  it('formats a quantity with its unit', () => {
    expect(formatQuantity(500, 'kg')).toBe('500 kg')
  })

  // A run created before the single-output migration has no quantityProduced at
  // all. It must read as absent, not as the string "null".
  it('renders an absent quantity as an em dash', () => {
    expect(formatQuantity(null, 'kg')).toBe('—')
    expect(formatQuantity(undefined, 'kg')).toBe('—')
  })

  // Separate from the case above on purpose: 0 is falsy but is a real recorded
  // figure, and a truthiness guard would blank it. That is the same distinction
  // NewRunPage's prefill and the XLSX export already make with `!= null`.
  it('keeps a zero quantity rather than blanking it', () => {
    expect(formatQuantity(0, 'kg')).toBe('0 kg')
  })

  // The list endpoint selects only `product.name`, so a caller wired to a run
  // summary instead of a full run hands us no unit. A bare number is wrong-ish;
  // "500 undefined" on screen is indefensible.
  it('omits a missing unit instead of printing undefined', () => {
    expect(formatQuantity(500, undefined)).toBe('500')
  })
})
