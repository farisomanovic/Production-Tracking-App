/**
 * Renders operator master-data administration.
 * Supports operator creation, editing, and active-flag soft deletion.
 * Keeps inactive operators available for historical run traceability.
 */
import { useState } from 'react'
import { getAllOperators, createOperator, updateOperator } from '../api/operators'
import { useApi } from '../hooks/useApi'
import { common } from '../styles/common'

function OperatorsPage() {
  const { data: operators, loading, error, reload } = useApi(getAllOperators, 'Failed to load operators')
  const [name, setName] = useState('')
  const [actionError, setActionError] = useState(null)

  async function handleSubmit() {
    if (!name.trim()) return
    try {
      await createOperator({ name })
      setName('')
      reload()
    } catch (err) {
      setActionError('Failed to create operator')
      console.error(err)
    }
  }

  async function handleDeactivate(id) {
    try {
        // Soft deletion: active=false removes this operator from new runs while retaining historical links.
        await updateOperator(id, { active: false })
        reload()
    } catch (err) {
        setActionError('Failed to deactivate operator')
        console.error(err)
    }
  }

  async function handleActivate(id) {
    try {
        // Reactivation restores the operator to selection lists for future production runs.
        await updateOperator(id, { active: true })
        reload()
    } catch (err) {
        setActionError('Failed to activate operator')
        console.error(err)
    }
  }

  if (loading) return <p style={common.loadingText}>Loading...</p>
  if (error || actionError) return <p style={common.errorBox}>{error || actionError}</p>

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
