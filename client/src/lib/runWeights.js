/**
 * @file runWeights.js
 * @description Derives a run's TOTAL neto and bruto weight in kg for the XLSX
 * export, from the per-unit weights the operator records at the machine.
 *
 * The subtlety, and the reason this is not one multiplication: `quantityProduced`
 * is recorded in the product's own `unit`, so `quantity × per-unit weight` is only
 * dimensionally sound when the quantity is a COUNT. On a `kg` product the quantity
 * is already the total neto weight, and multiplying it by a per-unit weight
 * produces kg²/roll — a number roughly 24× too large with no unit at all. That is
 * the same trap materialSplit.js exists for, one column over: the calculator's
 * version fed the stock decrement, this one feeds the sheet the accountant reads.
 *
 * Lives in lib/ rather than inside ProductionRunsPage for the reason quantity.js
 * and materialSplit.js do — the client suite runs `environment: 'node'` with no
 * jsdom (client/vitest.config.js), so a function inside a component cannot be
 * tested at all, and this is arithmetic nothing downstream can check.
 */
import { isWeightUnit } from './materialSplit'

/**
 * One decimal place, the export's existing convention for computed totals.
 *
 * Applied only to results of a multiplication, where it hides float noise
 * (5 × 24.75 = 123.74999…). A value that is passed through untouched must NOT
 * go through here — rounding it discards a digit the operator actually recorded.
 */
function roundTotal(value) {
    return Number(value.toFixed(1))
}

/**
 * The run's total net weight in kg.
 *
 * @param {Object} input
 * @param {number|null|undefined} input.quantityProduced - In the product's own unit.
 * @param {number|null|undefined} input.netWeightPerUnit - Weight of one unit in kg.
 * @param {string|null|undefined} input.unit - The product's unit.
 * @returns {number|null} Null when it cannot be derived, so the caller writes a
 * blank cell rather than a misleading 0.
 *
 * @example
 * totalNetKg({ quantityProduced: 247, netWeightPerUnit: 24.7, unit: 'kg' })   // 247
 * totalNetKg({ quantityProduced: 10, netWeightPerUnit: 24.7, unit: 'roll' })  // 247
 */
export function totalNetKg({ quantityProduced, netWeightPerUnit, unit }) {
    if (quantityProduced == null) return null

    // A kg quantity IS the net total. Returned verbatim, unrounded — there is no
    // multiplication here and therefore no float noise to hide, so rounding would
    // only throw away recorded precision (114.25 kg → 114.3).
    if (isWeightUnit(unit)) return quantityProduced

    if (netWeightPerUnit == null) return null
    return roundTotal(quantityProduced * netWeightPerUnit)
}

/**
 * The run's total gross weight in kg — product plus core/packaging.
 *
 * On a count product this is `count × bruto`. On a kg product the count is not
 * stored, so it is reconstructed as `quantity ÷ neto` and multiplied back up.
 * That reconstruction is an estimate, but the figure it replaces was one too:
 * `grossWeightPerUnit` is itself an average over rolls whose weights vary, which
 * is precisely why kg products moved to being weighed instead of counted.
 *
 * @param {Object} input
 * @param {number|null|undefined} input.quantityProduced - In the product's own unit.
 * @param {number|null|undefined} input.netWeightPerUnit - Weight of one unit in kg.
 * @param {number|null|undefined} input.grossWeightPerUnit - Gross weight of one unit in kg.
 * @param {string|null|undefined} input.unit - The product's unit.
 * @returns {number|null} Null when it cannot be derived — including a kg product
 * with no usable neto, where there is no way back to a unit count.
 *
 * @example
 * totalGrossKg({ quantityProduced: 247, netWeightPerUnit: 24.7, grossWeightPerUnit: 26.6, unit: 'kg' })   // 266
 * totalGrossKg({ quantityProduced: 10, netWeightPerUnit: 24.7, grossWeightPerUnit: 26.6, unit: 'roll' })  // 266
 */
export function totalGrossKg({ quantityProduced, netWeightPerUnit, grossWeightPerUnit, unit }) {
    if (quantityProduced == null || grossWeightPerUnit == null) return null

    if (!isWeightUnit(unit)) return roundTotal(quantityProduced * grossWeightPerUnit)

    // `> 0` rather than `!= null`: null, 0 and a negative neto all make the unit
    // count unrecoverable, and dividing by 0 would put Infinity in a spreadsheet
    // cell. NaN fails this comparison too, which is the intent.
    if (!(netWeightPerUnit > 0)) return null
    return roundTotal(quantityProduced / netWeightPerUnit * grossWeightPerUnit)
}
