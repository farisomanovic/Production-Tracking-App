/**
 * Renders operator master-data administration.
 * Supports operator creation, editing, and active-flag soft deletion.
 * Keeps inactive operators available for historical run traceability.
 */
import { useState, useEffect } from 'react'
import { getAllOperators, createOperator, updateOperator } from '../api/operators'
import { common } from '../styles/common'

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
        // Soft deletion: active=false removes this operator from new runs while retaining historical links.
        await updateOperator(id, { active: false })
        fetchOperators()
    } catch (err) {
        setError('Failed to deactivate operator')
        console.error(err)
    }
  }

  async function handleActivate(id) {
    try {
        // Reactivation restores the operator to selection lists for future production runs.
        await updateOperator(id, { active: true })
        fetchOperators()
    } catch (err) {
        setError('Failed to activate operator')
        console.error(err)
    }
  }

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'var(--color-danger)' }}>{error}</p>

  return (
    <div style={common.container}>
      <h1 style={styles.heading}>Operators</h1>

      <div style={styles.form}>
        <input
          style={{ ...common.input, flex: 1 }}
          type="text"
          placeholder="Operator name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button style={common.button} onClick={handleSubmit}>
          Add Operator
        </button>
      </div>

      <div style={common.list}>
        {operators.map((operator) => (
          <div key={operator.id} style={common.card}>
              <span style={common.cardName}>{operator.name}</span>
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
  heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '24px',
  },
  form: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
  },
  badgeActive: {
    fontSize: '12px',
    color: 'var(--color-success-strong)',
    backgroundColor: 'var(--color-success-surface)',
    padding: '4px 8px',
    borderRadius: '12px',
  },
  badgeInactive: {
    fontSize: '12px',
    color: 'var(--color-danger-strong)',
    backgroundColor: 'var(--color-danger-surface)',
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
    backgroundColor: 'var(--color-danger-surface)',
    color: 'var(--color-danger-strong)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  activateButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-success-surface)',
    color: 'var(--color-success-strong)',
    fontSize: '12px',
    cursor: 'pointer',
  },
}

export default OperatorsPage
