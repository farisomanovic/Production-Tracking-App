/**
 * @file newRunPayload.test.js
 * @description Guards the rule that makes a cleared field in wizard step 1
 * actually clear: the step reports every key it owns, and the payload builder
 * decides what is worth sending.
 *
 * The bug these exist for was reachable with four clicks — step 1, Next, Back,
 * delete the value, Next — because step 1 omitted blank optionals and the
 * wizard merges with a spread, where an absent key preserves the old value
 * instead of blanking it. Tests 1-4 replay exactly that sequence over the pure
 * layer: a formData that already holds the value, a step 1 that now reports it
 * empty, and the payload that comes out the far end.
 *
 * Timezone-dependent fields (date, startTime) are deliberately never asserted
 * on here — lib/dates.test.js owns the UTC conversions.
 */
import { describe, it, expect } from 'vitest'
import { buildStep1Data, buildCreateRunPayload } from './newRunPayload'

// The state an operator is in when the bug bites: step 1 filled in once with
// every optional, step 2's recipe chosen, and Back pressed. Extra keys are
// harmless — buildStep1Data destructures only the nine it owns.
const FILLED = {
    operatorId: 'a3f1-op',
    machineId: 'b7c2-ma',
    productId: 'd9e4-pr',
    date: '2026-08-08',
    startTime: '07:30',
    warmupStartTime: '06:45',
    stableStartTime: '08:15',
    energyStart: '1500',
    potentialBuyer: 'Bingo d.o.o.',
    recipeId: 'f5a8-rc',
}

const OPTIONALS = ['warmupStartTime', 'stableStartTime', 'energyStart', 'potentialBuyer']

describe('clearing an optional field on a return to step 1', () => {
    // One case per field rather than one test asserting all four: a single
    // reinstated conditional spread only breaks its own field, so a combined
    // test would leave the other three unproven.
    it.each(OPTIONALS)('drops %s from the payload once the operator empties it', (field) => {
        const stepData = buildStep1Data({ ...FILLED, [field]: '' })

        // The merge NewRunPage performs. FILLED still holds the old value, so
        // this is the line the whole bug turned on.
        const payload = buildCreateRunPayload({ ...FILLED, ...stepData })

        expect(payload).not.toHaveProperty(field)
    })
})

describe('buildCreateRunPayload', () => {
    // The input hands over a string; the server column is a number. Sending
    // "1500" leans on whatever coercion happens to be downstream.
    it('sends a filled energy reading as a number, not the input string', () => {
        const payload = buildCreateRunPayload(FILLED)

        expect(payload.energyStart).toBe(1500)
    })

    // A meter installed this morning genuinely reads 0. It has to survive as a
    // recorded measurement instead of being swept up with "nothing entered" —
    // which is what any truthiness test on this field would do.
    it('keeps a 0 reading rather than treating it as an empty field', () => {
        const payload = buildCreateRunPayload({ ...FILLED, energyStart: '0' })

        expect(payload.energyStart).toBe(0)
    })
})
