/**
 * Renders material master-data administration.
 * Supports material creation, editing, and stock quantity updates.
 * Supplies input materials used by recipes and completed production runs.
 */
import { useState } from 'react'
import { getAllMaterials, createMaterial, updateMaterial } from '../api/materials'
import { useApi } from '../hooks/useApi'
import { common } from '../styles/common'

function MaterialsPage() {
  const { data: materials, loading, error, reload } = useApi(getAllMaterials, 'Failed to load materials')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [supplier, setSupplier] = useState('')
  const [stockQty, setStockQty] = useState('')
  const [actionError, setActionError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingStock, setEditingStock] = useState('')

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
      reload()
    } catch (err) {
      setActionError('Failed to create material')
      console.error(err)
    }
  }

  async function handleAddStock(id, currentStock) {
    const amount = parseFloat(editingStock)
    if (isNaN(amount) || amount <= 0) {
        setActionError('Please enter a valid positive number')
        return
    }
    try {
        await updateMaterial(id, { stockQty: currentStock + amount })
        setEditingId(null)
        setEditingStock('')
        reload()
    } catch (err) {
        setActionError('Failed to update stock')
        console.error(err)
    }
  }

  if (loading) return <p style={common.loadingText}>Loading...</p>
  if (error || actionError) return <p style={common.errorBox}>{error || actionError}</p>

  return (
    <div style={common.container}>
      <h1 style={styles.heading}>Materials</h1>

      <div style={common.form}>
        <input
          style={common.input}
          type="text"
          placeholder="Material name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={common.input}
          type="text"
          placeholder="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          style={common.input}
          type="text"
          placeholder="Supplier (optional)"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        />
        <input
          style={common.input}
          type="number"
          placeholder="Stock Quantity (optional)"
          value={stockQty}
          onChange={(e) => setStockQty(e.target.value)}
        />
        <button style={common.button} onClick={handleSubmit}>
          Add Material
        </button>
      </div>

      <div style={common.list}>
        {materials.map((material) => (
          <div key={material.id} style={common.card}>
              <div style={common.cardLeft}>
                  <span style={common.cardName}>{material.name}</span>
                  <span style={common.cardType}>{material.unit}</span>
                  {material.supplier && (
                      <span style={common.cardType}>{material.supplier}</span>
                  )}
                  <span style={common.cardType}>
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
  heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '24px',
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
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    width: '140px',
  },
  editButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
    marginTop: '4px',
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
}

export default MaterialsPage
