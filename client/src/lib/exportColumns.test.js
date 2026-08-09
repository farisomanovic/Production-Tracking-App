/**
 * @file exportColumns.test.js
 * @description Guards the XLSX export against a parameter name colliding with a fixed
 * column header.
 *
 * Every test but the first feeds a parameter header that is character-for-character
 * one of the fixed headers behind it. The old code searched the finished header array
 * for that text and got the parameter's column, because the discovered columns are
 * spliced in FIRST and `findIndex` returns the first match. The assertions are on
 * exact numeric indices rather than on "not the parameter's index", because an
 * off-by-one that lands on a neighbouring fixed column is just as wrong and a
 * non-equality assertion would sail past it.
 *
 * `parameterHeaders` are passed already sanitized, as the page passes them — none of
 * these names starts with `=`/`+`/`-`/`@`, so sanitizeCellText leaves them untouched.
 */
import { describe, it, expect } from 'vitest'
import { exportColumnLayout, LEADING_HEADERS, TRAILING_HEADERS } from './exportColumns'

const LEAD = LEADING_HEADERS.length

describe('exportColumnLayout', () => {
    // The layout contract every index below is measured against. Materials must come
    // after parameters and before the trailing block: the page's row builder emits its
    // cells in that order, so a reordering here would silently write every value into
    // the wrong column while the indices stayed self-consistent.
    it('assembles leading, parameter, material and trailing columns in that order', () => {
        const { headers } = exportColumnLayout({
            parameterHeaders: ['Temp Zona 1 (Stepeni Celsius)'],
            materialHeaders: ['Granulat Used (kg)']
        })

        expect(headers).toEqual([
            ...LEADING_HEADERS,
            'Temp Zona 1 (Stepeni Celsius)',
            'Granulat Used (kg)',
            ...TRAILING_HEADERS
        ])
    })

    // todo.md Group 7 #47 itself, and the only collision that is silent. `Unit` is the
    // SUMIF criteria range for the per-unit quantity subtotals, so resolving it to a
    // column of temperature readings does not misplace a cell — it prints
    // `kg: 0 | roll: 0` and looks like a month with no production.
    it('does not let a parameter named Unit steal the Unit column', () => {
        const layout = exportColumnLayout({
            parameterHeaders: ['Unit'],
            materialHeaders: ['Granulat Used (kg)']
        })

        expect(layout.headers[LEAD]).toBe('Unit')
        expect(layout.unitIndex).toBe(LEAD + 2 + TRAILING_HEADERS.indexOf('Unit'))
        expect(layout.headers[layout.unitIndex]).toBe('Unit')
    })

    // Same collision one column over. This one is not silent — the per-unit breakdown
    // would be written into the parameter's column and the real quantity total would
    // be blank — but it is the same root cause and needs its own guard.
    it('does not let a parameter named Quantity Produced steal the quantity column', () => {
        const layout = exportColumnLayout({
            parameterHeaders: ['Quantity Produced'],
            materialHeaders: []
        })

        expect(layout.quantityIndex).toBe(LEAD + 1 + TRAILING_HEADERS.indexOf('Quantity Produced'))
    })

    // Notes does not carry a formula; it sets the manual page break in
    // applyPrintLayout. A collision there breaks the printed page in the middle of the
    // data columns, which is why it is guarded separately from the formula columns.
    it('does not let a parameter named Notes steal the page-break column', () => {
        const layout = exportColumnLayout({
            parameterHeaders: ['Notes'],
            materialHeaders: []
        })

        expect(layout.notesIndex).toBe(LEAD + 1 + TRAILING_HEADERS.indexOf('Notes'))
        expect(layout.notesIndex).toBe(layout.headers.length - 1)
    })

    // The realistic one. Material headers carry a ` Used (kg)` suffix, so a parameter
    // called `Granulat Used` with unit `kg` renders identically to the material column
    // it sits in front of — and the material block's Sum formulas are addressed by
    // offset from this single index, so every one of them shifts together.
    it('does not let a parameter that mimics a material header move the material block', () => {
        const layout = exportColumnLayout({
            parameterHeaders: ['Granulat Used (kg)'],
            materialHeaders: ['Granulat Used (kg)', 'Master Batch Used (kg)']
        })

        expect(layout.materialStartIndex).toBe(LEAD + 1)
        expect(layout.headers[layout.materialStartIndex]).toBe('Granulat Used (kg)')
        expect(layout.headers[layout.materialStartIndex + 1]).toBe('Master Batch Used (kg)')
    })

    // The three plain-SUM columns resolve as a set, so one collision has to be caught
    // without assuming which of the three it hit.
    it('does not let a parameter named Scrap (kg) steal any kg-sum column', () => {
        const layout = exportColumnLayout({
            parameterHeaders: ['Scrap (kg)'],
            materialHeaders: []
        })

        expect(layout.kgSumIndexes).toEqual([
            LEAD + 1 + TRAILING_HEADERS.indexOf('Total Neto (kg)'),
            LEAD + 1 + TRAILING_HEADERS.indexOf('Total Bruto (kg)'),
            LEAD + 1 + TRAILING_HEADERS.indexOf('Scrap (kg)')
        ])
    })

    // The machine with no parameters and no materials: the layout must collapse to
    // the fixed columns alone, with nothing shifted and no gap where the discovered
    // block would be. This is also the case where the old material lookup returned -1.
    it('collapses to the fixed columns when nothing was discovered', () => {
        const layout = exportColumnLayout()

        expect(layout.headers).toEqual([...LEADING_HEADERS, ...TRAILING_HEADERS])
        expect(layout.dateIndex).toBe(0)
        expect(layout.materialStartIndex).toBe(LEAD)
        expect(layout.quantityIndex).toBe(LEAD)
    })
})
