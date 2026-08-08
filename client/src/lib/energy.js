/**
 * @file energy.js
 * @description Derives a run's electricity consumption from the two kWh meter
 * readings the operator records — the start one at the machine, the end one at
 * completion.
 *
 * The subtlety is not the arithmetic, it is what to do when the arithmetic
 * comes out negative. A kWh totalizer only climbs, so `end < start` describes
 * something that did not happen: a transposed pair, or two readings taken off
 * two different meters. The server now refuses to store such a pair, but the
 * export still has to survive one arriving from anywhere else — a direct SQL
 * edit, or a row that predates the guard. Returning the raw difference would
 * put a NEGATIVE number in the accountant's "Energy Consumed" column, which is
 * wrong in a way a reader cannot spot: it sums cleanly, and it drags the total
 * down instead of looking broken.
 *
 * Lives in lib/ rather than inside ProductionRunsPage for the reason
 * runWeights.js does — the client suite runs `environment: 'node'` with no jsdom
 * (client/vitest.config.js), so a function inside a component cannot be tested
 * at all, and this feeds a figure nothing downstream can check.
 */

/**
 * Electricity consumed over a run, in kWh.
 *
 * @param {number|null|undefined} energyStart - Meter reading when the run began.
 * @param {number|null|undefined} energyEnd - Meter reading when it ended.
 * @returns {number|null} Null when it cannot be derived — either reading
 * missing, or a pair that runs backwards. Callers write a blank cell or a dash
 * rather than a number they would have to apologise for.
 *
 * @example
 * energyConsumed(12400, 12500)  // 100
 * energyConsumed(12500, 12400)  // null — the counter cannot run backwards
 * energyConsumed(12400, null)   // null
 */
export function energyConsumed(energyStart, energyEnd) {
    // == null catches both null and undefined: a run in progress has no end
    // reading, and a run created before the field existed has neither.
    if (energyStart == null || energyEnd == null) return null

    const consumed = energyEnd - energyStart
    if (consumed < 0) return null

    // One decimal, the export's existing convention for computed figures. Here
    // it hides float noise from the subtraction itself (12400.3 - 12400.1
    // = 0.19999999999999998), which a raw difference would carry into the cell.
    return Number(consumed.toFixed(1))
}
