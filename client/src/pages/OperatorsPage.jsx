/**
 * @file OperatorsPage.jsx
 * @description Admin page for operator master data: create, deactivate,
 * reactivate. There is no delete on purpose — operators are soft-deleted so
 * historical runs keep their reference.
 */
import { useState } from 'react'
import { getAllOperators, createOperator, updateOperator } from '../api/operators'
import { useApi } from '../hooks/useApi'
import { common } from '../styles/common'

/**
 * Renders the operator list with an add form and active toggles.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/operators" element={<OperatorsPage />} />
 */
function OperatorsPage() {
  const { data: operators, loading, error, reload } = useApi(getAllOperators, 'Failed to load operators')
  const [name, setName] = useState('')
  // Separate from the hook's fetch error: a failed mutation shouldn't be
  // overwritten by the next successful list reload.
  const [actionError, setActionError] = useState(null)

  /**
   * Creates an operator from the form, then refetches the list.
   *
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * <button onClick={handleSubmit}>Add Operator</button>
   */
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

  /**
   * Soft-deletes an operator (active: false) — hides them from new runs while
   * keeping history intact.
   *
   * @param {string} id - Operator UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleDeactivate('b3f1c2d4-…')
   */
  async function handleDeactivate(id) {
    try {
        await updateOperator(id, { active: false })
        reload()
    } catch (err) {
        setActionError('Failed to deactivate operator')
        console.error(err)
    }
  }

  /**
   * Reactivates a soft-deleted operator for future runs.
   *
   * @param {string} id - Operator UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleActivate('b3f1c2d4-…')
   */
  async function handleActivate(id) {
    try {
        await updateOperator(id, { active: true })
        reload()
    } catch (err) {
        setActionError('Failed to activate operator')
        console.error(err)
    }
  }

  if (loading) return <p style={common.loadingText}>Loading...</p>
  // TODO: a mutation error replaces the WHOLE page (list and form vanish) —
  // render it as a banner above the list instead so the user can retry in place.
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
