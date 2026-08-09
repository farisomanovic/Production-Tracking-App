/**
 * @file exportSummary.js
 * @description Builds the XLSX export's summary-row cells that a plain `SUM`
 * cannot express: the `Quantity Produced` column, whose rows are not all in the
 * same unit, and the `Date` column, which counts days rather than adding them.
 *
 * The subtlety in the quantity cell, and the reason it is not one `SUM`: the
 * export is scoped to a MACHINE, not a product, and one machine makes several
 * products. `quantityProduced` is recorded in the product's own `unit`
 * (schema.prisma), so a single sheet can legitimately hold kilograms, rolls and
 * metres in one column. Summing it produced
 * `1 kg + 1234.5 kg + 42 roll` → `Sum: 1277.5`, an unlabelled number that means
 * nothing — and worse, one that looks like every other total on the row. The three
 * other summed columns (`Total Neto (kg)`, `Total Bruto (kg)`, `Scrap (kg)`) are kg
 * for every row by construction, so they are dimensionally sound and stay a plain
 * `SUM`; this column is the exception.
 *
 * Formulas rather than numbers computed here, because the whole summary row is
 * deliberately formula-based with `fullCalcOnLoad` — the sheet stays live, so
 * deleting a data row still updates the totals. A literal number would silently
 * break that property for this one cell.
 *
 * Lives in lib/ rather than inside ProductionRunsPage for the reason runWeights.js
 * and energy.js do — the client suite runs `environment: 'node'` with no jsdom
 * (client/vitest.config.js), so a function inside a component cannot be tested at
 * all, and this builds a string nothing downstream can check.
 */

/** Row 1 is the header, so data always starts at row 2. */
const FIRST_DATA_ROW = 2

/**
 * Between the parts of a summary cell that carries more than one figure: the
 * per-unit subtotals in the mixed-unit quantity cell, and the two counts in the
 * date cell. Shared so the summary row reads consistently across both.
 */
const SEPARATOR = ' | '

/**
 * Characters to reserve for one rendered subtotal number. Deliberately generous:
 * the formula is not evaluated until Excel opens the file, so the real width is
 * unknowable at write time and over-reserving costs whitespace while
 * under-reserving costs a clipped, misleading cell.
 */
const NUMBER_ALLOWANCE = 10

/**
 * The units actually worth a subtotal.
 *
 * A blank unit would become `SUMIF(range,"",...)`, which in Excel matches EMPTY
 * cells rather than nothing — so it would emit a `: 0` term with no label. The
 * schema makes `Product.unit` required, so this is a guard against a hand-edited
 * row, not an expected path.
 */
function usableUnits(units) {
    return (units || []).filter(unit => typeof unit === 'string' && unit.length > 0)
}

/**
 * The formula for the `Quantity Produced` summary cell.
 *
 * One unit across the sheet — the single-product case, and the common one — keeps
 * today's total and merely states its unit. More than one gets a per-unit
 * breakdown built with `SUMIF` against the `Unit` column that already sits beside
 * the quantity column.
 *
 * Units are consumed in the order given rather than sorted, so the cell reads in
 * the same first-seen order the caller discovered its columns in.
 *
 * @param {Object} input
 * @param {string[]} input.units - Distinct product units present, in display order.
 * @param {string} input.quantityColumn - Excel letter of the `Quantity Produced` column.
 * @param {string} input.unitColumn - Excel letter of the `Unit` column.
 * @param {number} input.lastDataRow - 1-based row number of the final data row.
 * @returns {string|null} Null when there is nothing to total, so the caller writes
 * no cell at all rather than an empty formula.
 *
 * @example
 * quantitySummaryFormula({ units: ['kg'], quantityColumn: 'O', unitColumn: 'P', lastDataRow: 9 })
 * // '"Sum: "&SUM(O2:O9)&" kg"'
 * quantitySummaryFormula({ units: ['kg', 'roll'], quantityColumn: 'O', unitColumn: 'P', lastDataRow: 9 })
 * // '"kg: "&SUMIF(P2:P9,"kg",O2:O9)&" | roll: "&SUMIF(P2:P9,"roll",O2:O9)'
 */
