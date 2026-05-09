import { useState, useEffect } from 'react'
import { getAllOperators, createOperator, updateOperator } from '../api/operators'

function OperatorsPage() {
  const [operators, setOperators] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchOperators() {
    try {
      setLoading(true)
      const response = await getAllOperators()
      setOperators(response.data)
    } catch (err) {
      setError('Failed to load operators')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function load() {
      await fetchOperators()
    }
    load()
  }, [])

  async function handleSubmit() {
    if (!name.trim()) return
    try {
      await createOperator({ name })
      setName('')
      fetchOperators()
    } catch (err) {
      setError('Failed to create operator')
      console.error(err)
    }
  }

  async function handleDeactivate(id) {
    try {
        await updateOperator(id, { active: false })
        fetchOperators()
    } catch (err) {
        setError('Failed to deactivate operator')
        console.error(err)
    }
  }

  async function handleActivate(id) {
    try {
        await updateOperator(id, { active: true })
        fetchOperators()
    } catch (err) {
        setError('Failed to activate operator')
        console.error(err)
    }
  }

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'red' }}>{error}</p>

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Operators</h1>

      <div style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="Operator name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button style={styles.button} onClick={handleSubmit}>
          Add Operator
        </button>
      </div>

      <div style={styles.list}>
        {operators.map((operator) => (
          <div key={operator.id} style={styles.card}>
              <span style={styles.cardName}>{operator.name}</span>
              <div style={styles.cardRight}>
                  <span style={operator.active ? styles.badgeActive : styles.badgeInactive}>
                      {operator.active ? 'Active' : 'Inactive'}
                  </span>
                  {operator.active && (
                      <button
                          style={styles.deactivateButton}
                          onClick={() => handleDeactivate(operator.id)}
                      >
                          Deactivate
                      </button>
                  )}
                  {!operator.active && (
                      <button
                          style={styles.activateButton}
                          onClick={() => handleActivate(operator.id)}
                      >
                          Activate
                      </button>
                  )}
              </div>
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
    gap: '8px',
    marginBottom: '24px',
  },
  input: {
    flex: 1,
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
  cardName: {
    color: '#ffffff',
    fontSize: '14px',
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
  cardRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
},
deactivateButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#3a1b1b',
    color: '#f44336',
    fontSize: '12px',
    cursor: 'pointer',
},
activateButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#1b3a1f',
    color: '#4caf50',
    fontSize: '12px',
    cursor: 'pointer',
},
}

export default OperatorsPage