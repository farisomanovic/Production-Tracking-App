/**
 * @file RecipesPage.jsx
 * @description Admin page for recipes: build a material formula item by item
 * with a live percentage total, and save only when it reaches exactly 100%.
 * Editing existing recipes has no UI yet.
 */
import { useState } from 'react'
import { getAllRecipes, createRecipe } from '../api/recipes'
import { getAllMaterials } from '../api/materials'
import { getAllProducts } from '../api/products'
import { useApi } from '../hooks/useApi'
import { common } from '../styles/common'

/**
 * Renders the recipe list and the collapsible recipe-builder form.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/recipes" element={<RecipesPage />} />
 */
function RecipesPage() {
  // Three useApi instances instead of one combined fetch: each has its own
  // error message, and only the recipe list ever needs reloading (after create).
  const { data: recipes, loading: loadingRecipes, error: errorRecipes, reload: reloadRecipes } = useApi(getAllRecipes, 'Failed to load recipes')
  const { data: materials, loading: loadingMaterials, error: errorMaterials } = useApi(getAllMaterials, 'Failed to load materials')
  const { data: products, loading: loadingProducts, error: errorProducts } = useApi(getAllProducts, 'Failed to load products')
  const loading = loadingRecipes || loadingMaterials || loadingProducts
  const error = errorRecipes || errorMaterials || errorProducts

  // ─── FORM STATE ─────────────────────────────────────────────────────────────

  const [name, setName] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [notes, setNotes] = useState('')
  // Draft items carry materialName alongside materialId so the list can render
  // without a lookup into `materials` on every row.
  const [items, setItems] = useState([])
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [percentage, setPercentage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [actionError, setActionError] = useState(null)

  // ─── DRAFT ITEM MANAGEMENT ──────────────────────────────────────────────────

  /**
   * Adds the selected material + percentage to the draft formula. Silently
   * ignores duplicates — the dropdown already excludes added materials, so a
   * duplicate can only mean a stale click.
   *
   * @returns {void}
   *
   * @example
   * <button onClick={handleAddItem}>Add</button>
   */
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

  /**
   * Removes one material from the draft formula.
   *
   * @param {string} materialId - Material UUID of the row to remove.
   * @returns {void}
   *
   * @example
   * handleRemoveItem('a9d2…')
   */
  function handleRemoveItem(materialId) {
    setItems(items.filter((i) => i.materialId !== materialId))
  }

  /**
   * Sums the draft formula's percentages — drives both the colored total row
   * and the save button's enabled state.
   *
   * @returns {number} Sum of item percentages (can be fractional).
   *
   * @example
   * getTotalPercentage() // → 100
   */
  function getTotalPercentage() {
    return items.reduce((sum, item) => sum + item.percentage, 0)
  }

  function isTotalValid(total) {
    return Math.abs(total - 100) <= 0.001
  }

  /**
   * Creates the recipe from the draft, then resets the form and reloads the list.
   * Requires the item total to be within 0.001 of 100% (see isTotalValid).
   *
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * <button onClick={handleSubmit}>Save Recipe</button>
   */
  async function handleSubmit() {
    if (!name.trim() || !selectedProductId || items.length === 0) return
    if (!isTotalValid(getTotalPercentage())) return

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
      reloadRecipes()
    } catch (err) {
      setActionError('Failed to create recipe')
      console.error(err)
    }
  }

  // Already-added materials disappear from the dropdown so the unique
  // (recipe, material) constraint can't even be attempted from this UI.
  const availableMaterials = materials.filter(
    (m) => !items.some((i) => i.materialId === m.id)
  )

  const totalPercentage = getTotalPercentage()

  if (loading) return <p style={common.loadingText}>Loading...</p>
  // TODO: a mutation error replaces the WHOLE page — show a banner instead.
  if (error || actionError) return <p style={common.errorBox}>{error || actionError}</p>

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div style={common.container}>
      <div style={styles.header}>
        <h1 style={styles.heading}>Recipes</h1>
        <button
          style={common.button}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ New Recipe'}
        </button>
      </div>

      {showForm && (
        <div style={styles.form}>
          <input
            style={common.input}
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
            style={common.input}
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <label style={{ color: 'var(--color-text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <span style={isTotalValid(totalPercentage) ? styles.totalGood : styles.totalBad}>
                  {totalPercentage}%
                </span>
              </div>
            </div>
          )}

          <button
            style={{
              ...common.button,
              opacity: isTotalValid(totalPercentage) && name.trim() ? 1 : 0.4,
              cursor: isTotalValid(totalPercentage) && name.trim() ? 'pointer' : 'not-allowed'
            }}
            onClick={handleSubmit}
          >
            Save Recipe
          </button>
        </div>
      )}

      <div style={common.list}>
        {recipes.map((recipe) => (
          <div key={recipe.id} style={common.card}>
            <div style={common.cardLeft}>
              <span style={common.cardName}>{recipe.name}</span>
              <span style={common.cardType}>{recipe.product.name}</span>
              {recipe.notes && (
                <span style={common.cardType}>{recipe.notes}</span>
              )}
              {recipe.recipeItems && recipe.recipeItems.length > 0 && (
                <span style={common.cardType}>
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  heading: {
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: 'var(--color-surface-alt)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
  },
  sectionLabel: {
    color: 'var(--color-text-secondary)',
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
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  },
  percentageInput: {
    width: '60px',
    padding: '10px 8px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  },
  addItemButton: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--color-surface-alt)',
    color: 'var(--color-text-primary)',
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
    backgroundColor: 'var(--color-surface)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  itemName: {
    color: 'var(--color-text-primary)',
    fontSize: '13px',
  },
  itemRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  itemPercentage: {
    color: 'var(--color-accent-link)',
    fontSize: '13px',
  },
  removeButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-danger-strong)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderTop: '1px solid var(--color-border)',
    marginTop: '4px',
  },
  totalLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
  },
  totalGood: {
    color: 'var(--color-success-strong)',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  totalBad: {
    color: 'var(--color-danger-strong)',
    fontSize: '13px',
    fontWeight: 'bold',
  },
}

export default RecipesPage
