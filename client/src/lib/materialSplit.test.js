/**
 * @file materialSplit.test.js
 * @description Guards the arithmetic behind the Quick Calculator in both completion
 * forms. This is stock math: whatever comes out of `calculateMaterialAmounts` lands
 * in `MaterialUsage.quantityUsed` and decrements `Material.stockQty` on completion,
 * and the server can only check that the number is positive and finite — never that
 * it is right. Nothing downstream of these functions can catch a wrong magnitude,
 * which is why the depth here is out of proportion to the file's size.
 *
 * The cases that matter most are the unit branches. A `kg` product's quantity is
 * already a weight, so multiplying it by a per-unit weight inflates every material
 * amount by a factor of neto — silently, and only for one product family.
 */
import { describe, it, expect } from 'vitest'
import {
    isWeightUnit,
    calculateTotalKg,
    calculateMaterialAmounts,
    formulaLabel
} from './materialSplit'

// 70/30 is the shape of a real two-material foil recipe and makes the split
// checkable by hand: 70% of 760 is 532.
const RECIPE = [
    { materialId: 'mat-a', percentage: 70 },
    { materialId: 'mat-b', percentage: 30 }
]

describe('calculateTotalKg', () => {
    // The whole point of the file. 1000 kg of foil is 1000 kg of output no matter
    // what one roll happens to weigh, so neto must not appear in this result.
    it('treats a kg quantity as the total weight and ignores neto', () => {
        expect(calculateTotalKg({
            quantityProduced: '1000', netWeightPerUnit: '1.5', scrapKg: '0', unit: 'kg'
        })).toBe(1000)
    })

    // Stronger than the case above: it pins that neto is inert rather than merely
    // absent from one arithmetic path. A wildly wrong neto must change nothing.
    it('gives the same kg total for any neto whatsoever', () => {
        const withSmallNeto = calculateTotalKg({
            quantityProduced: '1000', netWeightPerUnit: '1.5', scrapKg: '20', unit: 'kg'
        })
        const withHugeNeto = calculateTotalKg({
            quantityProduced: '1000', netWeightPerUnit: '99', scrapKg: '20', unit: 'kg'
        })
        expect(withSmallNeto).toBe(1020)
        expect(withHugeNeto).toBe(1020)
    })

    // Before this change a kg run with neto left blank returned 0 and the button
    // did nothing at all, so the operator did the arithmetic by hand at the
    // machine — the exact work the calculator exists to remove.
    it('computes a kg total when neto is blank', () => {
        expect(calculateTotalKg({
            quantityProduced: '1000', netWeightPerUnit: '', scrapKg: '20', unit: 'kg'
        })).toBe(1020)
    })

    it('multiplies a pcs quantity by neto', () => {
        expect(calculateTotalKg({
            quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10', unit: 'pcs'
        })).toBe(760)
    })

    // Separate from pcs rather than table-driven: roll is the unit every existing
    // production run uses, so a change that quietly moved it onto the kg branch
    // would rewrite the material math for the entire current workload.
    it('multiplies a roll quantity by neto', () => {
        expect(calculateTotalKg({
            quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10', unit: 'roll'
        })).toBe(760)
    })

    // Records a deliberate non-decision: metres × kg-per-metre is dimensionally
    // sound, so `m` needs no special case. If a length product ever ships and this
    // turns out wrong, this test is where the argument is written down.
    it('multiplies a metre quantity by neto, needing no special case', () => {
        expect(calculateTotalKg({
            quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10', unit: 'm'
        })).toBe(760)
    })

    // An unknown unit must behave like the old code did, not like kg. Guessing
    // "additive" on a failed unit lookup would under-order material for a roll
    // product by a factor of neto, which is the same bug pointing the other way.
    it('falls back to multiplying when the unit is missing or unrecognised', () => {
        expect(calculateTotalKg({
            quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10', unit: ''
        })).toBe(760)
        expect(calculateTotalKg({
            quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10', unit: 'komad'
        })).toBe(760)
    })

    // Scrap came off the shelf too. Asserted on the kg branch specifically because
    // that is the branch this change rewrote — the multiply branch's scrap has
    // been in production since the calculator shipped.
    it('adds scrap on the kg branch', () => {
        const withoutScrap = calculateTotalKg({
            quantityProduced: '1000', netWeightPerUnit: '', scrapKg: '0', unit: 'kg'
        })
        const withScrap = calculateTotalKg({
            quantityProduced: '1000', netWeightPerUnit: '', scrapKg: '37.5', unit: 'kg'
        })
        expect(withScrap - withoutScrap).toBe(37.5)
    })
})

