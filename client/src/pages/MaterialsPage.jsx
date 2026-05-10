import { useState, useEffect } from 'react'
import { getAllMaterials, createMaterial, updateMaterial } from '../api/materials'

function MaterialsPage() {
  const [materials, setMaterials] = useState([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [supplier, setSupplier] = useState('')
  const [stockQty, setStockQty] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingStock, setEditingStock] = useState('')

  async function fetchMaterials() {
    try {
      setLoading(true)
      const response = await getAllMaterials()
      setMaterials(response.data)
    } catch (err) {
      setError('Failed to load materials')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function load() {
      await fetchMaterials()
    }
    load()
  }, [])

  async function handleSubmit() {
    if (!name.trim() || !unit.trim()) return
    try {
      await createMaterial({ 
        name, 
        unit,
        ...(supplier.trim() && { supplier }),
        ...(stockQty.trim() && { stockQty: parseFloat(stockQty) })
      })
      setName('')
      setUnit('')
      setSupplier('')
      setStockQty('')
      fetchMaterials()
    } catch (err) {
      setError('Failed to create material')
      console.error(err)
    }
  }

  async function handleAddStock(id, currentStock) {
    const amount = parseFloat(editingStock)
    if (isNaN(amount) || amount <= 0) {
        setError('Please enter a valid positive number')
        return
    }
    try {
        await updateMaterial(id, { stockQty: currentStock + amount })
        setEditingId(null)
        setEditingStock('')
        fetchMaterials()
    } catch (err) {
        setError('Failed to update stock')
        console.error(err)
    }
  }

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'red' }}>{error}</p>

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Materials</h1>

      <div style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="Material name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Supplier (optional)"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        />
        <input
          style={styles.input}
          type="number"
          placeholder="Stock Quantity (optional)"
          value={stockQty}
          onChange={(e) => setStockQty(e.target.value)}
        />
        <button style={styles.button} onClick={handleSubmit}>
          Add Material
        </button>
      </div>

      <div style={styles.list}>
        {materials.map((material) => (
          <div key={material.id} style={styles.card}>
              <div style={styles.cardLeft}>
                  <span style={styles.cardName}>{material.name}</span>
                  <span style={styles.cardType}>{material.unit}</span>
                  {material.supplier && (
                      <span style={styles.cardType}>{material.supplier}</span>
                  )}
                  <span style={styles.cardType}>
                      Stock: {material.stockQty ?? 0} {material.unit}
                  </span>
                  {editingId === material.id ? (
                      <div style={styles.editRow}>
                          <input
                              style={styles.editInput}
                              type='number'
                              value={editingStock}
                              onChange={e => setEditingStock(e.target.value)}
                              placeholder={`Amount to add (${material.unit})`}
                          />
                          <button
                              style={styles.saveButton}
                              onClick={() => handleAddStock(material.id, material.stockQty ?? 0)}
                          >
                              Add
                          </button>
                          <button
                              style={styles.cancelButton}
                              onClick={() => {
                                  setEditingId(null)
                                  setEditingStock('')
                              }}
                          >
                              Cancel
                          </button>
                      </div>
                  ) : (
                      <button
                          style={styles.editButton}
                          onClick={() => setEditingId(material.id)}
                      >
                          + Add delivery
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
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
},
editInput: {
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid #333',
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    fontSize: '12px',
    width: '140px',
},
editButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#1a1a2e',
    color: '#888',
    fontSize: '12px',
    cursor: 'pointer',
    marginTop: '4px',
},
saveButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#1b3a1f',
    color: '#4caf50',
    fontSize: '12px',
    cursor: 'pointer',
},
cancelButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#3a1b1b',
    color: '#f44336',
    fontSize: '12px',
    cursor: 'pointer',
},
}

export default MaterialsPage