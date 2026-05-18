import { useState, useEffect } from 'react'
import { getAllParameters, createParameter } from '../api/parameters'

function ParametersPage() {
  const [parameters, setParameters] = useState([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchParameter() {
    try {
      setLoading(true)
      const response = await getAllParameters()
      setParameters (response.data)
    } catch (err) {
      setError('Failed to load parameters')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function load() {
      await fetchParameter()
    }
    load()
  }, [])

  async function handleSubmit() {
    if (!name.trim()) return
    try {
      await createParameter({ 
        name, 
        ...(unit.trim() && { unit }),
        ...(description.trim() && { description })
      })
      setName('')
      setUnit('')
      setDescription('')
      fetchParameter()
    } catch (err) {
      setError('Failed to create parameter')
      console.error(err)
    }
  }

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'var(--color-danger)' }}>{error}</p>

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Parameters</h1>

      <div style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="Parameter name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Unit (optional)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button style={styles.button} onClick={handleSubmit}>
          Add Parameter
        </button>
      </div>

      <div style={styles.list}>
        {parameters.map((parameter) => (
        <div key={parameter.id} style={styles.card}>
          <div style={styles.cardLeft}>
            <span style={styles.cardName}>{parameter.name}</span>
            {parameter.unit && <span style={styles.cardType}>{parameter.unit}</span>}
            {parameter.description && <span style={styles.cardType}>{parameter.description}</span>}
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
    color: 'var(--color-text-primary)',
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
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  },
  button: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--color-accent-link)',
    color: 'var(--color-on-accent)',
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
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
  },
  cardLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  cardName: {
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  },
  cardType: {
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
  },
}

export default ParametersPage