describe('calculateMaterialAmounts', () => {
    it('splits the total across the recipe percentages', () => {
        expect(calculateMaterialAmounts({
            quantityProduced: '500', netWeightPerUnit: '1.5', scrapKg: '10',
            unit: 'roll', recipeItems: RECIPE
        })).toEqual({ 'mat-a': '532', 'mat-b': '228' })
    })

    // Conservation of mass, stated separately from the case above: the amounts are
    // what gets subtracted from stock, so they must account for the whole run and
    // no more. Percentages are validated to total 100 server-side, and this is the
    // client half of that guarantee.
    it('produces a split that sums back to the total', () => {
        const amounts = calculateMaterialAmounts({
            quantityProduced: '1000', netWeightPerUnit: '', scrapKg: '20',
            unit: 'kg', recipeItems: RECIPE
        })
        const sum = Object.values(amounts).reduce((acc, v) => acc + Number(v), 0)
        expect(sum).toBe(1020)
    })

    // Two decimals is gram resolution, which is as fine as a factory scale reads.
    // The trailing-zero strip matters because the result is written into an input
    // the operator may then edit — "525.00" reads as machine output, "525" does not.
    it('rounds to two decimals and strips trailing zeros', () => {
        expect(calculateMaterialAmounts({
            quantityProduced: '100', netWeightPerUnit: '', scrapKg: '0', unit: 'kg',
            recipeItems: [{ materialId: 'mat-a', percentage: 33.333 }]
        })).toEqual({ 'mat-a': '33.33' })

        expect(calculateMaterialAmounts({
            quantityProduced: '750', netWeightPerUnit: '', scrapKg: '0', unit: 'kg',
            recipeItems: [{ materialId: 'mat-a', percentage: 70 }]
        })).toEqual({ 'mat-a': '525' })
    })

    // Null, not an object of zeros: pressing Recalculate on empty fields must leave
    // hand-entered material amounts alone rather than wiping them to 0, which the
    // wizard would then refuse to submit with no explanation of what changed.
    it('returns null when the fields are blank', () => {
        expect(calculateMaterialAmounts({
            quantityProduced: '', netWeightPerUnit: '', scrapKg: '',
            unit: 'kg', recipeItems: RECIPE
        })).toBeNull()
    })

    it('returns null for a recipe with no materials', () => {
        expect(calculateMaterialAmounts({
            quantityProduced: '1000', netWeightPerUnit: '1.5', scrapKg: '20',
            unit: 'kg', recipeItems: []
        })).toBeNull()
    })

    // The end-to-end statement of the bug, in the units of the thing that broke:
    // the same recorded run yields 1000 kg of material as a weight product and
    // 1500 kg as a counted one. Both are correct for their unit; picking the wrong
    // branch is a 50% error in the stock ledger.
    it('gives materially different amounts for a kg product than a counted one', () => {
        const asWeight = calculateMaterialAmounts({
            quantityProduced: '1000', netWeightPerUnit: '1.5', scrapKg: '0',
            unit: 'kg', recipeItems: [{ materialId: 'mat-a', percentage: 100 }]
        })
        const asCount = calculateMaterialAmounts({
            quantityProduced: '1000', netWeightPerUnit: '1.5', scrapKg: '0',
            unit: 'roll', recipeItems: [{ materialId: 'mat-a', percentage: 100 }]
        })
        expect(asWeight).toEqual({ 'mat-a': '1000' })
        expect(asCount).toEqual({ 'mat-a': '1500' })
    })
})

describe('isWeightUnit and formulaLabel', () => {
    it('classifies only kg as a weight unit', () => {
        expect(isWeightUnit('kg')).toBe(true)
        expect(isWeightUnit('roll')).toBe(false)
        expect(isWeightUnit('pcs')).toBe(false)
        expect(isWeightUnit('m')).toBe(false)
    })

    // The label is the only thing telling an operator that Neto stopped feeding the
    // math. If it describes the other branch it is worse than no label at all.
    it('states the formula that the matching branch actually applies', () => {
        expect(formulaLabel('kg')).toBe('Total = Quantity (kg) + Scrap')
        expect(formulaLabel('roll')).toBe('Total = Quantity × Neto + Scrap')
        expect(formulaLabel(undefined)).toBe('Total = Quantity × Neto + Scrap')
    })
})
