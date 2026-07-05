/**
 * @file MaterialsPage.jsx
 * @description Admin page for material master data and stock deliveries.
 * Stock is only ever ADDED here — consumption happens automatically when runs
 * complete, so there is deliberately no "subtract stock" control.
 */
import { useState } from 'react'
import { getAllMaterials, createMaterial, updateMaterial } from '../api/materials'
import { useApi } from '../hooks/useApi'
import { common } from '../styles/common'

/**
 * Renders the material list with an add form and per-row delivery input.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/materials" element={<MaterialsPage />} />
 */
function MaterialsPage() {
  const { data: materials, loading, error, reload } = useApi(getAllMaterials, 'Failed to load materials')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [supplier, setSupplier] = useState('')
  const [stockQty, setStockQty] = useState('')
  const [actionError, setActionError] = useState(null)
  // One shared editing slot — only one delivery form is open at a time.
  const [editingId, setEditingId] = useState(null)
  const [editingStock, setEditingStock] = useState('')

  /**
   * Creates a material from the form, then refetches the list.
   *
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * <button onClick={handleSubmit}>Add Material</button>
   */
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

  /**
   * Records a stock delivery by adding the entered amount to the current stock.
   *
   * @param {string} id - Material UUID.
   * @param {number} currentStock - Stock shown in the list (used as the base for the addition).
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleAddStock('a9d2…', 1250.5) // with editingStock "500" → stores 1750.5
   */
  async function handleAddStock(id, currentStock) {
    const amount = parseFloat(editingStock)
    // Positive-only: deliveries can't be negative, and rejecting NaN here keeps
    // garbage input from ever reaching the API.
    if (isNaN(amount) || amount <= 0) {
        setActionError('Please enter a valid positive number')
        return
    }
    try {
        // TODO: lost-update race — currentStock comes from a possibly stale list,
        // and the server receives an ABSOLUTE value. If a run completes (or a
        // second delivery lands) between load and save, that change is silently
        // erased. Send a delta and let the server increment atomically.
        // todo.md Group 2 #1.
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
  // TODO: a mutation error replaces the WHOLE page — show a banner instead.
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
