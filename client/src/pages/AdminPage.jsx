/**
 * Renders the administrative hub for master-data maintenance.
 * Presents setup entry points and machine configuration links.
 * Keeps configuration workflows separate from production-run entry.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllMachines } from '../api/machines'
import { common } from '../styles/common'

export default function AdminPage() {

  const navigate = useNavigate()
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadMachines() {
      try {
        const response = await getAllMachines()
        setMachines(response.data)
      } catch (err) {
        setError('Failed to load machines')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadMachines()
  }, [])

  const dataPages = [
    { label: 'Operators', path: '/operators' },
    { label: 'Machines', path: '/machines' },
    { label: 'Products', path: '/products' },
    { label: 'Materials', path: '/materials' },
    { label: 'Parameters', path: '/parameters' },
    { label: 'Recipes', path: '/recipes' },
  ]

  return (
    <div style={common.container}>
      <h1 style={styles.heading}>Admin</h1>

      {/* Data Management Section */}
      <p style={{ ...common.sectionLabel, marginTop: '1.5rem' }}>Data Management</p>
      <div style={styles.grid}>
        {dataPages.map(page => (
          <div
            key={page.path}
            style={styles.gridCard}
            onClick={() => navigate(page.path)}
          >
            <span style={styles.gridCardLabel}>{page.label}</span>
            <span style={common.arrow}>›</span>
          </div>
        ))}
      </div>

      {/* Machine Setup Section */}
      <p style={{ ...common.sectionLabel, marginTop: '1.5rem' }}>Machine Setup</p>
      <p style={styles.sectionSub}>
        Link parameters and products to each machine.
      </p>

      {error && <p style={styles.errorText}>{error}</p>}

      {loading ? (
        <p style={common.loadingText}>Loading machines...</p>
      ) : (
        <div style={styles.list}>
          {machines.map(machine => (
            <div
              key={machine.id}
              style={{ ...common.card, cursor: 'pointer' }}
              onClick={() => navigate(`/admin/machines/${machine.id}`)}
            >
              <div style={common.cardLeft}>
                <span style={styles.cardName}>{machine.name}</span>
                {machine.code && (
                  <span style={styles.cardCode}>{machine.code}</span>
                )}
              </div>
              <span style={common.arrow}>›</span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

const styles = {
  heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '1.5rem',
  },
  sectionSub: {
    color: 'var(--color-text-muted)',
    fontSize: '0.8rem',
    marginBottom: '0.75rem',
    marginTop: '-0.5rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  gridCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
  },
  gridCardLabel: {
    color: 'var(--color-text-primary)',
    fontSize: '0.9rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  cardName: {
    color: 'var(--color-text-primary)',
    fontSize: '0.9rem',
  },
  cardCode: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
  },
  errorText: {
    color: 'var(--color-danger)',
    fontSize: '0.9rem',
  },
}
