import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllRuns } from '../api/productionRuns'

export default function DashboardPage() {

  const navigate = useNavigate()
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadTodayRuns() {
      try {
        // Get today's date in YYYY-MM-DD format for the filter
        const today = new Date().toISOString().split('T')[0]
        const response = await getAllRuns({ date: today })
        setRuns(response.data)
      } catch (err) {
        setError('Failed to load dashboard data')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadTodayRuns()
  }, [])

  // Simple calculations done on the frontend
  const inProgressRuns = runs.filter(r => r.status === 'in_progress')
  const completedRuns = runs.filter(r => r.status === 'completed')

  // Get unique machines that had runs today
  const activeMachines = [...new Map(
    runs.map(r => [r.machineId, r.machine])
  ).values()]

  function formatTime(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) return <p style={styles.loadingText}>Loading...</p>
  if (error) return <p style={styles.errorText}>{error}</p>

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Dashboard</h1>
      <p style={styles.subheading}>
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
          ...(inProgressRuns.length > 0 ? styles.statCardLive : {})
        }}>
          <span style={styles.statNumber}>{inProgressRuns.length}</span>
          <span style={styles.statLabel}>In Progress</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statNumber}>{activeMachines.length}</span>
          <span style={styles.statLabel}>Machines Active</span>
        </div>
      </div>

      {/* In progress runs — shown prominently if any exist */}
      {inProgressRuns.length > 0 && (
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Live Now</p>
          <div style={styles.list}>
            {inProgressRuns.map(run => (
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
                <span style={styles.arrow}>›</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active machines today */}
      {activeMachines.length > 0 && (
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Machines Active Today</p>
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

      {/* Empty state — no runs today */}
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
  container: {
    padding: '16px',
    maxWidth: '600px',
    margin: '0 auto',
  },
  heading: {
    color: '#ffffff',
    marginBottom: '4px',
  },
  subheading: {
    color: '#888',
    fontSize: '0.85rem',
    marginBottom: '1.5rem',
  },
  loadingText: {
    color: '#888',
    padding: '16px',
  },
  errorText: {
    color: '#dc2626',
    padding: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  statCard: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statCardLive: {
    border: '1px solid #4f46e5',
    backgroundColor: '#1e1b4b',
  },
  statNumber: {
    color: '#ffffff',
    fontSize: '2rem',
    fontWeight: 'bold',
    lineHeight: 1,
  },
  statLabel: {
    color: '#888',
    fontSize: '0.75rem',
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionLabel: {
    color: '#888',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
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
  liveDot: {
    color: '#4f46e5',
    fontSize: '0.75rem',
    fontWeight: 'bold',
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
  cardTime: {
    color: '#555',
    fontSize: '0.75rem',
  },
  arrow: {
    color: '#888',
    fontSize: '20px',
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
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #333',
  },
  machineName: {
    color: '#ffffff',
    fontSize: '0.9rem',
  },
  machineCount: {
    color: '#888',
    fontSize: '0.8rem',
  },
  emptyBox: {
    textAlign: 'center',
    padding: '3rem 1rem',
  },
  emptyText: {
    color: '#888',
    marginBottom: '1rem',
  },
  newRunButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.95rem',
    cursor: 'pointer',
  },
}