import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllRuns } from '../api/productionRuns'
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

  // Format a date string for display
  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Production Runs</h1>

      {/* Filters */}
      <div style={styles.filtersSection}>
        <p style={styles.filtersLabel}>Filter</p>
        <div className="filters-grid">

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

      </div>

      {/* Operator centered below */}
      <div className="operator-field">
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
  container: {
    padding: '16px',
    maxWidth: '600px',
    margin: '0 auto',
  },
  heading: {
    color: '#ffffff',
    marginBottom: '1.5rem',
  },
  filtersSection: {
    marginBottom: '1.5rem',
  },
  filtersLabel: {
    color: '#888',
    fontSize: '0.8rem',
    marginBottom: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  filterInput: {
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '0.85rem',
  },
  clearButton: {
    marginTop: '0.5rem',
    padding: '0.4rem 1rem',
    backgroundColor: 'transparent',
    border: '1px solid #555',
    color: '#888',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
  },
  loadingText: {
    color: '#888',
    fontSize: '0.9rem',
  },
  section: {
    marginBottom: '2rem',
  },
  sectionLabel: {
    color: '#888',
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
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #333',
    cursor: 'pointer',
  },
  inProgressCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '2px solid #4f46e5',
    cursor: 'pointer',
  },
  cardLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  inProgressBadge: {
    color: '#4f46e5',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    marginBottom: '2px',
  },
  cardMachine: {
    color: '#ffffff',
    fontSize: '0.95rem',
    fontWeight: 'bold',
  },
  cardSub: {
    color: '#888',
    fontSize: '0.8rem',
  },
  cardDate: {
    color: '#555',
    fontSize: '0.75rem',
  },
  arrow: {
    color: '#888',
    fontSize: '20px',
  },
  emptyText: {
    color: '#888',
    fontSize: '0.9rem',
  },
  dateRangeField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
},
dateLabel: {
    color: '#888',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
},
}