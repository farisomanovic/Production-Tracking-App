/**
 * @file ProductionRunsPage.jsx
 * @description Run list with filters, split into in-progress and completed
 * sections, plus the client-side XLSX export (built with xlsx + a JSZip
 * post-processing pass for print layout). Run detail/completion does NOT
 * belong here — that's RunDetailPage.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { getAllRuns, getRunById } from '../api/productionRuns'
import { getAllMachines } from '../api/machines'
import { getAllOperators } from '../api/operators'
import { getAllProducts } from '../api/products'
import { formatDisplayDate, formatExportDate, formatFileDate, formatDisplayTime } from '../lib/dates'
import { totalNetKg, totalGrossKg } from '../lib/runWeights'
import { energyConsumed } from '../lib/energy'
import { quantitySummaryFormula, quantitySummaryMinWidth, dateSummaryFormula } from '../lib/exportSummary'
import { exportColumnLayout } from '../lib/exportColumns'
import { truncationNotice } from '../lib/exportNotice'
import { common } from '../styles/common'
import { getErrorMessage } from '../lib/errorMessage'
import ErrorBanner from '../components/ErrorBanner'

// How many runs this page ASKS for — not a copy of the server's cap, and
// nothing depends on the two matching. If the server clamps lower, it returns
// fewer rows and says so in X-Has-More, and the banner and the exported note
// stay correct. That is the whole reason truncation is read off a response
// header instead of being inferred from this number.
const RUNS_FETCH_LIMIT = 1000

/**
 * Renders the filterable run list and the Export XLSX action.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/runs" element={<ProductionRunsPage />} />
 */
