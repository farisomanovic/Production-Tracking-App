/**
 * @file energy.test.js
 * @description Guards the "Energy Consumed (kWh)" column in the XLSX export and
 * the matching row on the run detail page. Both used to subtract the readings
 * inline with no floor, so a transposed pair exported as a negative kWh figure
 * into a report that leaves the building.
 *
 * The readings are the real ones from the wizard's own placeholders (12400 /
 * 12500) rather than round toy numbers, so the arithmetic is the arithmetic an
 * operator actually produces.
 */
import { describe, it, expect } from 'vitest'
import { energyConsumed } from './energy'

describe('energyConsumed', () => {
    it('subtracts the start reading from the end reading', () => {
        expect(energyConsumed(12400, 12500)).toBe(100)
    })

    // The whole reason this function exists. A meter cannot run backwards, so
    // the pair is unusable — and a negative is worse than a blank, because it
    // sums cleanly into the export's totals instead of looking broken.
    it('returns null for a pair that runs backwards', () => {
        expect(energyConsumed(12500, 12400)).toBeNull()
    })

    it('returns null when either reading is missing', () => {
        expect(energyConsumed(null, 12500)).toBeNull()
        expect(energyConsumed(12400, null)).toBeNull()
        expect(energyConsumed(undefined, undefined)).toBeNull()
    })

    // A run whose meter did not visibly move consumed 0, and 0 is a real
    // measurement — it must survive as a number rather than falling into the
    // null branch alongside "no reading taken".
    it('returns 0 for an equal pair rather than null', () => {
        expect(energyConsumed(12400, 12400)).toBe(0)
    })

    // The subtraction's own float noise: 12400.3 - 12400.1 is
    // 0.19999999999999998 in IEEE 754, which would reach the spreadsheet cell
    // verbatim without the rounding.
    it('rounds the difference to one decimal', () => {
        expect(energyConsumed(12400.1, 12400.3)).toBe(0.2)
    })
})
