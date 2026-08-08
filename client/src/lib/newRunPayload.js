/**
 * @file newRunPayload.js
 * @description The two ends of one pipeline: what wizard step 1 reports upward,
 * and what the wizard then puts on the wire for POST /api/production-runs.
 *
 * They live together because they enforce a single rule between them: **a step
 * reports its whole slice; the payload builder decides what gets sent.** Step 1
 * used to report only the optionals the operator had filled in, which sounds
 * harmless until you remember how the wizard consumes it — `{ ...formData,
 * ...stepData }`. A missing key in a spread does not overwrite anything, so
 * "absent" did not mean "blank", it meant "keep whatever was there before". An
 * operator who returned to step 1 and *deleted* an energy reading got the run
 * created with the reading they had just deleted. Reporting every key, blank
 * ones included, is what makes a cleared field actually clear.
 *
 * Lives in lib/ rather than inside the components for the reason wizardNav.js
 * and energy.js do: the client suite runs `environment: 'node'` with no jsdom
 * (client/vitest.config.js), so logic embedded in a component cannot be
 * asserted on at all — and this logic decides what a production run is
 * created with.
 */
import { localToUTCISOString, rollToNextDayIfBefore } from './dates'

/**
 * Step 1's slice of the wizard's formData, with every key present.
 *
 * Blank optionals come back as `''` rather than being omitted. That is the
 * point of the function: `''` overwrites a stale value on the merge, an absent
 * key does not. Deciding what is worth sending is `buildCreateRunPayload`'s
 * job, one step later — it already drops `''` for all four.
 *
 * @param {Object} fields - The step's current input values, all strings.
 * @param {string} fields.operatorId
 * @param {string} fields.machineId
 * @param {string} fields.productId
 * @param {string} fields.date - "YYYY-MM-DD".
 * @param {string} fields.startTime - "HH:mm".
 * @param {string} fields.warmupStartTime - "HH:mm", or '' when unset.
 * @param {string} fields.stableStartTime - "HH:mm", or '' when unset.
 * @param {string} fields.energyStart - kWh reading as typed, or '' when unset.
 * @param {string} fields.potentialBuyer - Free text, or '' when unset.
 * @returns {Object} The same nine keys, ready to merge over formData.
 *
 * @example
 * buildStep1Data({ ...filled, energyStart: '' }).energyStart  // '' — not missing
 */
export function buildStep1Data({
    operatorId,
    machineId,
    productId,
    date,
    startTime,
    warmupStartTime,
    stableStartTime,
    energyStart,
    potentialBuyer,
}) {
    return {
        operatorId,
        machineId,
        productId,
        date,
        startTime,
        warmupStartTime,
        stableStartTime,
        energyStart,
        potentialBuyer,
    }
}

/**
 * The request body for creating an in_progress run from steps 1-2.
 *
 * Precondition: `data` is the wizard's own formData, whose optional fields are
 * always strings — they are seeded as `''` in NewRunPage and only ever written
 * by an input. `energyStart` in particular must never arrive as `undefined`:
 * it would slip past the `!== ''` test into `Number(undefined)` → `NaN`.
 *
 * @param {Object} data - Merged formData from steps 1 and 2.
 * @returns {Object} The POST payload; optional fields absent when unfilled.
 *
 * @example
 * buildCreateRunPayload({ ...formData, energyStart: '' })  // no energyStart key
 */
export function buildCreateRunPayload(data) {
    return {
        // Every timestamp in this payload is real UTC now — date and the
        // wall-clock fields alike both go through the browser's own
        // local-to-UTC conversion.
        date: new Date(data.date).toISOString(),
        startTime: localToUTCISOString(data.date, data.startTime),
        operatorId: data.operatorId,
        machineId: data.machineId,
        productId: data.productId,
        recipeId: data.recipeId,
        ...(data.warmupStartTime && {
            // No rollover: warmup legitimately precedes startTime on the same
            // calendar day, unlike stableStartTime below.
            warmupStartTime: localToUTCISOString(data.date, data.warmupStartTime)
        }),
        ...(data.stableStartTime && {
            // Rolls forward only when stable's wall-clock is STRICTLY before
            // start's. Deliberately not endTime's at-or-before rule: an equal
            // pair means the line stabilised the instant it started, which the
            // server accepts and which rolling would store a day late.
            stableStartTime: rollToNextDayIfBefore(data.date, data.startTime, data.stableStartTime)
        }),
        // !== '' rather than !== undefined: formData seeds energyStart as '',
        // so a blank field was never undefined and went out as Number('') → 0,
        // recording a meter reading nobody took. Truthiness would be wrong the
        // other way — 0 is a real reading on a newly installed meter.
        ...(data.energyStart !== '' && { energyStart: Number(data.energyStart) }),
        ...(data.potentialBuyer && { potentialBuyer: data.potentialBuyer }),
        ...(data.notes && { notes: data.notes }),
    }
}
