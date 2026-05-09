import { useState, useEffect } from 'react'
import { getAllMachines, createMachine } from '../api/machines'

function MachinesPage() {
  const [machines, setMachines] = useState([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchMachines() {
    try {
      setLoading(true)
      const response = await getAllMachines()
      setMachines(response.data)
    } catch (err) {
      setError('Failed to load machines')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function load() {
      await fetchMachines()
    }
    load()
  }, [])

  async function handleSubmit() {
    if (!name.trim()) return
    try {
      await createMachine({ 
        name, 
        ...(code.trim() && { code })
      })
      setName('')
      setCode('')
      fetchMachines()
    } catch (err) {
      setError('Failed to create machine')
      console.error(err)
    }
  }

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'red' }}>{error}</p>

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Machines</h1>

      <div style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="Machine name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Machine code (optional)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button style={styles.button} onClick={handleSubmit}>
          Add Machine
        </button>
      </div>

      <div style={styles.list}>
        {machines.map((machine) => (
          <div key={machine.id} style={styles.card}>
            <div style={styles.cardLeft}>
              <span style={styles.cardName}>{machine.name}</span>
              <span style={styles.cardType}>{machine.code}</span>
            </div>
            <span style={machine.active ? styles.badgeActive : styles.badgeInactive}>
              {machine.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>
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
    marginBottom: '24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px',
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '14px',
  },
  button: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#4f8ef7',
    color: '#ffffff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #333',
  },
  cardLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  cardName: {
    color: '#ffffff',
    fontSize: '14px',
  },
  cardType: {
    color: '#888',
    fontSize: '12px',
  },
  badgeActive: {
    fontSize: '12px',
    color: '#4caf50',
    backgroundColor: '#1b3a1f',
    padding: '4px 8px',
    borderRadius: '12px',
  },
  badgeInactive: {
    fontSize: '12px',
    color: '#f44336',
    backgroundColor: '#3a1b1b',
    padding: '4px 8px',
    borderRadius: '12px',
  },
}

export default MachinesPage