export function quantitySummaryFormula({ units, quantityColumn, unitColumn, lastDataRow }) {
    const present = usableUnits(units)
    if (present.length === 0) return null

    const quantityRange = `${quantityColumn}${FIRST_DATA_ROW}:${quantityColumn}${lastDataRow}`

    if (present.length === 1) {
        return `"Sum: "&SUM(${quantityRange})&" ${present[0]}"`
    }

    const unitRange = `${unitColumn}${FIRST_DATA_ROW}:${unitColumn}${lastDataRow}`

    // The label carries its own leading separator rather than joining on one, so
    // the formula reads as alternating literal/value instead of the doubled
    // string literals (`&" | "&"roll: "&`) that a plain join would produce.
    //
    // The criteria is the unit text verbatim. Safe because VALID_UNITS is a closed
    // four-value vocabulary: SUMIF treats `*` and `?` as wildcards and matches
    // case-insensitively, and none of kg/m/roll/pcs contains either. That is a
    // constraint held today by a route validator, not by the database — it becomes
    // structural once Product.unit is a Postgres enum.
    return present
        .map((unit, index) => {
            const label = index === 0 ? `${unit}: ` : `${SEPARATOR}${unit}: `
            return `"${label}"&SUMIF(${unitRange},"${unit}",${quantityRange})`
        })
        .join('&')
}

/**
 * Minimum column width, in characters, for the `Quantity Produced` column.
 *
 * The export's `!cols` pass measures the header and the data rows only — the
 * summary row is assigned directly afterwards and never seen by it. A four-unit
 * breakdown is far wider than the 17-character header that would otherwise size
 * this column, and Excel clips overflow at the next non-empty cell: a cell reading
 * `kg: 903.55 | roll:` is worse than the unlabelled total it replaced.
 *
 * May legitimately exceed the export's 60-character ceiling. That ceiling exists to
 * stop one long free-text note from creating a screen-wide column; this width is
 * bounded by the size of the unit vocabulary and cannot run away.
 *
 * @param {string[]} units - Distinct product units present.
 * @returns {number} Character count; 0 when no cell will be written.
 *
 * @example
 * quantitySummaryMinWidth(['kg'])          // 18  — "Sum: 903.55 kg"
 * quantitySummaryMinWidth(['kg', 'roll'])  // 33  — "kg: 903.55 | roll: 42"
 */
export function quantitySummaryMinWidth(units) {
    const present = usableUnits(units)
    if (present.length === 0) return 0

    // 'Sum: ' + number + ' ' + unit
    if (present.length === 1) return 'Sum: '.length + NUMBER_ALLOWANCE + 1 + present[0].length

    const labelsAndNumbers = present.reduce(
        (total, unit) => total + unit.length + ': '.length + NUMBER_ALLOWANCE,
        0
    )
    return labelsAndNumbers + (present.length - 1) * SEPARATOR.length
}

/**
 * The formula for the `Date` column's summary cell.
 *
 * Reports two different figures because they answer two different questions and
 * used to be conflated: `Broj radnih dana` is how many DAYS the machine worked,
 * `Broj unosa` is how many runs were recorded. This cell counted rows and called
 * the result working days, which is only true while every run sits on its own
 * date — two completed runs on one day is ordinary (the one-in-progress-per-machine
 * index constrains `in_progress` only), and it silently over-counted whenever that
 * happened.
 *
 * The distinct count is the `SUMPRODUCT(1/COUNTIF(range,range))` idiom: each cell
 * contributes one divided by how many times its own value appears, so a date
 * present twice contributes a half twice. One live formula, no helper column.
 *
 * Two defensive pieces that are not decoration:
 * - `(range<>"")` and the `&""` on the criteria make it blank-proof. The bare idiom
 *   returns `#DIV/0!` the moment any cell in the range is empty, which cannot happen
 *   at write time (`formatExportDate` always writes something) but very much can
 *   afterwards — the whole summary row is formula-based with `fullCalcOnLoad`
 *   precisely so the sheet stays live and recalculates when a user deletes a row.
 * - `COUNTIF` matching is safe on these values: it treats `*` and `?` as wildcards,
 *   and a formatted date contains neither. Identical strings also coerce identically
 *   whichever way Excel reads them, so the count cannot drift.
 *
 * No empty-range branch: the caller returns early on zero runs, so `lastDataRow`
 * is always at least 2 and a guard here would be unreachable.
 *
 * @param {Object} input
 * @param {string} input.dateColumn - Excel letter of the `Date` column.
 * @param {number} input.lastDataRow - 1-based row number of the final data row.
 * @returns {string} The formula, label and value fused into one cell.
 *
 * @example
 * dateSummaryFormula({ dateColumn: 'A', lastDataRow: 9 })
 * // '"Broj radnih dana: "&SUMPRODUCT((A2:A9<>"")/COUNTIF(A2:A9,A2:A9&""))&" | Broj unosa: "&COUNTA(A2:A9)'
 */
export function dateSummaryFormula({ dateColumn, lastDataRow }) {
    const range = `${dateColumn}${FIRST_DATA_ROW}:${dateColumn}${lastDataRow}`

    return `"Broj radnih dana: "&SUMPRODUCT((${range}<>"")/COUNTIF(${range},${range}&""))`
        + `&"${SEPARATOR}Broj unosa: "&COUNTA(${range})`
}
