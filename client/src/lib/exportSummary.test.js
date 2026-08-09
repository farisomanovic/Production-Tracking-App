/**
 * @file exportSummary.test.js
 * @description Guards the `Quantity Produced` summary cell in the XLSX export —
 * the one summed column whose rows can be in different units, which until now was
 * added together into a single unlabelled number (`1 kg + 1234.5 kg + 42 roll`
 * → `Sum: 1277.5`).
 *
 * Assertions are on the exact formula string rather than on fragments of it. The
 * string is never evaluated here — Excel evaluates it on open — so a test that
 * merely checked "contains SUMIF" would stay green for a formula that is
 * syntactically broken or points at the wrong range, which is the whole failure
 * mode worth catching.
 *
 * Column letters O/P are the real ones the export produces for a machine with no
 * parameters or materials, and the four units are VALID_UNITS.
 */
import { describe, it, expect } from 'vitest'
import { quantitySummaryFormula, quantitySummaryMinWidth } from './exportSummary'

describe('quantitySummaryFormula', () => {
    // The single-product case, and the common one. It was already correct before
    // this module existed, so the requirement is that it does not regress — it
    // gains a unit label and keeps the plain SUM.
    it('sums plainly and states the unit when every run shares one', () => {
        expect(quantitySummaryFormula({
            units: ['kg'],
            quantityColumn: 'O',
            unitColumn: 'P',
            lastDataRow: 9
        })).toBe('"Sum: "&SUM(O2:O9)&" kg"')
    })

    // The bug this module exists for. Two units must produce two independent
    // SUMIF subtotals keyed on the Unit column, never one SUM across both.
    it('breaks the total down per unit when the sheet holds more than one', () => {
        expect(quantitySummaryFormula({
            units: ['kg', 'roll'],
            quantityColumn: 'O',
            unitColumn: 'P',
            lastDataRow: 9
        })).toBe('"kg: "&SUMIF(P2:P9,"kg",O2:O9)&" | roll: "&SUMIF(P2:P9,"roll",O2:O9)')
    })

    // Deliberately NOT in alphabetical order: the caller discovers units first-seen
    // while building its columns, and the cell must read in that same order. Sorted
    // these would be kg/m/pcs/roll, so a stray sort cannot pass this.
    it('keeps the caller-supplied unit order across the whole vocabulary', () => {
        expect(quantitySummaryFormula({
            units: ['roll', 'kg', 'pcs', 'm'],
            quantityColumn: 'O',
            unitColumn: 'P',
            lastDataRow: 9
        })).toBe(
            '"roll: "&SUMIF(P2:P9,"roll",O2:O9)'
            + '&" | kg: "&SUMIF(P2:P9,"kg",O2:O9)'
            + '&" | pcs: "&SUMIF(P2:P9,"pcs",O2:O9)'
            + '&" | m: "&SUMIF(P2:P9,"m",O2:O9)'
        )
    })

    // A one-run export makes first and last data row the same. The range must
    // collapse to a single cell rather than inverting into O2:O1, which Excel
    // silently reinterprets rather than rejecting.
    it('produces a single-cell range when there is only one data row', () => {
        expect(quantitySummaryFormula({
            units: ['kg', 'roll'],
            quantityColumn: 'O',
            unitColumn: 'P',
            lastDataRow: 2
        })).toBe('"kg: "&SUMIF(P2:P2,"kg",O2:O2)&" | roll: "&SUMIF(P2:P2,"roll",O2:O2)')
    })

    // A blank criteria is not inert in Excel: SUMIF(range,"",...) matches EMPTY
    // cells, so an unfiltered blank would emit an unlabelled ": 0" term and, worse,
    // push a genuinely single-unit sheet into the mixed branch.
    it('ignores a blank unit rather than giving it a subtotal', () => {
        expect(quantitySummaryFormula({
            units: ['kg', '', null],
            quantityColumn: 'O',
            unitColumn: 'P',
            lastDataRow: 9
        })).toBe('"Sum: "&SUM(O2:O9)&" kg"')
    })

    it('returns null when there is no unit to total', () => {
        expect(quantitySummaryFormula({
            units: [],
            quantityColumn: 'O',
            unitColumn: 'P',
            lastDataRow: 9
        })).toBeNull()
    })
})

describe('quantitySummaryMinWidth', () => {
    // 'Sum: ' + a number + ' ' + 'kg'. Below the 19 the header already forces, so
    // the single-unit case must never widen the column on its own.
    it('stays under the header-driven width for a single unit', () => {
        expect(quantitySummaryMinWidth(['kg'])).toBe(18)
    })

    // Each extra unit adds a label, a number and a separator. Without this the
    // column keeps its header width and Excel clips the breakdown mid-word.
    it('grows with every additional unit', () => {
        expect(quantitySummaryMinWidth(['kg', 'roll'])).toBe(33)
        expect(quantitySummaryMinWidth(['kg', 'm', 'roll', 'pcs'])).toBe(67)
    })

    it('reserves nothing when no cell will be written', () => {
        expect(quantitySummaryMinWidth([])).toBe(0)
    })
})