export default function ProductionRunsPage() {

  const navigate = useNavigate()

  // ─── STATE ──────────────────────────────────────────────────────────────────

  // Stored pre-split (not derived) because the two sections render independently
  // and the split happens once per fetch, not per render.
  const [inProgressRuns, setInProgressRuns] = useState([])
  const [completedRuns, setCompletedRuns] = useState([])

  const [machines, setMachines] = useState([])
  const [operators, setOperators] = useState([])
  const [products, setProducts] = useState([])

  const [filterMachineId, setFilterMachineId] = useState('')
  const [filterOperatorId, setFilterOperatorId] = useState('')
  const [filterProductId, setFilterProductId] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // True when the server said rows exist beyond the ones it returned — the list
  // and the export are both missing older runs.
  const [runsTruncated, setRunsTruncated] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // ─── DATA LOADING ───────────────────────────────────────────────────────────

  // Dropdown options load once — master data doesn't change while filtering,
  // and refetching it per filter change would triple every request burst.
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        // Deliberately UNFILTERED, unlike every other dropdown in the app.
        // These three filter production HISTORY, and a machine retired last
        // month still has runs in it — asking for active rows only would make
        // those runs unreachable through the UI that exists to find them.
        const [machinesRes, operatorsRes, productsRes] = await Promise.all([
          getAllMachines(),
          getAllOperators(),
          getAllProducts()
        ])
        setMachines(machinesRes.data)
        setOperators(operatorsRes.data)
        setProducts(productsRes.data)
      } catch (err) {
        // No error state on purpose: missing dropdown options degrade the page
        // (filters empty) but shouldn't block the run list itself.
        console.error(err)
      }
    }
    loadFilterOptions()
  }, [])

  useEffect(() => {
    // `cancelled` guards against a slow older response landing after a newer
    // one and overwriting the list with stale results.
    let cancelled = false
    async function loadRuns() {
      setLoading(true)
      setError(null)
      try {
        const params = { limit: RUNS_FETCH_LIMIT }
        if (filterMachineId) params.machineId = filterMachineId
        if (filterOperatorId) params.operatorId = filterOperatorId
        if (filterProductId) params.productId = filterProductId
        if (filterDateFrom) params.dateFrom = filterDateFrom
        if (filterDateTo) params.dateTo = filterDateTo

        const response = await getAllRuns(params)
        if (cancelled) return
        const allRuns = response.data

        setInProgressRuns(allRuns.filter(r => r.status === 'in_progress'))
        setCompletedRuns(allRuns.filter(r => r.status === 'completed'))
        // The server's answer, not a guess off the row count. Axios lowercases
        // header names; the value is the string "true"/"false". Comparing to
        // "true" also means an absent header (a server too old to send it, or a
        // missing CORS exposure) reads as "not truncated" — the page then simply
        // never warns, rather than warning on every single fetch.
        setRunsTruncated(response.headers['x-has-more'] === 'true')
      } catch (err) {
        if (cancelled) return
        setError(getErrorMessage(err, 'Failed to load production runs'))
        console.error(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadRuns()
    return () => { cancelled = true }
  }, [filterMachineId, filterOperatorId, filterProductId, filterDateFrom, filterDateTo])

  // ─── FORMATTING HELPERS ─────────────────────────────────────────────────────

  /**
   * Formats an API date for the run cards.
   *
   * @param {string} dateStr - ISO date string from the API; may be null/empty.
   * @returns {string} e.g. "04 Jul 2026", or "—" so missing dates don't collapse the layout.
   *
   * @example
   * formatDate('2026-07-04T00:00:00.000Z') // → "04 Jul 2026"
   */
  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return formatDisplayDate(dateStr)
  }

  /**
   * Makes a machine name safe for use in a file name by stripping the
   * characters Windows forbids and collapsing whitespace.
   *
   * @param {string} value - Raw name; null/undefined become "".
   * @returns {string} File-name-safe fragment, e.g. "Extruder_1".
   *
   * @example
   * sanitizeFileNamePart('Extruder 1: "test"') // → "Extruder_1-_-"
   */
  function sanitizeFileNamePart(value) {
      return String(value || '')
          .trim()
          .replace(/[<>:"/\\|?*]+/g, '-')
          .replace(/\s+/g, '_')
  }

  /**
   * Prefixes a value with an apostrophe if it could be interpreted as a
   * live formula when opened in Excel (formula/CSV injection defense).
   * Excel treats a leading `'` as "force literal text" and does not
   * display it — the value renders unchanged to the user.
   *
   * @param {*} value - Raw cell value; null/undefined become "".
   * @returns {string} Safe-to-write cell text.
   *
   * @example
   * sanitizeCellText('=SUM(A1:A9)') // → "'=SUM(A1:A9)"
   */
  function sanitizeCellText(value) {
      const str = String(value ?? '')
      return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str
  }

  /**
   * Converts a 0-based column index to an Excel column letter (0→A, 25→Z,
   * 26→AA). Needed because the summary-row formulas below must reference cells
   * by Excel address, and column count varies with the machine's parameters.
   *
   * @param {number} columnIndex - 0-based column position; must be >= 0.
   * @returns {string} Excel column letters.
   *
   * @example
   * getExcelColumnName(27) // → "AB"
   */
  function getExcelColumnName(columnIndex) {
      let columnName = ''
      // +1 then -1 inside the loop: Excel letters are BIJECTIVE base-26 (no
      // zero digit — after Z comes AA, not BA), so ordinary base conversion
      // is off by one at every position.
      let index = columnIndex + 1

      while (index > 0) {
          const remainder = (index - 1) % 26
          columnName = String.fromCharCode(65 + remainder) + columnName
          index = Math.floor((index - 1) / 26)
      }

      return columnName
  }

  // ─── RAW OOXML SURGERY HELPERS ──────────────────────────────────────────────
  // Why these exist at all: the free (community) build of SheetJS ignores print
  // options like fitToPage/margins/orientation, so the workbook is unzipped
  // (an .xlsx IS a zip of XML files) and the worksheet XML is edited by hand.
  // OOXML also enforces a strict element ORDER inside <worksheet>, which is why
  // each helper anchors relative to a specific neighboring tag.

  /**
   * Inserts content immediately after a tag's opening form (`<tag …>`).
   *
   * @param {string} xml - Worksheet XML.
   * @param {string} tagName - Anchor element name, e.g. "sheetPr".
   * @param {string} content - XML fragment to insert.
   * @returns {string} Modified XML (unchanged when the anchor is missing).
   *
   * @example
   * insertAfterOpeningTag(xml, 'worksheet', '<sheetPr/>')
   */
  function insertAfterOpeningTag(xml, tagName, content) {
      return xml.replace(new RegExp(`(<${tagName}[^>]*>)`), `$1${content}`)
  }

  /**
   * Inserts content immediately before a tag, falling back to just inside
   * <worksheet> when the anchor doesn't exist in this sheet.
   *
   * @param {string} xml - Worksheet XML.
   * @param {string} tagName - Anchor element name.
   * @param {string} content - XML fragment to insert.
   * @returns {string} Modified XML.
   *
   * @example
   * insertBeforeTag(xml, 'pageMargins', '<printOptions horizontalCentered="1"/>')
   */
  function insertBeforeTag(xml, tagName, content) {
      const tagPattern = new RegExp(`(<${tagName}\\b[^>]*>)`)

      if (tagPattern.test(xml)) {
          return xml.replace(tagPattern, `${content}$1`)
      }

      return insertAfterOpeningTag(xml, 'worksheet', content)
  }

  /**
   * Inserts content immediately after a self-closing tag (`<tag …/>`), with a
   * before-ignoredErrors fallback (ignoredErrors is the next legal element in
   * OOXML's ordering, so that spot is always schema-valid).
   *
   * @param {string} xml - Worksheet XML.
   * @param {string} tagName - Anchor element name.
   * @param {string} content - XML fragment to insert.
   * @returns {string} Modified XML.
   *
   * @example
   * insertAfterTag(xml, 'pageMargins', '<pageSetup paperSize="9"/>')
   */
  function insertAfterTag(xml, tagName, content) {
      const tagPattern = new RegExp(`(<${tagName}\\b[^>]*/>)`)

      if (tagPattern.test(xml)) {
          return xml.replace(tagPattern, `$1${content}`)
      }

      return insertBeforeTag(xml, 'ignoredErrors', content)
  }

  /**
   * Replaces an existing self-closing tag outright; returns null when absent
   * so callers can chain `|| insert…` as an upsert.
   *
   * @param {string} xml - Worksheet XML.
   * @param {string} tagName - Element to replace.
   * @param {string} tagXml - Full replacement element.
   * @returns {string|null} Modified XML, or null when the tag wasn't found.
   *
   * @example
   * replaceXmlTag(xml, 'pageMargins', pageMarginsXml) || insertBeforeTag(xml, 'ignoredErrors', pageMarginsXml)
   */
  function replaceXmlTag(xml, tagName, tagXml) {
      const tagPattern = new RegExp(`<${tagName}[^>]*/>`)

      if (tagPattern.test(xml)) {
          return xml.replace(tagPattern, tagXml)
      }

      return null
  }

  /**
   * Like replaceXmlTag but also matches the paired form
   * (`<tag>…</tag>`) — needed for colBreaks, which contains child <brk> nodes.
   *
   * @param {string} xml - Worksheet XML.
   * @param {string} tagName - Element to replace.
   * @param {string} tagXml - Full replacement element.
   * @returns {string|null} Modified XML, or null when the tag wasn't found.
   *
   * @example
   * replaceXmlBlock(xml, 'colBreaks', columnBreakXml) || insertAfterTag(xml, 'pageSetup', columnBreakXml)
   */
  function replaceXmlBlock(xml, tagName, tagXml) {
      const tagPattern = new RegExp(`<${tagName}\\b[\\s\\S]*?</${tagName}>|<${tagName}[^>]*/>`)

      if (tagPattern.test(xml)) {
          return xml.replace(tagPattern, tagXml)
      }

      return null
  }

  /**
   * Injects print settings (fit-to-page, A4 landscape, tight margins, column
   * break before Notes) into the workbook by editing its raw worksheet XML —
   * the community SheetJS build cannot write these itself.
   *
   * @param {Object} workbook - SheetJS workbook with one finished sheet.
   * @param {number} notesColumnIndex - 0-based index of the Notes column; > 0 enables the page break.
   * @returns {Promise<Blob>} The finished .xlsx as a Blob ready for download.
   *
   * @example
   * const blob = await applyPrintLayout(workbook, layout.notesIndex)
   */
  async function applyPrintLayout(workbook, notesColumnIndex) {
      const xlsxData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const zip = await JSZip.loadAsync(xlsxData)
      const sheet = zip.file('xl/worksheets/sheet1.xml')

      // Fallback: if the zip layout ever changes, ship the un-tuned workbook
      // rather than failing the whole export over print cosmetics.
      if (!sheet) return new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

      let sheetXml = await sheet.async('string')

      if (/<sheetPr[^>]*>/.test(sheetXml)) {
          sheetXml = replaceXmlTag(sheetXml, 'pageSetUpPr', '<pageSetUpPr fitToPage="1"/>')
              || insertAfterOpeningTag(sheetXml, 'sheetPr', '<pageSetUpPr fitToPage="1"/>')
      } else {
          sheetXml = insertAfterOpeningTag(sheetXml, 'worksheet', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
      }

      const printOptionsXml = '<printOptions horizontalCentered="1"/>'
      const pageMarginsXml = '<pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/>'
      // paperSize 9 = A4 in OOXML's paper table (1 would be US Letter).
      // fitToWidth=0 + fitToHeight=1: squeeze all COLUMNS onto each page width
      // while letting rows flow — the report is wide, not tall.
      const pageSetupXml = '<pageSetup paperSize="9" orientation="landscape" fitToWidth="0" fitToHeight="1"/>'

      sheetXml = replaceXmlTag(sheetXml, 'pageMargins', pageMarginsXml)
          || insertBeforeTag(sheetXml, 'ignoredErrors', pageMarginsXml)
      sheetXml = replaceXmlTag(sheetXml, 'printOptions', printOptionsXml)
          || insertBeforeTag(sheetXml, 'pageMargins', printOptionsXml)
      sheetXml = replaceXmlTag(sheetXml, 'pageSetup', pageSetupXml)
          || insertAfterTag(sheetXml, 'pageMargins', pageSetupXml)

      // Manual column break in front of Notes: free-text notes are long and
      // would crush every data column — this prints them on their own page.
      if (notesColumnIndex > 0) {
          const columnBreakXml = `<colBreaks count="1" manualBreakCount="1"><brk id="${notesColumnIndex}" max="1048575" man="1"/></colBreaks>`
          sheetXml = replaceXmlBlock(sheetXml, 'colBreaks', columnBreakXml)
              || insertAfterTag(sheetXml, 'pageSetup', columnBreakXml)
      }

      zip.file('xl/worksheets/sheet1.xml', sheetXml)

      return zip.generateAsync({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
  }

  /**
   * Triggers a browser download for a Blob via a synthetic anchor click —
   * the only way to name the file without a server round-trip.
   *
   * @param {Blob} blob - File contents.
   * @param {string} fileName - Suggested file name, e.g. "Extruder_1_01.06.2026-30.06.2026.xlsx".
   * @returns {void}
   *
   * @example
   * downloadBlob(workbookBlob, 'Extruder_1_01.06.2026-30.06.2026.xlsx')
   */
  function downloadBlob(blob, fileName) {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      // Revoke immediately: the click already started the download, and object
      // URLs otherwise leak the Blob's memory for the page's lifetime.
      URL.revokeObjectURL(url)
  }

  // ─── EXPORT ─────────────────────────────────────────────────────────────────

  /**
   * Builds and downloads the XLSX report for the filtered, completed runs of
   * one machine: one row per run, dynamic parameter/material columns, a
   * formula summary row, and a print-ready layout.
   *
   * @returns {Promise<void>} Resolves after the download starts or an alert is shown.
   *
   * @example
   * <button onClick={handleExport}>Export XLSX</button>
   */
  async function handleExport() {
      // Machine required because the column set is machine-specific — mixing
      // machines would produce a ragged sheet where most cells are blank.
      if (!filterMachineId) {
          alert('Please select a machine before exporting.')
          return
      }

      // Belt-and-suspenders: the button is disabled while exporting, but a
      // fast double-click can still land a second call before React re-renders.
      if (isExporting) return

      setIsExporting(true)
      try {
          // TODO: N+1 — one HTTP request per completed run on every click; a
          // year of data is hundreds of round-trips. Needs a dedicated export
          // endpoint returning full relations in one query. todo.md Group 7 #4.
          const fullRuns = await Promise.all(
              completedRuns.map(run => getRunById(run.id).then(res => res.data))
          )

          if (fullRuns.length === 0) {
              alert('No completed runs to export with current filters.')
              return
          }

          // Columns are discovered from the data (not the machine config) so
          // runs recorded before a parameter was added still line up — but this
          // is also why duplicate names merge columns.
          const paramNames = []
          fullRuns.forEach(run => {
              run.runParameterValues.forEach(pv => {
                  const name = `${pv.machineParameter.parameter.name}${pv.machineParameter.parameter.unit ? ` (${pv.machineParameter.parameter.unit})` : ''}`
                  if (!paramNames.includes(name)) paramNames.push(name)
              })
          })

          const materialNames = []
          fullRuns.forEach(run => {
              run.materialUsages.forEach(mu => {
                  if (!materialNames.includes(mu.material.name)) materialNames.push(mu.material.name)
              })
          })

          // Same first-seen discovery as the columns above, for the same reason:
          // the summary row's quantity total depends on which units the exported
          // runs actually carry, not on which units exist. See lib/exportSummary.js.
          const units = []
          fullRuns.forEach(run => {
              if (!units.includes(run.product.unit)) units.push(run.product.unit)
          })

          // The layout knows where every fixed column lands once the discovered ones
          // are spliced in. It is asked rather than searched for, because a parameter
          // name is operator-typed and can duplicate a fixed header. See
          // lib/exportColumns.js.
          const layout = exportColumnLayout({
              parameterHeaders: paramNames.map(sanitizeCellText),
              materialHeaders: materialNames.map(n => sanitizeCellText(`${n} Used (kg)`))
          })
          const { headers } = layout

          const formatExportTime = (dateStr) => {
              if (!dateStr) return ''
              return formatDisplayTime(dateStr)
          }

          const rows = fullRuns.map(run => {
              // Blank rather than a number when the pair is unusable. The two
              // raw reading columns beside it still carry what was recorded, so
              // a backwards pair reads as start=12500, end=12400, consumed=blank
              // — visibly broken data instead of a negative that sums quietly
              // into the totals. See lib/energy.js.
              const consumed = energyConsumed(run.energyStart, run.energyEnd) ?? ''

              const paramValues = paramNames.map(name => {
                  const match = run.runParameterValues.find(pv => {
                      const pvName = `${pv.machineParameter.parameter.name}${pv.machineParameter.parameter.unit ? ` (${pv.machineParameter.parameter.unit})` : ''}`
                      return pvName === name
                  })
                  return match ? match.value : ''
              })

              const materialValues = materialNames.map(name => {
                  const match = run.materialUsages.find(mu => mu.material.name === name)
                  return match ? Number(match.quantityUsed) : ''
              })

              // One run, one quantity — no summing left to do.
              // null (not '') for a run without one, so the two total columns
              // below can tell "no quantity" from a real number instead of
              // multiplying '' into a misleading 0.
              const quantity = run.quantityProduced != null ? Number(run.quantityProduced) : null

              // Both totals depend on the product's unit, not just the numbers:
              // a kg quantity is already the net total, a count has to be
              // multiplied up. See lib/runWeights.js.
              const weights = {
                  quantityProduced: quantity,
                  netWeightPerUnit: run.netWeightPerUnit,
                  grossWeightPerUnit: run.grossWeightPerUnit,
                  unit: run.product.unit
              }

              return [
                  formatExportDate(run.date),
                  sanitizeCellText(run.machine.name),
                  sanitizeCellText(run.operator.name),
                  sanitizeCellText(run.product.name),
                  sanitizeCellText(run.recipe.name),
                  formatExportTime(run.warmupStartTime),
                  formatExportTime(run.startTime),
                  formatExportTime(run.stableStartTime),
                  formatExportTime(run.endTime),
                  run.energyStart != null ? run.energyStart : '',
                  run.energyEnd != null ? run.energyEnd : '',
                  consumed,
                  ...paramValues,
                  ...materialValues,
                  quantity != null ? quantity : '',
                  sanitizeCellText(run.product.unit),
                  // Per-unit values go in raw — rounding would lose precision on
                  // light products. Totals come from runWeights.js, which owns
                  // the unit branch and the rounding. Blank ('') when a total
                  // can't be derived — Excel's SUM skips blanks.
                  run.netWeightPerUnit != null ? run.netWeightPerUnit : '',
                  totalNetKg(weights) ?? '',
                  run.grossWeightPerUnit != null ? run.grossWeightPerUnit : '',
                  totalGrossKg(weights) ?? '',
                  run.scrapKg != null ? run.scrapKg : '',
                  sanitizeCellText(run.notes)
              ]
          })

          const selectedMachine = machines.find(m => m.id === filterMachineId)
          const machineName = selectedMachine?.name || fullRuns[0]?.machine?.name || filterMachineId
          const runDates = fullRuns
              .map(run => new Date(run.date))
              .filter(date => !Number.isNaN(date.getTime()))
          const oldestDate = new Date(Math.min(...runDates))
          const newestDate = new Date(Math.max(...runDates))
          const fileName = `${sanitizeFileNamePart(machineName)}_${formatFileDate(oldestDate)}-${formatFileDate(newestDate)}.xlsx`

          const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
          const workbook = XLSX.utils.book_new()
          // SheetJS writes formula STRINGS without computing them —
          // fullCalcOnLoad makes Excel evaluate everything on first open, so
          // the summary row isn't blank until the user presses F9.
          workbook.Workbook = { CalcPr: { fullCalcOnLoad: true } }
          // +1 offsets: spreadsheet rows are 1-based and row 1 is the header.
          const lastDataRowNumber = rows.length + 1
          const summaryRowNumber = lastDataRowNumber + 1

          // Labels and values fused into one formula cell ("Broj radnih dana: 21 |
          // Broj unosa: 22") because the label column doubles as the count column —
          // a separate label cell would land under the Date data. The two counts
          // differ whenever a machine ran twice in one day; see lib/exportSummary.js.
          worksheet[`A${summaryRowNumber}`] = {
              t: 's',
              f: dateSummaryFormula({
                  dateColumn: getExcelColumnName(layout.dateIndex),
                  lastDataRow: lastDataRowNumber
              }),
          }

          materialNames.forEach((_, index) => {
              const columnName = getExcelColumnName(layout.materialStartIndex + index)
              worksheet[`${columnName}${summaryRowNumber}`] = {
                  t: 's',
                  f: `"Sum: "&SUM(${columnName}2:${columnName}${lastDataRowNumber})`,
              }
          })

          layout.kgSumIndexes.forEach(columnIndex => {
              const columnName = getExcelColumnName(columnIndex)
              worksheet[`${columnName}${summaryRowNumber}`] = {
                  t: 's',
                  f: `"Sum: "&SUM(${columnName}2:${columnName}${lastDataRowNumber})&" kg"`,
              }
          })

          // The quantity column is summed per unit when the sheet spans more than
          // one, because the export is machine-scoped and one machine makes
          // products measured differently — a plain SUM here added kilograms to
          // rolls. See lib/exportSummary.js.
          const quantityFormula = quantitySummaryFormula({
              units,
              quantityColumn: getExcelColumnName(layout.quantityIndex),
              unitColumn: getExcelColumnName(layout.unitIndex),
              lastDataRow: lastDataRowNumber
          })
          if (quantityFormula) {
              worksheet[`${getExcelColumnName(layout.quantityIndex)}${summaryRowNumber}`] = {
                  t: 's',
                  f: quantityFormula,
              }
          }

          // The export is allowed to run on a truncated fetch, so the sheet has
          // to say it is partial — it is the copy that gets printed and handed
          // over, and the person reading it never saw the banner on screen.
          // Written raw rather than through sanitizeCellText: this string is
          // ours, and exportNotice.test.js pins it against ever starting with a
          // character Excel would read as a formula.
          const notice = runsTruncated
              ? truncationNotice({ summaryRow: summaryRowNumber, rowCount: rows.length })
              : null
          if (notice) {
              worksheet[`A${notice.row}`] = { t: 's', v: notice.text }
          }

          // !ref must be widened by hand: cells assigned directly (like the
          // summary row and the notice above) don't grow the sheet's declared
          // range, and Excel ignores cells outside it.
          worksheet['!ref'] = `A1:${getExcelColumnName(headers.length - 1)}${notice ? notice.row : summaryRowNumber}`
          // Auto-width from longest cell content, clamped 14–60 chars: floor so
          // short columns stay readable, ceiling so one long note can't create
          // a screen-wide column.
          worksheet['!cols'] = headers.map((header, columnIndex) => {
              const columnValues = [header, ...rows.map(row => row[columnIndex] ?? '')]
              const maxLength = Math.max(...columnValues.map(value => String(value).length))
              const width = Math.min(Math.max(maxLength + 2, 14), 60)

              // This pass measures the header and the data rows; the summary row and
              // the truncation notice are assigned directly after the sheet is built
              // and are invisible to it. That is what keeps the notice's long sentence
              // from widening column A — every cell beside it is empty, so Excel just
              // lets it overflow across them.
              // Only the quantity column's summary can outgrow its column, and a
              // clipped "kg: 903.55 | roll:" is worse than the total it replaced —
              // so it may exceed the 60 ceiling, which exists to contain free-text
              // notes rather than a cell bounded by the unit vocabulary.
              if (columnIndex === layout.quantityIndex) {
                  return { wch: Math.max(width, quantitySummaryMinWidth(units)) }
              }

              return { wch: width }
          })

          XLSX.utils.book_append_sheet(workbook, worksheet, 'Production Runs')
          const workbookBlob = await applyPrintLayout(workbook, layout.notesIndex)
          downloadBlob(workbookBlob, fileName)

      } catch (err) {
          console.error(err)
          alert(getErrorMessage(err, 'Export failed. Please try again.'))
      } finally {
          setIsExporting(false)
      }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div style={common.container}>
      <h1 style={styles.heading}>Production Runs</h1>

      {/* Filters */}
      <div style={styles.filtersSection}>
        <p style={styles.filtersLabel}>Filter</p>
        <div style={styles.filtersGrid}>

          <div style={styles.dateRangeField}>
              <span style={styles.dateLabel}>Machine</span>
              <select
                  style={styles.filterInput}
                  value={filterMachineId}
                  onChange={e => setFilterMachineId(e.target.value)}
              >
                  <option value=''>All Machines</option>
                  {machines.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
              </select>
          </div>

          <div style={styles.dateRangeField}>
              <span style={styles.dateLabel}>Product</span>
              <select
                  style={styles.filterInput}
                  value={filterProductId}
                  onChange={e => setFilterProductId(e.target.value)}
              >
                  <option value=''>All Products</option>
                  {products.map(p => (
                      <option key={p.id} value={p.id}>
                          {p.name}{p.code ? ` — ${p.code}` : ''}
                      </option>
                  ))}
              </select>
          </div>

          <div style={styles.dateRangeField}>
              <span style={styles.dateLabel}>From</span>
              <input
                  style={styles.filterInput}
                  type='date'
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
              />
          </div>

          <div style={styles.dateRangeField}>
              <span style={styles.dateLabel}>To</span>
              <input
                  style={styles.filterInput}
                  type='date'
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
              />
          </div>

          <div style={styles.dateRangeField}>
              <span style={styles.dateLabel}>Operator</span>
              <select
                  style={styles.filterInput}
                  value={filterOperatorId}
                  onChange={e => setFilterOperatorId(e.target.value)}
              >
                  <option value=''>All Operators</option>
                  {operators.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
              </select>
          </div>

          <div style={styles.dateRangeField}>
              <span style={styles.dateLabel}>Export</span>
              {/* Deliberately NOT disabled on a truncated fetch: the rows on
                  screen are exportable, and refusing to export them gave the
                  office nothing for a condition the app had already detected
                  and could describe. The sheet carries the caveat instead. */}
              <button
                  style={isExporting ? { ...styles.exportButton, ...styles.exportButtonDisabled } : styles.exportButton}
                  onClick={handleExport}
                  disabled={isExporting}
              >
                  {isExporting ? 'Exporting…' : 'Export XLSX'}
              </button>
          </div>

      </div>

      {/* styles.noticeBox, not common.errorBox: this is a caveat on a request
          that worked, and this page uses the red box for real load failures. */}
      {runsTruncated && (
        <div style={styles.noticeBox}>
          Showing the newest {inProgressRuns.length + completedRuns.length} runs for the current filters — older runs exist. Narrow your date range to see them.
        </div>
      )}

        {/* Only rendered while a filter is active — a Clear button next to
            already-empty filters would be dead weight */}
        {(filterMachineId || filterOperatorId || filterProductId || filterDateFrom || filterDateTo) && (
          <button
            style={styles.clearButton}
            onClick={() => {
              setFilterMachineId('')
              setFilterOperatorId('')
              setFilterProductId('')
              setFilterDateFrom('')
              setFilterDateTo('')
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <p style={common.loadingText}>Loading runs...</p>
      ) : (
        <>
          {/* In Progress Section */}
          {inProgressRuns.length > 0 && (
            <div style={styles.section}>
              <p style={{ ...common.sectionLabel, fontSize: '0.8rem' }}>In Progress</p>
              <div style={styles.list}>
                {inProgressRuns.map(run => (
                  <div
                    key={run.id}
                    style={styles.inProgressCard}
                    onClick={() => navigate(`/runs/${run.id}`)}
                  >
                    <div style={styles.cardLeft}>
                      <div style={styles.inProgressBadge}>● Live</div>
                      <span style={styles.cardMachine}>{run.machine.name}</span>
                      <span style={styles.cardSub}>
                        {run.operator.name} · {run.product.name}
                      </span>
                      <span style={styles.cardDate}>{formatDate(run.date)}</span>
                    </div>
                    <span style={common.arrow}>›</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Section */}
          <div style={styles.section}>
            <p style={{ ...common.sectionLabel, fontSize: '0.8rem' }}>
              Completed {completedRuns.length > 0 ? `(${completedRuns.length})` : ''}
            </p>

            {completedRuns.length === 0 ? (
              <p style={styles.emptyText}>No completed runs found.</p>
            ) : (
              <div style={styles.list}>
                {completedRuns.map(run => (
                  <div
                    key={run.id}
                    style={styles.card}
                    onClick={() => navigate(`/runs/${run.id}`)}
                  >
                    <div style={styles.cardLeft}>
                      <span style={styles.cardMachine}>{run.machine.name}</span>
                      <span style={styles.cardSub}>
                        {run.operator.name} · {run.product.name}
                      </span>
                      <span style={styles.cardDate}>{formatDate(run.date)}</span>
                    </div>
                    <span style={common.arrow}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

    </div>
  )
}

const styles = {
  heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '1.5rem',
  },
  filtersSection: {
    marginBottom: '1.5rem',
  },
  filtersLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.8rem',
    marginBottom: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  clearButton: {
    marginTop: '0.5rem',
    padding: '0.4rem 1rem',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-text-muted)',
    color: 'var(--color-text-secondary)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  section: {
    marginBottom: '2rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
  },
  inProgressCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '2px solid var(--color-accent)',
    cursor: 'pointer',
  },
  cardLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  inProgressBadge: {
    color: 'var(--color-accent)',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    marginBottom: '2px',
  },
  cardMachine: {
    color: 'var(--color-text-primary)',
    fontSize: '0.95rem',
    fontWeight: 'bold',
  },
  cardSub: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.8rem',
  },
  cardDate: {
    color: 'var(--color-text-muted)',
    fontSize: '0.75rem',
  },
  // TODO: dead style — the JSX uses common.arrow, not this. Delete it.
  // todo.md Group 8 #1.
  arrow: {
    color: 'var(--color-text-secondary)',
    fontSize: '20px',
  },
  emptyText: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.9rem',
  },
  // The truncation caveat. Built from existing tokens rather than a new
  // warning colour on purpose: --color-danger-soft is already light-pink in
  // both themes (see the TODO in index.css), and a second hand-picked surface
  // would be the same mistake twice. Local rather than in common.js because
  // this page is the only consumer today.
  noticeBox: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-secondary)',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.85rem',
  },
dateLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
},
exportButton: {
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontSize: '0.85rem',
    cursor: 'pointer',
},

exportButtonDisabled: {
    backgroundColor: 'var(--color-text-muted)',
    cursor: 'not-allowed',
},

// minWidth: 0 on the grid and its children: grid items default to
// min-width:auto, which refuses to shrink below content size — without these
// overrides a long product name forces the filter grid past the viewport edge.
filtersGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
    width: '100%',
    minWidth: 0,
},

filterInput: {
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.85rem',
    width: '100%',
    boxSizing: 'border-box',
},

dateRangeField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    minWidth: 0,
},
}

