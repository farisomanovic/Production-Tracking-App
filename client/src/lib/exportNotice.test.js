/**
 * @file exportNotice.test.js
 * @description Guards the truncation note the export writes when the run fetch was
 * capped by the server.
 *
 * Three properties, and the third is the least obvious: the page writes this text into
 * the sheet as a plain string, without the formula-injection guard it applies to every
 * operator-supplied value, on the grounds that this text is ours. That reasoning holds
 * only while the wording cannot be read as a formula — so the wording is pinned here
 * rather than left to whoever next rephrases the sentence.
 */
import { describe, it, expect } from 'vitest'
import { truncationNotice } from './exportNotice'

describe('truncationNotice', () => {
    // The count, not the requested limit: the client no longer knows the server's cap,
    // and a note claiming "1000" on a sheet holding 640 rows is a worse lie than the
    // banner this whole change exists to stop.
    it('names the number of rows the sheet actually carries', () => {
        expect(truncationNotice({ summaryRow: 24, rowCount: 640 }).text).toContain('640')
    })

    // Exact row, not "somewhere below": the caller widens `!ref` to this number, so an
    // off-by-one either strands the note outside the sheet's declared range (Excel
    // ignores it entirely) or leaves a trailing empty row on the printout.
    it('leaves exactly one blank row between the summary row and the note', () => {
        expect(truncationNotice({ summaryRow: 24, rowCount: 3 }).row).toBe(26)
    })

    it('cannot be read by Excel as a live formula', () => {
        const { text } = truncationNotice({ summaryRow: 24, rowCount: 3 })
        expect(text.charAt(0)).not.toMatch(/[=+\-@\t\r]/)
    })
})
