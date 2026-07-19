/**
 * @file DashboardPage.jsx
 * @description Landing page: today's runs at a glance — live runs, completed
 * count, and which machines worked. Fetches today's date-scoped runs and
 * system-wide in-progress runs in parallel (see Group 6 #6: an in-progress run
 * isn't necessarily dated "today"); all groupings are derived on the client
 * because a single day is a handful of rows at most.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllRuns } from '../api/productionRuns'
import { getLocalDateString } from '../lib/dates'
import { common } from '../styles/common'

/**
 * Renders today's stat cards, live runs, and active machines.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/" element={<DashboardPage />} />
 */
export default function DashboardPage() {

  const navigate = useNavigate()
  const [runs, setRuns] = useState([])
  const [liveRuns, setLiveRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const today = getLocalDateString()
        // Two independent queries — Promise.all runs them concurrently. The
        // date-scoped query drives "Runs Today"/"Completed"/"Machines Active
        // Today"; the unscoped status query drives "Live Now"/"In Progress" so
        // an overnight run (date = yesterday, still in_progress) isn't invisible
        // just because it falls outside today's date window. Group 6 #1, #6.
        const [todayRes, liveRes] = await Promise.all([
          getAllRuns({ dateFrom: today, dateTo: today }),
          getAllRuns({ status: 'in_progress' })
        ])
        setRuns(todayRes.data)
        setLiveRuns(liveRes.data)
      } catch (err) {
        setError('Failed to load dashboard data')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadDashboardData()
  }, [])

  // Derived on every render instead of stored in state: state would need manual
  // resyncing with `runs`, and filtering a day's worth of rows is trivially cheap.
  const completedRuns = runs.filter(r => r.status === 'completed')

  // Map keyed by machineId deduplicates machines that ran several times today —
  // insertion order is preserved, so the display order follows first appearance.
  const activeMachines = [...new Map(
    runs.map(r => [r.machineId, r.machine])
  ).values()]

  /**
   * Formats a timestamp as a short clock time for the run cards.
   *
   * @param {string} dateStr - ISO timestamp from the API; may be null for open runs.
   * @returns {string} e.g. "08:30 AM", or "—" so the layout never collapses on missing data.
   *
   * @example
   * formatTime('2026-07-04T08:30:00.000Z') // → "08:30 AM" (locale-dependent)
   */
  function formatTime(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  if (loading) return <p style={styles.loadingText}>Loading...</p>
  if (error) return <p style={styles.errorText}>{error}</p>

  return (
    <div style={common.container}>
      <h1 style={styles.heading}>Dashboard</h1>
      <p style={common.subheading}>
        {new Date().toLocaleDateString('en-GB', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        })}
      </p>

      {/* Summary cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statNumber}>{runs.length}</span>
          <span style={styles.statLabel}>Runs Today</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statNumber}>{completedRuns.length}</span>
          <span style={styles.statLabel}>Completed</span>
        </div>
        <div style={{
          ...styles.statCard,
          ...(liveRuns.length > 0 ? styles.statCardLive : {})
        }}>
          <span style={styles.statNumber}>{liveRuns.length}</span>
          <span style={styles.statLabel}>In Progress</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statNumber}>{activeMachines.length}</span>
          <span style={styles.statLabel}>Machines Active</span>
        </div>
      </div>

      {/* Live runs come first — the operator's most likely destination. Driven
          by the unscoped status query, not `runs`, so an overnight run that
          started yesterday still shows up here even though it falls outside
          today's date window (Group 6 #6). */}
      {liveRuns.length > 0 && (
        <div style={styles.section}>
          <p style={common.sectionLabel}>Live Now</p>
          <div style={styles.list}>
            {liveRuns.map(run => (
              <div
                key={run.id}
                style={styles.liveCard}
                onClick={() => navigate(`/runs/${run.id}`)}
              >
                <div style={styles.cardLeft}>
                  <span style={styles.liveDot}>● Live</span>
                  <span style={styles.cardMachine}>{run.machine.name}</span>
                  <span style={styles.cardSub}>
                    {run.operator.name} · {run.product.name}
                  </span>
                  <span style={styles.cardTime}>
                    Started {formatTime(run.startTime)}
                  </span>
                </div>
                <span style={common.arrow}>›</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active machines today */}
      {activeMachines.length > 0 && (
        <div style={styles.section}>
          <p style={common.sectionLabel}>Machines Active Today</p>
          <div style={styles.machineList}>
            {activeMachines.map(machine => {
              const machineRuns = runs.filter(r => r.machineId === machine.id)
              return (
                <div key={machine.id} style={styles.machineCard}>
                  <span style={styles.machineName}>{machine.name}</span>
                  <span style={styles.machineCount}>
                    {machineRuns.length} run{machineRuns.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state doubles as the call to action for a fresh day. This checks
          `runs` (today-scoped) only, not `liveRuns`: an overnight run still
          in_progress right now can render a Live Now card ABOVE this block
          even while `runs` is empty, so the CTA can appear directly under a
          live card. Deliberate — see todo.md Group 6 #6. */}
      {runs.length === 0 && (
        <div style={styles.emptyBox}>
          <p style={styles.emptyText}>No runs recorded today.</p>
          <button
            style={styles.newRunButton}
            onClick={() => navigate('/runs/new')}
          >
            Start a New Run
          </button>
        </div>
      )}

    </div>
  )
}

const styles = {
  heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
  },
  loadingText: {
    color: 'var(--color-text-secondary)',
    padding: '16px',
  },
  errorText: {
    color: 'var(--color-danger)',
    padding: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  statCard: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statCardLive: {
    border: '1px solid var(--color-accent)',
    backgroundColor: 'var(--color-selected-surface)',
  },
  statNumber: {
    color: 'var(--color-text-primary)',
    fontSize: '2rem',
    fontWeight: 'bold',
    lineHeight: 1,
  },
  statLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
  },
  section: {
    marginBottom: '1.5rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  liveCard: {
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
  liveDot: {
    color: 'var(--color-accent)',
    fontSize: '0.75rem',
    fontWeight: 'bold',
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
  cardTime: {
    color: 'var(--color-text-muted)',
    fontSize: '0.75rem',
  },
  machineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  machineCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
  },
  machineName: {
    color: 'var(--color-text-primary)',
    fontSize: '0.9rem',
  },
  machineCount: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.8rem',
  },
  emptyBox: {
    textAlign: 'center',
    padding: '3rem 1rem',
  },
  emptyText: {
    color: 'var(--color-text-secondary)',
    marginBottom: '1rem',
  },
  newRunButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.95rem',
    cursor: 'pointer',
  },
}
