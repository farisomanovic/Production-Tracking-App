/**
 * @file runWeights.test.js
 * @description Guards the two total-weight columns in the XLSX export. Nothing
 * downstream can catch a wrong magnitude here: the sheet goes to the accountant,
 * and a total that is 24× too large is as plausible-looking as a correct one.
 *
 * The fixtures are deliberately the five REAL kg runs on `Masina za Foliju kod
 * kuce.` rather than invented numbers, because those rows have a known-good
 * answer. Before the 2026-08-08 backfill they stored a roll count and the export
 * multiplied by neto; after it they store kilograms and the export divides the
 * count back out. Both routes must land on the same figure — that equality is
 * what proves the migration and this file agree, and it is asserted directly in
 * the last describe block.
 */
import { describe, it, expect } from 'vitest'
import { totalNetKg, totalGrossKg } from './runWeights'

// 'Folija Polucrijevo 650', run of 2026-07-22: 10 rolls at 24.7 kg neto /
// 26.6 kg bruto, now stored as 247 kg.
const FOIL = { quantity: 247, count: 10, neto: 24.7, bruto: 26.6 }

describe('totalNetKg', () => {
    // The whole point of the file. A kg quantity IS the net total, so neto must
    // not appear in the result at all.
    it('returns a kg quantity unchanged as the net total', () => {
        expect(totalNetKg({
            quantityProduced: FOIL.quantity, netWeightPerUnit: FOIL.neto, unit: 'kg'
        })).toBe(247)
    })

    // Stronger than the case above: pins that neto is inert on the kg branch
    // rather than merely absent from one arithmetic path.
    it('gives the same kg net total for any neto whatsoever', () => {
        const withRealNeto = totalNetKg({
            quantityProduced: 500, netWeightPerUnit: 24.7, unit: 'kg'
        })
        const withAbsurdNeto = totalNetKg({
            quantityProduced: 500, netWeightPerUnit: 999, unit: 'kg'
        })
        expect(withRealNeto).toBe(500)
        expect(withAbsurdNeto).toBe(500)
    })

    // The 2026-07-20 run, whose corrected quantity is 114.25 kg. Rounding to one
    // decimal exists to hide float noise from a multiplication; the kg branch has
    // no multiplication, so rounding here would silently drop a recorded digit.
    it('keeps the cents on a kg net total instead of rounding to one decimal', () => {
        expect(totalNetKg({
            quantityProduced: 114.25, netWeightPerUnit: 22.85, unit: 'kg'
        })).toBe(114.25)
    })

    it('multiplies a count quantity by neto', () => {
        expect(totalNetKg({
            quantityProduced: FOIL.count, netWeightPerUnit: FOIL.neto, unit: 'roll'
        })).toBe(247)
    })

    // A count product without neto has no derivable total. Null, not 0 — the
    // caller writes '' and Excel's SUM skips it, whereas a 0 would drag the
    // column total down while looking like a measurement.
    it('returns null for a count quantity with no neto recorded', () => {
        expect(totalNetKg({
            quantityProduced: FOIL.count, netWeightPerUnit: null, unit: 'roll'
        })).toBeNull()
    })

    // The 2026-06-05 run: 255 kg with neto never recorded. The kg branch needs no
    // neto, so this must still produce a total.
    it('returns a kg net total even when neto was never recorded', () => {
        expect(totalNetKg({
            quantityProduced: 255, netWeightPerUnit: null, unit: 'kg'
        })).toBe(255)
    })

    // Both units, because the two branches reach null by different routes: the
    // count branch has to be stopped by the guard, while the kg branch would
    // return the null quantity as its own answer. Only the pair covers both.
    it.each(['kg', 'roll'])('returns null for a %s run with no quantity at all', (unit) => {
        expect(totalNetKg({
            quantityProduced: null, netWeightPerUnit: FOIL.neto, unit
        })).toBeNull()
    })
})

