/**
 * @file materialSplit.js
 * @description Derives how many kg of each recipe material a run consumed, from
 * the figures the operator records at the machine.
 *
 * The subtlety this file exists for: `ProductionRun.quantityProduced` is recorded
 * in the product's own `unit` (`kg | m | roll | pcs`), so the same number means a
 * different physical thing depending on the product. For `roll` and `pcs` it is a
 * COUNT, and the run's weight is `count × neto`. For `kg` it is ALREADY the weight,
 * and multiplying it by a per-unit weight inflates the total by a factor of neto —
 * which then flows straight into the stock decrement on completion, since the
 * server validates the shape of `quantityUsed` but can never know its magnitude.
 *
 * This lives in lib/ rather than in either completion form for two reasons. The
 * formula was duplicated verbatim in the wizard's Step 4 and in RunDetailPage, so
 * a branch added to one would have silently missed the other. And the client suite
 * runs with `environment: 'node'` and no jsdom (client/vitest.config.js), so a
 * function trapped inside a component cannot be tested at all — the same reasoning
 * that produced quantity.js.
 */

/**
 * Units where `quantityProduced` is itself a weight in kg.
 *
 * Deliberately a subset of VALID_UNITS, not a copy of it: the closed vocabulary
 * lives in server/lib/validation.js (mirrored in units.js under a drift test),
 * while this array states a different fact — which of those members must NOT be
 * multiplied by a per-unit weight. `m` is absent on purpose: metres × kg-per-metre
 * is dimensionally sound, so a length product needs no special case.
 */
const WEIGHT_UNITS = ['kg']

/**
 * Whether a product's quantity is already expressed in kilograms.
 *
 * @param {string|null|undefined} unit - The product's unit.
 * @returns {boolean} True only for units in WEIGHT_UNITS.
 *
 * @example
 * isWeightUnit('kg')   // true
 * isWeightUnit('roll') // false
 */
export function isWeightUnit(unit) {
    return WEIGHT_UNITS.includes(unit)
}

/**
 * Total raw material the run drew off the shelf, in kg.
 *
 * Scrap is added on both branches because wasted material still came off the
 * shelf. Bruto is deliberately absent — packaging weight isn't raw material.
 *
 * @param {Object} input
 * @param {string|number} input.quantityProduced - In the product's own unit.
 * @param {string|number} input.netWeightPerUnit - Weight of one unit in kg; ignored
 * for weight units, where the quantity is already the total.
 * @param {string|number} input.scrapKg - Total scrap for the run in kg.
 * @param {string} input.unit - The product's unit. An unknown or missing unit falls
 * through to the multiplying branch, so a failed unit lookup cannot silently halve
 * a material order.
 * @returns {number} Total kg, or 0 when the inputs are blank.
 *
 * @example
 * calculateTotalKg({ quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10', unit: 'roll' }) // 760
 * calculateTotalKg({ quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10', unit: 'kg' })   // 510
 */
export function calculateTotalKg({ quantityProduced, netWeightPerUnit, scrapKg, unit }) {
    const q = Number(quantityProduced) || 0
    const n = Number(netWeightPerUnit) || 0
    const s = Number(scrapKg) || 0
    return (isWeightUnit(unit) ? q : q * n) + s
}

/**
 * Splits the run's total kg across the recipe's materials by their percentages.
 *
 * Recipe percentages are validated to total 100 at creation and there is no
 * item-editing endpoint, so the split conserves mass.
 *
 * @param {Object} input - Everything calculateTotalKg takes, plus:
 * @param {Array<{materialId: string, percentage: number}>} input.recipeItems - The
 * recipe's material formula.
 * @returns {Object<string, string>|null} Amounts keyed by materialId as input-ready
 * strings, or null when there is nothing to compute — a zero total or an empty
 * recipe. Null rather than an empty object so callers can no-op instead of wiping
 * hand-entered values.
 *
 * @example
 * calculateMaterialAmounts({
 *   quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10', unit: 'roll',
 *   recipeItems: [{ materialId: 'a9d2…', percentage: 70 }]
 * }) // { 'a9d2…': '532' }
 */
export function calculateMaterialAmounts({ quantityProduced, netWeightPerUnit, scrapKg, unit, recipeItems }) {
    const totalKg = calculateTotalKg({ quantityProduced, netWeightPerUnit, scrapKg, unit })
    if (!totalKg || !recipeItems?.length) return null

    const computed = {}
    recipeItems.forEach(item => {
        // toFixed(2) then parseFloat: round to 2 decimals for sane kg values but
        // strip trailing zeros ("525.00" → "525") so inputs look hand-entered.
        computed[item.materialId] = String(
            parseFloat((totalKg * item.percentage / 100).toFixed(2))
        )
    })
    return computed
}

/**
 * The formula the calculator will actually apply, for display above its inputs.
 *
 * Without this on screen an operator has no way to tell that Neto stopped feeding
 * the math — which is how the kg branch stayed invisible for as long as it did.
 *
 * @param {string|null|undefined} unit - The product's unit.
 * @returns {string} A one-line formula.
 *
 * @example
 * formulaLabel('kg')   // 'Total = Quantity (kg) + Scrap'
 * formulaLabel('roll') // 'Total = Quantity × Neto + Scrap'
 */
export function formulaLabel(unit) {
    return isWeightUnit(unit)
        ? 'Total = Quantity (kg) + Scrap'
        : 'Total = Quantity × Neto + Scrap'
}
