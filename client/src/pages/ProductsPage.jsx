/**
 * @file ProductsPage.jsx
 * @description Admin page for product master data (create, list, and
 * activate/deactivate — editing the other fields has no UI yet even though the
 * API supports it). Machine compatibility and recipes are managed elsewhere.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProducts, createProduct, updateProduct } from '../api/products'
import { useApi } from '../hooks/useApi'
import ErrorBanner from '../components/ErrorBanner'
import { common } from '../styles/common'
import { getErrorMessage } from '../lib/errorMessage'
import { missingFieldsMessage } from '../lib/requiredFields'
import { UNITS } from '../lib/units'

/**
 * Renders the product list with an add form.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/products" element={<ProductsPage />} />
 */
function ProductsPage() {
  const navigate = useNavigate()
  const { data: products, loading, error, reload } = useApi(getAllProducts, 'Failed to load products')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [widthMm, setWidthMm] = useState('')
  const [thicknessMm, setThicknessMm] = useState('')
  const [lengthM, setLengthM] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('')
  const [actionError, setActionError] = useState(null)

  /**
   * Creates a product from the form, then refetches the list. Requires code
   * client-side to fail fast; the server independently validates it too.
   *
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * <button onClick={handleSubmit}>Add Product</button>
   */
  async function handleSubmit() {
    setActionError(null)
    const missing = missingFieldsMessage([['Name', name], ['Code', code], ['Unit', unit]])
    if (missing) {
      setActionError(missing)
      return
    }
    try {
      await createProduct({
        name,
        code,
        // Dimensions parsed here (not sent as strings) because the schema
        // columns are Float — Prisma rejects string values.
        ...(widthMm.trim() && { widthMm: parseFloat(widthMm) }),
        ...(thicknessMm.trim() && { thicknessMm: parseFloat(thicknessMm) }),
        ...(lengthM.trim() && { lengthM: parseFloat(lengthM) }),
        ...(description.trim() && { description }),
        unit
      })
      setName('')
      setCode('')
      setWidthMm('')
      setThicknessMm('')
      setLengthM('')
      setDescription('')
      setUnit('')
      reload()
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to create product'))
      console.error(err)
    }
  }

  /**
   * Soft-deletes a product (active: false) — removes it from new-run selection
   * while every historical ProductionRun keeps its foreign key.
   *
   * @param {string} id - Product UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleDeactivate('c771…')
   */
  async function handleDeactivate(id) {
    try {
        await updateProduct(id, { active: false })
        reload()
    } catch (err) {
        // The server refuses with a 409 while a run of this product is in
        // progress, and getErrorMessage surfaces that reason verbatim.
        setActionError(getErrorMessage(err, 'Failed to deactivate product'))
        console.error(err)
    }
  }

  /**
   * Reactivates a soft-deleted product so new runs can select it again.
   *
   * @param {string} id - Product UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleActivate('c771…')
   */
  async function handleActivate(id) {
    try {
        await updateProduct(id, { active: true })
        reload()
    } catch (err) {
        setActionError(getErrorMessage(err, 'Failed to activate product'))
        console.error(err)
    }
  }

  if (loading) return <p style={common.loadingText}>Loading...</p>

  return (
    <div style={common.container}>
      <ErrorBanner message={error} onDismiss={reload} dismissLabel="Retry" />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      <h1 style={styles.heading}>Products</h1>

      <div style={common.form}>
        <input
          style={common.input}
          type="text"
          placeholder="Product name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={common.input}
          type="text"
          placeholder="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          style={common.input}
          type="number"
          placeholder="Width Mm (optional)"
          value={widthMm}
          onChange={(e) => setWidthMm(e.target.value)}
          onWheel={(e) => e.target.blur()}
        />
        <input
          style={common.input}
          type="number"
          placeholder="Thickness Mm (optional)"
          value={thicknessMm}
          onChange={(e) => setThicknessMm(e.target.value)}
          onWheel={(e) => e.target.blur()}
        />
        <input
          style={common.input}
          type="number"
          placeholder="Length M (optional)"
          value={lengthM}
          onChange={(e) => setLengthM(e.target.value)}
          onWheel={(e) => e.target.blur()}
        />
        <input
          style={common.input}
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <select
          style={common.input}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          <option value="">Unit...</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <button style={common.button} onClick={handleSubmit}>
          Add Product
        </button>
      </div>

      <div style={common.list}>
        {products.map((product) => (
        <div
          key={product.id}
          style={{ ...common.card, cursor: 'pointer' }}
          onClick={() => navigate(`/products/${product.id}`)}
        >
          <div style={common.cardLeft}>
            <span style={common.cardName}>{product.name}</span>
            <span style={common.cardType}>{product.code} — {product.unit}</span>
            {product.widthMm && <span style={common.cardType}>Width: {product.widthMm}mm</span>}
            {product.thicknessMm && <span style={common.cardType}>Thickness: {product.thicknessMm}mm</span>}
            {product.lengthM && <span style={common.cardType}>Length: {product.lengthM}m</span>}
            {product.description && <span style={common.cardType}>{product.description}</span>}
          </div>
          <div style={common.cardRight}>
            <span style={product.active ? common.badgeActive : common.badgeInactive}>
              {product.active ? 'Active' : 'Inactive'}
            </span>
            {/* stopPropagation because the whole card is a navigation target —
                without it, deactivating would also open the detail page. */}
            {product.active ? (
              <button
                style={common.deactivateButton}
                onClick={(e) => { e.stopPropagation(); handleDeactivate(product.id) }}
              >
                Deactivate
              </button>
            ) : (
              <button
                style={common.activateButton}
                onClick={(e) => { e.stopPropagation(); handleActivate(product.id) }}
              >
                Activate
              </button>
            )}
            <span style={common.arrow}>›</span>
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
}

export default ProductsPage
