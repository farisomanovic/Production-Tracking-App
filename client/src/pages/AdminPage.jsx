import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllMachines } from '../api/machines'

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
    <div style={styles.container}>
      <h1 style={styles.heading}>Admin</h1>

      {/* Data Management Section */}
      <p style={styles.sectionLabel}>Data Management</p>
      <div style={styles.grid}>
        {dataPages.map(page => (
          <div
            key={page.path}
            style={styles.gridCard}
            onClick={() => navigate(page.path)}
          >
            <span style={styles.gridCardLabel}>{page.label}</span>
            <span style={styles.arrow}>›</span>
          </div>
        ))}
      </div>

      {/* Machine Setup Section */}
      <p style={styles.sectionLabel}>Machine Setup</p>
      <p style={styles.sectionSub}>
        Link parameters and products to each machine.
      </p>

      {error && <p style={styles.errorText}>{error}</p>}

      {loading ? (
        <p style={styles.loadingText}>Loading machines...</p>
      ) : (
        <div style={styles.list}>
          {machines.map(machine => (
            <div
              key={machine.id}
              style={styles.card}
              onClick={() => navigate(`/admin/machines/${machine.id}`)}
            >
              <div style={styles.cardLeft}>
                <span style={styles.cardName}>{machine.name}</span>
                {machine.code && (
                  <span style={styles.cardCode}>{machine.code}</span>
                )}
              </div>
              <span style={styles.arrow}>›</span>
            </div>
          ))}
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
    marginBottom: '1.5rem',
  },
  sectionLabel: {
    color: '#888',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
    marginTop: '1.5rem',
  },
  sectionSub: {
    color: '#555',
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
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #333',
    cursor: 'pointer',
  },
  gridCardLabel: {
    color: '#ffffff',
    fontSize: '0.9rem',
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
  cardLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  cardName: {
    color: '#ffffff',
    fontSize: '0.9rem',
  },
  cardCode: {
    color: '#888',
    fontSize: '0.75rem',
  },
  arrow: {
    color: '#888',
    fontSize: '20px',
  },
  loadingText: {
    color: '#888',
    fontSize: '0.9rem',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.9rem',
  },
}