/**
 * Renders detailed machine setup for parameters and products.
 * Manages machine-specific parameter assignments and product compatibility.
 * Persists displayOrder-sensitive configuration used by run entry forms.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getMachineById } from '../api/machines'
import { getMachineParameters, linkParameterToMachine, unlinkParameterFromMachine } from '../api/machineParameters'
import { getMachineProducts, linkProductToMachine, unlinkProductFromMachine } from '../api/machineProducts'
import { getAllParameters } from '../api/parameters'
import { getAllProducts } from '../api/products'
import { common } from '../styles/common'

function MachineDetailPage() {
  const { machineId } = useParams()
  const navigate = useNavigate()

  const [machine, setMachine] = useState(null)
  const [linkedParameters, setLinkedParameters] = useState([])
  const [linkedProducts, setLinkedProducts] = useState([])
  const [allParameters, setAllParameters] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [selectedParameterId, setSelectedParameterId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [machineRes, linkedParamsRes, linkedProductsRes, allParamsRes, allProductsRes] = await Promise.all([
          getMachineById(machineId),
          getMachineParameters(machineId),
          getMachineProducts(machineId),
          getAllParameters(),
          getAllProducts()
        ])
        setMachine(machineRes.data)
        setLinkedParameters(linkedParamsRes.data)
        setLinkedProducts(linkedProductsRes.data)
        setAllParameters(allParamsRes.data)
        setAllProducts(allProductsRes.data)
      } catch (err) {
        setError('Failed to load machine details')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [machineId])

  async function handleLinkParameter() {
    if (!selectedParameterId) return
    try {
      await linkParameterToMachine({ machineId, parameterId: selectedParameterId })
      setSelectedParameterId('')
      const res = await getMachineParameters(machineId)
      setLinkedParameters(res.data)
    } catch (err) {
      setError('Failed to link parameter')
      console.error(err)
    }
  }

  async function handleUnlinkParameter(linkId) {
    try {
      await unlinkParameterFromMachine(linkId)
      const res = await getMachineParameters(machineId)
      setLinkedParameters(res.data)
    } catch (err) {
      setError('Failed to unlink parameter')
      console.error(err)
    }
  }

  async function handleLinkProduct() {
    if (!selectedProductId) return
    try {
      await linkProductToMachine({ machineId, productId: selectedProductId })
      setSelectedProductId('')
      const res = await getMachineProducts(machineId)
      setLinkedProducts(res.data)
    } catch (err) {
      setError('Failed to link product')
      console.error(err)
    }
  }

  async function handleUnlinkProduct(linkId) {
    try {
      await unlinkProductFromMachine(linkId)
      const res = await getMachineProducts(machineId)
      setLinkedProducts(res.data)
    } catch (err) {
      setError('Failed to unlink product')
      console.error(err)
    }
  }

  const availableParameters = allParameters.filter(
    (p) => !linkedParameters.some((lp) => lp.parameterId === p.id)
  )

  const availableProducts = allProducts.filter(
    (p) => !linkedProducts.some((lp) => lp.productId === p.id)
  )

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'var(--color-danger)' }}>{error}</p>

  return (
    <div style={common.container}>
      <button style={styles.backButton} onClick={() => navigate('/admin')}>
        ← Back
      </button>

      <h1 style={styles.heading}>{machine.name}</h1>
      {machine.code && <p style={styles.subtext}>{machine.code}</p>}

      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>Parameters</h2>

        <div style={styles.linkForm}>
          <select
            style={styles.select}
            value={selectedParameterId}
            onChange={(e) => setSelectedParameterId(e.target.value)}
          >
            <option value="">Select a parameter</option>
            {availableParameters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.unit ? `(${p.unit})` : ''}
              </option>
            ))}
          </select>
          <button style={common.button} onClick={handleLinkParameter}>
            Link
          </button>
        </div>

        <div style={common.list}>
          {linkedParameters.length === 0 && (
            <p style={styles.empty}>No parameters linked yet</p>
          )}
          {linkedParameters.map((lp) => (
            <div key={lp.id} style={common.card}>
              <div style={common.cardLeft}>
                <span style={common.cardName}>{lp.parameter.name}</span>
                {lp.parameter.unit && (
                  <span style={common.cardType}>{lp.parameter.unit}</span>
                )}
              </div>
              <button
                style={styles.unlinkButton}
                onClick={() => handleUnlinkParameter(lp.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>Products</h2>

        <div style={styles.linkForm}>
          <select
            style={styles.select}
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">Select a product</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.code ? `(${p.code})` : ''}
              </option>
            ))}
          </select>
          <button style={common.button} onClick={handleLinkProduct}>
            Link
          </button>
        </div>

        <div style={common.list}>
          {linkedProducts.length === 0 && (
            <p style={styles.empty}>No products linked yet</p>
          )}
          {linkedProducts.map((lp) => (
            <div key={lp.id} style={common.card}>
              <div style={common.cardLeft}>
                <span style={common.cardName}>{lp.product.name}</span>
                {lp.product.code && (
                  <span style={common.cardType}>{lp.product.code}</span>
                )}
              </div>
              <button
                style={styles.unlinkButton}
                onClick={() => handleUnlinkProduct(lp.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

const styles = {
  backButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent-link)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0',
    marginBottom: '16px',
  },
  heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '4px',
  },
  subtext: {
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    marginBottom: '24px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionHeading: {
    color: 'var(--color-text-primary)',
    fontSize: '16px',
    marginBottom: '12px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '8px',
  },
  linkForm: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  select: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  },
  unlinkButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-danger-surface)',
    color: 'var(--color-danger-strong)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  empty: {
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontStyle: 'italic',
  },
}

export default MachineDetailPage
