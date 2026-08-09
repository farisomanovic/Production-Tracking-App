/**
 * @file exportNotice.js
 * @description Builds the note the XLSX export writes below its summary row when the
 * fetch that fed it was capped by the server.
 *
 * Why the note goes IN the sheet rather than only on screen: a capped result used to
 * disable the export button outright, which handed the office nothing at all for a
 * condition the app had successfully detected. Exporting the rows the user can already
 * see is strictly more useful — but only if the sheet says what it is missing, because
 * the sheet is what gets printed and handed over, and the person reading it never saw
 * the banner on the screen it came from.
 *
 * The note names the ACTUAL exported row count rather than the requested limit. The
 * client no longer knows the server's cap — truncation now arrives as an X-Has-More
 * header instead of being inferred from a hand-copied constant — and the real figure
 * was the better sentence anyway.
 *
 * Lives in lib/ rather than inside ProductionRunsPage for the reason exportSummary.js
 * and exportColumns.js do — the client suite runs `environment: 'node'` with no jsdom
 * (client/vitest.config.js), so a function inside a component cannot be tested at all,
 * and this is row arithmetic plus a string nothing downstream can check.
 */

/**
 * Blank rows left between the summary row and the note.
 *
 * One, not zero: the summary row is a dense line of `Sum:` cells, and a sentence
 * pressed directly against it reads as another entry in that row rather than as a
 * caveat about the whole report.
 */
const BLANK_ROWS_BEFORE_NOTICE = 1

/**
 * Where the truncation note goes and what it says.
 *
 * Bosnian, matching the summary row (`Broj radnih dana`, `Broj unosa`) rather than the
 * English column headers: this is the one line on the sheet whose entire job is to be
 * understood by whoever received the printout.
 *
 * @param {Object} input
 * @param {number} input.summaryRow - 1-based row number of the summary row.
 * @param {number} input.rowCount - How many data rows the sheet actually carries.
 * @returns {{ row: number, text: string }} `row` is 1-based, for an `A${row}` address;
 * the caller must also widen the sheet's `!ref` to reach it or Excel ignores the cell.
 *
 * @example
 * truncationNotice({ summaryRow: 24, rowCount: 1000 })
 * // { row: 26, text: 'Napomena: izvještaj sadrži samo 1000 najnovijih unosa …' }
 */
export function truncationNotice({ summaryRow, rowCount }) {
    return {
        row: summaryRow + BLANK_ROWS_BEFORE_NOTICE + 1,
        // Written to the sheet as a plain string, deliberately not through the page's
        // sanitizeCellText: this text is ours, not operator input. That safety rests
        // entirely on the wording never starting with a character Excel reads as a
        // formula — which is a test, not a hope. See exportNotice.test.js.
        text: `Napomena: izvještaj sadrži samo ${rowCount} najnovijih unosa za odabrane filtere — stariji unosi nisu uključeni.`
    }
}
