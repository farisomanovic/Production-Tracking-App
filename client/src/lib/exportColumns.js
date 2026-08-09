/**
 * @file exportColumns.js
 * @description Owns the XLSX export's column layout: the fixed header text, and the
 * 0-based index of every column the summary row has to address.
 *
 * The subtlety, and the reason this is not one array literal inside the page: the
 * export's column count VARIES. Parameter and material columns are discovered from
 * the exported runs and spliced into the middle, so the fixed columns behind them
 * sit at a different index on every machine. The page used to recover those indices
 * by searching the finished header array for the literal text —
 * `headers.findIndex(h => h === 'Unit')`.
 *
 * That search is unsafe, because a parameter's header is operator-typed text
 * (`${name}${unit ? ` (${unit})` : ''}`) and those columns come FIRST. A parameter
 * named `Unit`, or `Scrap` with unit `kg`, produces a duplicate header, and
 * `findIndex` returns the parameter's column instead of the real one. Since the
 * mixed-unit work, `Unit` is a SUMIF criteria range — so that collision no longer
 * merely misplaces a cell, it silently subtotals the quantity column against a
 * column of temperatures and prints `kg: 0 | roll: 0` on the accountant's sheet.
 *
 * The positions were never actually unknown: they are fixed distances from the start
 * and the end of the array. This module computes them instead of searching for them,
 * which makes the operator's text irrelevant to where a formula lands.
 *
 * Lives in lib/ rather than inside ProductionRunsPage for the reason exportSummary.js
 * and runWeights.js do — the client suite runs `environment: 'node'` with no jsdom
 * (client/vitest.config.js), so a function inside a component cannot be tested at
 * all, and this is index arithmetic nothing downstream can check.
 */

/**
 * The fixed columns that precede the discovered ones.
 *
 * These were already immune to a name collision by accident rather than by design:
 * they sit at the front, and `findIndex` returns the FIRST match, so a parameter
 * duplicating one of them could never win. Resolving them the same way as the rest
 * removes the need for a reader to work that out.
 */
export const LEADING_HEADERS = [
    'Date',
    'Machine',
    'Operator',
    'Product',
    'Recipe',
    'Warmup Start',
    'Start Time',
    'Stable Start',
    'End Time',
    'Energy Start (kWh)',
    'Energy End (kWh)',
    'Energy Consumed (kWh)'
]

/**
 * The fixed columns that follow the discovered ones. These are the ones a duplicate
 * parameter header could steal.
 *
 * `Unit` gets its own column rather than a suffix on the header or in the cell:
 * one machine makes several products, so the sheet can carry more than one unit, and
 * the quantity cell must stay numeric — text in it would silently zero the summary
 * row's total. The column is load-bearing rather than merely informative: the
 * per-unit subtotals are SUMIFs keyed on it, so moving or renaming it breaks them.
 */
export const TRAILING_HEADERS = [
    'Quantity Produced',
    'Unit',
    'Neto per Unit (kg)',
    'Total Neto (kg)',
    'Bruto per Unit (kg)',
    'Total Bruto (kg)',
    'Scrap (kg)',
    'Notes'
]

/**
 * The columns that get a plain `SUM` with a `kg` label on the summary row.
 *
 * `Quantity Produced` is deliberately NOT here: these three are kg on every row by
 * construction (runWeights.js returns kg whatever the product's unit, and scrap is kg
 * by definition), so a plain SUM is dimensionally sound and only needs the unit
 * stating. The quantity column is in the product's own unit and gets the per-unit
 * treatment in exportSummary.js instead.
 *
 * The per-unit weight columns get no SUM at all, on purpose — adding per-unit weights
 * across different runs is a meaningless number on the report.
 */
const KG_SUM_HEADERS = ['Total Neto (kg)', 'Total Bruto (kg)', 'Scrap (kg)']

/**
 * Assembles the export's header row and the indices the summary row writes to.
 *
 * @param {Object} input
 * @param {string[]} [input.parameterHeaders] - Discovered parameter columns, already
 * sanitized by the caller, in first-seen order.
 * @param {string[]} [input.materialHeaders] - Discovered material columns, already
 * sanitized, in first-seen order.
 * @returns {{
 *   headers: string[],
 *   dateIndex: number,
 *   materialStartIndex: number,
 *   quantityIndex: number,
 *   unitIndex: number,
 *   kgSumIndexes: number[],
 *   notesIndex: number
 * }} All indices 0-based, into `headers`.
 *
 * @example
 * exportColumnLayout({ parameterHeaders: ['Unit'], materialHeaders: ['Granulat Used (kg)'] }).unitIndex
 * // 15 — the real Unit column, not the parameter at 12
 */
export function exportColumnLayout({ parameterHeaders = [], materialHeaders = [] } = {}) {
    const headers = [
        ...LEADING_HEADERS,
        ...parameterHeaders,
        ...materialHeaders,
        ...TRAILING_HEADERS
    ]

    const materialStartIndex = LEADING_HEADERS.length + parameterHeaders.length
    const trailingStartIndex = materialStartIndex + materialHeaders.length

    // indexOf is safe HERE and was not safe in the page: it searches a constant
    // declared in this file, which cannot contain operator-supplied text.
    const trailing = name => trailingStartIndex + TRAILING_HEADERS.indexOf(name)

    return {
        headers,
        dateIndex: LEADING_HEADERS.indexOf('Date'),
        // Correct by construction with no materials, where the old search returned
        // -1 and was harmless only because the loop consuming it was empty.
        materialStartIndex,
        quantityIndex: trailing('Quantity Produced'),
        unitIndex: trailing('Unit'),
        kgSumIndexes: KG_SUM_HEADERS.map(trailing),
        notesIndex: trailing('Notes')
    }
}
