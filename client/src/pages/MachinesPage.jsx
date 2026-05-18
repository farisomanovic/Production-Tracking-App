import { useState, useEffect } from 'react'
import { getAllMachines, createMachine, updateMachine } from '../api/machines'

function MachinesPage() {
  const [machines, setMachines] = useState([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingCode, setEditingCode] = useState('')

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

  async function handleDeactivate(id) {
    try {
        await updateMachine(id, { active: false })
        fetchMachines()
    } catch (err) {
        setError('Failed to deactivate machine')
        console.error(err)
    }
  }

  async function handleActivate(id) {
      try {
          await updateMachine(id, { active: true })
          fetchMachines()
      } catch (err) {
          setError('Failed to activate machine')
          console.error(err)
      }
  }

  async function handleSaveCode(id) {
      try {
          await updateMachine(id, { code: editingCode })
          setEditingId(null)
          fetchMachines()
      } catch (err) {
          setError('Failed to update machine code')
          console.error(err)
      }
  }

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'var(--color-danger)' }}>{error}</p>

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
                          <span style={styles.cardType}>{machine.code}</span>
                          <button
                              style={styles.editButton}
                              onClick={() => {
                                  setEditingId(machine.id)
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

