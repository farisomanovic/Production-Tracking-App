import { useState, useEffect } from 'react'
import { getAllRecipes, createRecipe } from '../api/recipes'
import { getAllMaterials } from '../api/materials'
import { getAllProducts } from '../api/products'

function RecipesPage() {
  const [recipes, setRecipes] = useState([])
  const [materials, setMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [name, setName] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([])
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [percentage, setPercentage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [recipesRes, materialsRes, productsRes] = await Promise.all([
          getAllRecipes(),
          getAllMaterials(),
          getAllProducts()
        ])
        setRecipes(recipesRes.data)
        setMaterials(materialsRes.data)
        setProducts(productsRes.data)
      } catch (err) {
        setError('Failed to load data')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function handleAddItem() {
    if (!selectedMaterialId || !percentage) return

    const material = materials.find((m) => m.id === selectedMaterialId)
    const alreadyAdded = items.some((i) => i.materialId === selectedMaterialId)
    if (alreadyAdded) return

    setItems([
      ...items,
      {
        materialId: selectedMaterialId,
        materialName: material.name,
        percentage: parseFloat(percentage)
      }
    ])
    setSelectedMaterialId('')
    setPercentage('')
  }

  function handleRemoveItem(materialId) {
    setItems(items.filter((i) => i.materialId !== materialId))
  }

  function getTotalPercentage() {
    return items.reduce((sum, item) => sum + item.percentage, 0)
  }

  async function handleSubmit() {
    if (!name.trim() || !selectedProductId || items.length === 0) return
    if (getTotalPercentage() !== 100) return

    try {
      await createRecipe({
        name,
        isDefault,
        ...(notes.trim() && { notes }),
        productId: selectedProductId,
        items: items.map((i) => ({
          materialId: i.materialId,
          percentage: i.percentage
        }))
      })
      setName('')
      setNotes('')
      setIsDefault(false)
      setItems([])
      setSelectedProductId('')
      setShowForm(false)
      const res = await getAllRecipes()
      setRecipes(res.data)
    } catch (err) {
      setError('Failed to create recipe')
      console.error(err)
    }
  }

  const availableMaterials = materials.filter(
    (m) => !items.some((i) => i.materialId === m.id)
  )

  const totalPercentage = getTotalPercentage()

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (error) return <p style={{ padding: '16px', color: 'red' }}>{error}</p>

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.heading}>Recipes</h1>
        <button
          style={styles.button}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ New Recipe'}
        </button>
      </div>

      {showForm && (
        <div style={styles.form}>
          <input
            style={styles.input}
            type="text"
            placeholder="Recipe name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            style={styles.select}
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.code ? `(${p.code})` : ''}
              </option>
            ))}
          </select>
          <input
            style={styles.input}
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <label style={{ color: '#888', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Set as default recipe
          </label>

          <p style={styles.sectionLabel}>Ingredients</p>

          <div style={styles.itemForm}>
            <select
              style={styles.select}
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
            >
              <option value="">Select material</option>
              {availableMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              style={styles.percentageInput}
              type="number"
              placeholder="%"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
            />
            <button style={styles.addItemButton} onClick={handleAddItem}>
              Add
            </button>
          </div>

          {items.length > 0 && (
            <div style={styles.itemList}>
              {items.map((item) => (
                <div key={item.materialId} style={styles.itemCard}>
                  <span style={styles.itemName}>{item.materialName}</span>
                  <div style={styles.itemRight}>
                    <span style={styles.itemPercentage}>{item.percentage}%</span>
                    <button
                      style={styles.removeButton}
                      onClick={() => handleRemoveItem(item.materialId)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>Total</span>
                <span style={totalPercentage === 100 ? styles.totalGood : styles.totalBad}>
                  {totalPercentage}%
                </span>
              </div>
            </div>
          )}

          <button
            style={{
              ...styles.button,
              opacity: totalPercentage === 100 && name.trim() ? 1 : 0.4,
              cursor: totalPercentage === 100 && name.trim() ? 'pointer' : 'not-allowed'
            }}
            onClick={handleSubmit}
          >
            Save Recipe
          </button>
        </div>
      )}

      <div style={styles.list}>
        {recipes.map((recipe) => (
          <div key={recipe.id} style={styles.card}>
            <div style={styles.cardLeft}>
              <span style={styles.cardName}>{recipe.name}</span>
              <span style={styles.cardType}>{recipe.product.name}</span>
              {recipe.notes && (
                <span style={styles.cardType}>{recipe.notes}</span>
              )}
              {recipe.recipeItems && recipe.recipeItems.length > 0 && (
                <span style={styles.cardType}>
                  {recipe.recipeItems.length} ingredient{recipe.recipeItems.length !== 1 ? 's' : ''}
                </span>
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  heading: {
    color: '#ffffff',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#12122a',
    borderRadius: '8px',
    border: '1px solid #333',
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '14px',
  },
  sectionLabel: {
    color: '#888',
    fontSize: '12px',
    margin: '8px 0 4px 0',
  },
  itemForm: {
    display: 'flex',
    gap: '8px',
  },
  select: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '14px',
  },
  percentageInput: {
    width: '60px',
    padding: '10px 8px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '14px',
  },
  addItemButton: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2a2a4a',
    color: '#ffffff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '8px',
  },
  itemCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#1a1a2e',
    borderRadius: '6px',
    border: '1px solid #333',
  },
  itemName: {
    color: '#ffffff',
    fontSize: '13px',
  },
  itemRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  itemPercentage: {
    color: '#4f8ef7',
    fontSize: '13px',
  },
  removeButton: {
    background: 'none',
    border: 'none',
    color: '#f44336',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderTop: '1px solid #333',
    marginTop: '4px',
  },
  totalLabel: {
    color: '#888',
    fontSize: '13px',
  },
  totalGood: {
    color: '#4caf50',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  totalBad: {
    color: '#f44336',
    fontSize: '13px',
    fontWeight: 'bold',
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

export default RecipesPage