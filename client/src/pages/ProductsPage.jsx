import { useState, useEffect } from 'react'
import { getAllProducts, createProduct } from '../api/products'

function ProductsPage() {
  const [products, setProducts] = useState([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [widthMm, setWidthMm] = useState('')
  const [thicknessMm, setThicknessMm] = useState('')
  const [lengthM, setLengthM] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchProducts() {
    try {
      setLoading(true)
      const response = await getAllProducts()
      setProducts(response.data)
    } catch (err) {
      setError('Failed to load products')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function load() {
      await fetchProducts()
    }
    load()
  }, [])

  async function handleSubmit() {
    if (!name.trim() || !code.trim() || !unit.trim()) return
    try {
      await createProduct({ 
        name, 
        code,
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
      fetchProducts()
    } catch (err) {
      setError('Failed to create product')
      console.error(err)
    }
  }

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'red' }}>{error}</p>

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Products</h1>

      <div style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="Product name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          style={styles.input}
          type="number"
          placeholder="Width Mm (optional)"
          value={widthMm}
          onChange={(e) => setWidthMm(e.target.value)}
        />
        <input
          style={styles.input}
          type="number"
          placeholder="Thickness Mm (optional)"
          value={thicknessMm}
          onChange={(e) => setThicknessMm(e.target.value)}
        />
        <input
          style={styles.input}
          type="number"
          placeholder="Length M (optional)"
          value={lengthM}
          onChange={(e) => setLengthM(e.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          style={styles.input}
          type="text"
          placeholder="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <button style={styles.button} onClick={handleSubmit}>
          Add Product
        </button>
      </div>

      <div style={styles.list}>
        {products.map((product) => (
        <div key={product.id} style={styles.card}>
          <div style={styles.cardLeft}>
            <span style={styles.cardName}>{product.name}</span>
            <span style={styles.cardType}>{product.code} — {product.unit}</span>
            {product.widthMm && <span style={styles.cardType}>Width: {product.widthMm}mm</span>}
            {product.thicknessMm && <span style={styles.cardType}>Thickness: {product.thicknessMm}mm</span>}
            {product.lengthM && <span style={styles.cardType}>Length: {product.lengthM}m</span>}
            {product.description && <span style={styles.cardType}>{product.description}</span>}
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
}

export default ProductsPage