describe('totalGrossKg', () => {
    // The kg branch's reason to exist: quantity is kilograms, so it must be
    // divided back into a unit count before bruto can be applied.
    it('divides a kg quantity by neto to recover the unit count', () => {
        expect(totalGrossKg({
            quantityProduced: FOIL.quantity,
            netWeightPerUnit: FOIL.neto,
            grossWeightPerUnit: FOIL.bruto,
            unit: 'kg'
        })).toBe(266)
    })

    it('multiplies a count quantity by bruto directly', () => {
        expect(totalGrossKg({
            quantityProduced: FOIL.count,
            netWeightPerUnit: FOIL.neto,
            grossWeightPerUnit: FOIL.bruto,
            unit: 'roll'
        })).toBe(266)
    })

    // Zero is the dangerous one: `!= null` would let it through and put
    // Infinity in a spreadsheet cell. The 2026-06-05 run is the null case.
    it.each([
        ['null', null],
        ['zero', 0],
        ['negative', -1]
    ])('returns null for a kg quantity whose neto is %s', (_label, neto) => {
        expect(totalGrossKg({
            quantityProduced: 255,
            netWeightPerUnit: neto,
            grossWeightPerUnit: 1,
            unit: 'kg'
        })).toBeNull()
    })

    // A count product needs no neto to reach a gross total, so the guard above
    // must not leak onto this branch.
    it('returns a count gross total even when neto is missing', () => {
        expect(totalGrossKg({
            quantityProduced: FOIL.count,
            netWeightPerUnit: null,
            grossWeightPerUnit: FOIL.bruto,
            unit: 'roll'
        })).toBe(266)
    })

    it('returns null when bruto was never recorded', () => {
        expect(totalGrossKg({
            quantityProduced: FOIL.quantity,
            netWeightPerUnit: FOIL.neto,
            grossWeightPerUnit: null,
            unit: 'kg'
        })).toBeNull()
    })

    it('returns null when the run has no quantity at all', () => {
        expect(totalGrossKg({
            quantityProduced: null,
            netWeightPerUnit: FOIL.neto,
            grossWeightPerUnit: FOIL.bruto,
            unit: 'kg'
        })).toBeNull()
    })
})

/**
 * The backfill's correctness condition, stated as a test.
 *
 * Each row is one real run in its pre-backfill form (a roll count, read through
 * the count branch) and its post-backfill form (kilograms, read through the kg
 * branch). If the migration's new value and this file's kg branch are both right,
 * every column the accountant reads is unmoved by the change — only the
 * `Quantity Produced` column, the one that was incoherent, is different.
 *
 * This is what stops a plausible-looking but wrong kg branch from shipping: the
 * expected values were not chosen here, they are what the sheet already printed.
 */
describe('the 2026-08-08 backfill leaves both weight columns unchanged', () => {
    it.each([
        ['2026-07-13 Polucrijevo 650', 2, 47.7, 23.85, 25.75],
        ['2026-07-13 Crijevo 600', 10, 239.6, 23.96, 25.96],
        ['2026-07-20 Polucrijevo 650', 5, 114.25, 22.85, 24.75],
        ['2026-07-22 Polucrijevo 650', 10, 247, 24.7, 26.6]
    ])('%s reads the same before and after', (_label, count, kilograms, neto, bruto) => {
        const asCountedBefore = {
            quantityProduced: count, netWeightPerUnit: neto, grossWeightPerUnit: bruto, unit: 'roll'
        }
        const asWeighedAfter = {
            quantityProduced: kilograms, netWeightPerUnit: neto, grossWeightPerUnit: bruto, unit: 'kg'
        }

        // Net is compared at the export's one-decimal precision, not exactly,
        // and the difference is the point rather than a fudge: the 2026-07-20
        // run now reads 114.25 where the count branch printed 114.3, because the
        // kg branch has no multiplication to round. It GAINS a recorded digit.
        expect(Number(totalNetKg(asWeighedAfter).toFixed(1))).toBe(totalNetKg(asCountedBefore))

        // Gross is exact on all four — both branches end in the same
        // multiplication, so recovering the count must reproduce it to the bit.
        expect(totalGrossKg(asWeighedAfter)).toBe(totalGrossKg(asCountedBefore))
    })
})
