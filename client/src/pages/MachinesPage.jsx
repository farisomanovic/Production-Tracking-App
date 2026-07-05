/**
 * @file MachinesPage.jsx
 * @description Admin page for machine master data: create, edit the code,
 * deactivate/reactivate. No delete on purpose — machines are soft-deleted so
 * historical runs keep their reference. Parameter/product links are managed on
 * MachineDetailPage, not here.
 */
import { useState } from 'react'
import { getAllMachines, createMachine, updateMachine } from '../api/machines'
import { useApi } from '../hooks/useApi'
import { common } from '../styles/common'

/**
 * Renders the machine list with add form, inline code editing, and active toggles.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/machines" element={<MachinesPage />} />
 */
function MachinesPage() {
  const { data: machines, loading, error, reload } = useApi(getAllMachines, 'Failed to load machines')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [actionError, setActionError] = useState(null)
  // One shared editing slot (id + draft) instead of per-row state: only one
  // code can be edited at a time, which keeps the row components stateless.
  const [editingId, setEditingId] = useState(null)
  const [editingCode, setEditingCode] = useState('')

  /**
   * Creates a machine from the form, then refetches the list.
   *
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * <button onClick={handleSubmit}>Add Machine</button>
   */
  async function handleSubmit() {
    if (!name.trim()) return
    try {
      await createMachine({
        name,
        // Only send code when non-blank — an empty string would occupy the
        // unique constraint's single "" slot and block every later blank code.
        ...(code.trim() && { code })
      })
      setName('')
      setCode('')
      reload()
    } catch (err) {
      setActionError('Failed to create machine')
      console.error(err)
    }
  }

  /**
   * Soft-deletes a machine (active: false) — removes it from new-run selection
   * while preserving run history.
   *
   * @param {string} id - Machine UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleDeactivate('7cd0…')
   */
  async function handleDeactivate(id) {
    try {
        await updateMachine(id, { active: false })
        reload()
    } catch (err) {
        setActionError('Failed to deactivate machine')
        console.error(err)
    }
  }

  /**
   * Reactivates a soft-deleted machine for future runs.
   *
   * @param {string} id - Machine UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleActivate('7cd0…')
   */
  async function handleActivate(id) {
      try {
          await updateMachine(id, { active: true })
          reload()
      } catch (err) {
          setActionError('Failed to activate machine')
          console.error(err)
      }
  }

  /**
   * Saves the edited machine code and closes the inline editor.
   *
   * @param {string} id - Machine UUID being edited.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleSaveCode('7cd0…')
   */
  async function handleSaveCode(id) {
      try {
          await updateMachine(id, { code: editingCode })
          setEditingId(null)
          reload()
      } catch (err) {
          setActionError('Failed to update machine code')
          console.error(err)
      }
  }

  if (loading) return <p style={common.loadingText}>Loading...</p>
  // TODO: a mutation error replaces the WHOLE page — show a banner instead so
  // the list stays visible and the user can retry.
  if (error || actionError) return <p style={common.errorBox}>{error || actionError}</p>

  return (
    <div style={common.container}>
      <h1 style={styles.heading}>Machines</h1>

      <div style={common.form}>
        <input
          style={common.input}
          type="text"
          placeholder="Machine name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={common.input}
          type="text"
          placeholder="Machine code (optional)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button style={common.button} onClick={handleSubmit}>
          Add Machine
        </button>
      </div>

      <div style={common.list}>
        {machines.map((machine) => (
          <div key={machine.id} style={common.card}>
              <div style={common.cardLeft}>
                  <span style={common.cardName}>{machine.name}</span>
                  {editingId === machine.id ? (
                      <div style={styles.editRow}>
                          <input
                              style={styles.editInput}
                              value={editingCode}
                              onChange={e => setEditingCode(e.target.value)}
                              placeholder="Machine code"
                          />
                          <button style={styles.saveButton} onClick={() => handleSaveCode(machine.id)}>
                              Save
                          </button>
                          <button style={styles.cancelButton} onClick={() => setEditingId(null)}>
                              Cancel
                          </button>
                      </div>
                  ) : (
                      <div style={styles.editRow}>
                          <span style={common.cardType}>{machine.code}</span>
                          <button
                              style={styles.editButton}
                              onClick={() => {
                                  setEditingId(machine.id)
                                  // Seed the draft with the current code so "Save"
                                  // without typing is a no-op, not an erase.
                                  setEditingCode(machine.code || '')
                              }}
                          >
                              Edit code
                          </button>
                      </div>
                  )}
              </div>
              <div style={styles.cardRight}>
                  <span style={machine.active ? styles.badgeActive : styles.badgeInactive}>
                      {machine.active ? 'Active' : 'Inactive'}
                  </span>
                  {machine.active ? (
                      <button style={styles.deactivateButton} onClick={() => handleDeactivate(machine.id)}>
                          Deactivate
                      </button>
                  ) : (
                      <button style={styles.activateButton} onClick={() => handleActivate(machine.id)}>
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
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  editInput: {
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
  },
  editButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-success-surface)',
    color: 'var(--color-success-strong)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-danger-surface)',
    color: 'var(--color-danger-strong)',
    fontSize: '12px',
    cursor: 'pointer',
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

export default MachinesPage
