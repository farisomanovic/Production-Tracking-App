/**
 * @file quantity.js
 * @description Formats a production run's produced quantity for display.
 *
 * `ProductionRun.quantityProduced` is recorded in the run's own product's `unit`
 * (schema.prisma's ProductionRun comment says so explicitly), which is one of
 * `kg | m | roll | pcs` — so the number is meaningless on its own. This lives in
 * lib/ rather than in either component because the two read-only display sites
 * (the wizard's step-5 confirmation card and the completed run's Output card)
 * had drifted into rendering the same value two different ways, and because the
 * client suite runs in a node environment with no jsdom — a pure function is the
 * only part of this that can be guarded by a test at all.
 */

/**
 * Renders a produced quantity with the unit it was measured in.
 *
 * @param {number|null|undefined} quantity - The produced quantity. Null/undefined
 * means "never recorded" (a run predating the single-output migration).
 * @param {string|null|undefined} unit - The product's unit; falls back to a bare
 * number rather than printing "undefined" when absent.
 * @returns {string} e.g. "500 kg", "500", or "—".
 *
 * @example
 * formatQuantity(500, 'kg')  // '500 kg'
 * formatQuantity(null, 'kg') // '—'
 */
export function formatQuantity(quantity, unit) {
    // == null, not truthiness: a produced quantity of 0 is a real recorded
    // number and must render as "0 kg", not as "never recorded".
    if (quantity == null) return '—'
    return unit ? `${quantity} ${unit}` : String(quantity)
}
