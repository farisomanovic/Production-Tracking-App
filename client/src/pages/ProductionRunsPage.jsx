/**
 * Renders the production-run list, filters, and XLSX export workflow.
 * Separates in-progress and completed runs for operational review.
 * Fetches related master data needed for filtering and export enrichment.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { getAllRuns, getRunById } from '../api/productionRuns'
import { getAllMachines } from '../api/machines'
import { getAllOperators } from '../api/operators'
import { getAllProducts } from '../api/products'

export default function ProductionRunsPage() {

  const navigate = useNavigate()

  // All runs split into two groups
  const [inProgressRuns, setInProgressRuns] = useState([])
  const [completedRuns, setCompletedRuns] = useState([])

  // Filter options fetched from API
  const [machines, setMachines] = useState([])
  const [operators, setOperators] = useState([])
  const [products, setProducts] = useState([])

  // Active filter values
  const [filterMachineId, setFilterMachineId] = useState('')
  const [filterOperatorId, setFilterOperatorId] = useState('')
  const [filterProductId, setFilterProductId] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch filter options once on mount
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const [machinesRes, operatorsRes, productsRes] = await Promise.all([
          getAllMachines(),
          getAllOperators(),
          getAllProducts()
        ])
        setMachines(machinesRes.data)
        setOperators(operatorsRes.data)
        setProducts(productsRes.data)
      } catch (err) {
        console.error(err)
      }
    }
    loadFilterOptions()
  }, [])

  // Fetch runs whenever any filter changes
  useEffect(() => {
    async function loadRuns() {
      setLoading(true)
      setError(null)
      try {
        const params = {}
        if (filterMachineId) params.machineId = filterMachineId
        if (filterOperatorId) params.operatorId = filterOperatorId
        if (filterProductId) params.productId = filterProductId
        if (filterDateFrom) params.dateFrom = filterDateFrom
        if (filterDateTo) params.dateTo = filterDateTo      

        const response = await getAllRuns(params)
        const allRuns = response.data

        // Split into two groups on the frontend
        setInProgressRuns(allRuns.filter(r => r.status === 'in_progress'))
        setCompletedRuns(allRuns.filter(r => r.status === 'completed'))
      } catch (err) {
        setError('Failed to load production runs')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadRuns()
  }, [filterMachineId, filterOperatorId, filterProductId, filterDateFrom, filterDateTo])

  /**
   * Formats an API date string for list display.
   *
   * @param {string} dateStr - Date string returned by the API.
   * @returns {string} Human-readable date or a fallback dash.
   */
  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  function formatFileDate(dateStr) {
      return new Date(dateStr).toLocaleDateString('en-GB').replace(/\//g, '.')
  }

  function sanitizeFileNamePart(value) {
      return String(value || '')
          .trim()
          .replace(/[<>:"/\\|?*]+/g, '-')
          .replace(/\s+/g, '_')
  }

  function getExcelColumnName(columnIndex) {
      let columnName = ''
      let index = columnIndex + 1

      while (index > 0) {
          const remainder = (index - 1) % 26
          columnName = String.fromCharCode(65 + remainder) + columnName
          index = Math.floor((index - 1) / 26)
      }

      return columnName
  }

  async function handleExport() {
      if (!filterMachineId) {
          alert('Please select a machine before exporting.')
          return
      }

      try {
          // Fetch full detail for each completed run
          const fullRuns = await Promise.all(
              completedRuns.map(run => getRunById(run.id).then(res => res.data))
          )

          if (fullRuns.length === 0) {
              alert('No completed runs to export with current filters.')
              return
          }

          // Collect all unique parameter names for this machine
          const paramNames = []
          fullRuns.forEach(run => {
              run.runParameterValues.forEach(pv => {
                  const name = `${pv.machineParameter.parameter.name}${pv.machineParameter.parameter.unit ? ` (${pv.machineParameter.parameter.unit})` : ''}`
                  if (!paramNames.includes(name)) paramNames.push(name)
              })
          })

          // Collect all unique material names
          const materialNames = []
          fullRuns.forEach(run => {
              run.materialUsages.forEach(mu => {
                  if (!materialNames.includes(mu.material.name)) materialNames.push(mu.material.name)
              })
          })

          // Build XLSX header row
          const headers = [
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
              'Energy Consumed (kWh)',
              ...paramNames,
              ...materialNames.map(n => `${n} Used (kg)`),
              'Quantity Produced',
              'Gross Weight (kg)',
              'Scrap (kg)',
              'Notes'
          ]

          const formatExportDate = (dateStr) => {
              if (!dateStr) return ''
              return new Date(dateStr).toLocaleDateString('en-GB')
          }

          const formatExportTime = (dateStr) => {
              if (!dateStr) return ''
              return new Date(dateStr).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
              })
          }

          // Build one row per run
          const rows = fullRuns.map(run => {
              const energyConsumed = run.energyStart && run.energyEnd
                  ? Number((run.energyEnd - run.energyStart).toFixed(1))
                  : ''

              // Parameter values — match by parameter name
              const paramValues = paramNames.map(name => {
                  const match = run.runParameterValues.find(pv => {
                      const pvName = `${pv.machineParameter.parameter.name}${pv.machineParameter.parameter.unit ? ` (${pv.machineParameter.parameter.unit})` : ''}`
                      return pvName === name
                  })
                  return match ? match.value : ''
              })

              // Material values — match by material name
              const materialValues = materialNames.map(name => {
                  const match = run.materialUsages.find(mu => mu.material.name === name)
                  return match ? Number(match.quantityUsed) : ''
              })

              // Outputs — flatten into single row (sum if multiple outputs)
              const totalQty = run.runOutputs.reduce((sum, o) => sum + Number(o.quantityProduced || 0), 0)
              const totalGross = run.runOutputs.reduce((sum, o) => sum + Number(o.grossWeightKg || 0), 0)
              const totalScrap = run.runOutputs.reduce((sum, o) => sum + Number(o.scrapKg || 0), 0)

              return [
                  formatExportDate(run.date),
                  run.machine.name,
                  run.operator.name,
                  run.product.name,
                  run.recipe.name,
                  formatExportTime(run.warmupStartTime),
                  formatExportTime(run.startTime),
                  formatExportTime(run.stableStartTime),
                  formatExportTime(run.endTime),
                  run.energyStart || '',
                  run.energyEnd || '',
                  energyConsumed,
                  ...paramValues,
                  ...materialValues,
                  totalQty,
                  Number(totalGross.toFixed(1)),
                  Number(totalScrap.toFixed(1)),
                  run.notes || ''
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
          workbook.Workbook = { CalcPr: { fullCalcOnLoad: true } }
          const lastDataRowNumber = rows.length + 1
          const summaryRowNumber = lastDataRowNumber + 1
          const materialStartIndex = headers.findIndex(header => header === `${materialNames[0]} Used (kg)`)
          const totalColumnHeaders = ['Quantity Produced', 'Gross Weight (kg)', 'Scrap (kg)']

          worksheet[`A${summaryRowNumber}`] = {
              t: 's',
              f: `"Broj radnih dana: "&(COUNTA(A1:A${lastDataRowNumber})-1)`,
          }

          materialNames.forEach((_, index) => {
              const columnName = getExcelColumnName(materialStartIndex + index)
              worksheet[`${columnName}${summaryRowNumber}`] = {
                  t: 's',
                  f: `"Sum: "&SUM(${columnName}2:${columnName}${lastDataRowNumber})`,
              }
          })

          totalColumnHeaders.forEach(header => {
              const columnIndex = headers.findIndex(columnHeader => columnHeader === header)
              const columnName = getExcelColumnName(columnIndex)
              worksheet[`${columnName}${summaryRowNumber}`] = {
                  t: 's',
                  f: `"Sum: "&SUM(${columnName}2:${columnName}${lastDataRowNumber})`,
              }
          })

          worksheet['!ref'] = `A1:${getExcelColumnName(headers.length - 1)}${summaryRowNumber}`
          worksheet['!cols'] = headers.map((header, columnIndex) => {
              const columnValues = [header, ...rows.map(row => row[columnIndex] ?? '')]
              const maxLength = Math.max(...columnValues.map(value => String(value).length))

              return { wch: Math.min(Math.max(maxLength + 2, 14), 60) }
          })

          XLSX.utils.book_append_sheet(workbook, worksheet, 'Production Runs')
          XLSX.writeFile(workbook, fileName)

      } catch (err) {
          console.error(err)
          alert('Export failed. Please try again.')
      }
  }

  return (
    <div style={styles.container}>
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
              <button style={styles.exportButton} onClick={handleExport}>
                  Export XLSX
              </button>
          </div>

      </div>

        {/* Clear filters button — only shown when any filter is active */}
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

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading ? (
        <p style={styles.loadingText}>Loading runs...</p>
      ) : (
        <>
          {/* In Progress Section */}
          {inProgressRuns.length > 0 && (
            <div style={styles.section}>
              <p style={styles.sectionLabel}>In Progress</p>
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
                    <span style={styles.arrow}>›</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Section */}
          <div style={styles.section}>
            <p style={styles.sectionLabel}>
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
                    <span style={styles.arrow}>›</span>
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
  errorBox: {
    backgroundColor: 'var(--color-danger-soft)',
    color: 'var(--color-danger)',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
  },
  loadingText: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.9rem',
  },
  section: {
    marginBottom: '2rem',
  },
  sectionLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
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
  arrow: {
    color: 'var(--color-text-secondary)',
    fontSize: '20px',
  },
  emptyText: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.9rem',
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
container: {
    padding: '16px',
    maxWidth: '600px',
    width: '100%',              // ← new: be exactly as wide as parent
    boxSizing: 'border-box',   // ← new: padding included in that width
    margin: '0 auto',
},

filtersGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
    width: '100%',             // ← new: fill the container
    minWidth: 0,               // ← new: allow columns to shrink below content size
},

filterInput: {
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.85rem',
    width: '100%',             // ← new: fill the grid cell
    boxSizing: 'border-box',   // ← new: padding included in that width
},

dateRangeField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    minWidth: 0,               // ← new: allow this wrapper to shrink inside the grid
},
}

