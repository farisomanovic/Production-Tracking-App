/**
 * @file RecipesPage.jsx
 * @description Admin page for recipes: build a material formula item by item
 * with a live percentage total, and save only when it reaches exactly 100%.
 * Also handles activate/deactivate (soft delete). Editing name/composition of
 * an existing recipe has no UI yet.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllRecipes, createRecipe, updateRecipe } from '../api/recipes'
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
  const navigate = useNavigate()
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
  // A recipe can now be linked to several products at creation time, so this
  // is a set of ids (checkbox list) rather than one dropdown value.
  const [selectedProductIds, setSelectedProductIds] = useState([])
  const [percentage, setPercentage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [actionError, setActionError] = useState(null)

  /**
   * Toggles one product in/out of the draft's linked-products set.
   *
   * @param {string} productId - Product UUID.
   * @returns {void}
   *
   * @example
   * handleToggleProduct('c771…')
   */
  function handleToggleProduct(productId) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    )
  }

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
    if (!name.trim() || selectedProductIds.length === 0 || items.length === 0) return
    if (!isTotalValid(getTotalPercentage())) return

    try {
      await createRecipe({
        name,
        isDefault,
        ...(notes.trim() && { notes }),
        productIds: selectedProductIds,
        items: items.map((i) => ({
          materialId: i.materialId,
          percentage: i.percentage
        }))
      })
      setName('')
      setNotes('')
      setIsDefault(false)
      setItems([])
      setSelectedProductIds([])
      setShowForm(false)
      reloadRecipes()
    } catch (err) {
      setActionError('Failed to create recipe')
      console.error(err)
    }
  }

  /**
   * Soft-deletes a recipe (active: false) — hides it from the wizard's Step 2
   * while keeping it (and any run history referencing it) intact.
   *
   * @param {string} id - Recipe UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleDeactivate('d1e2…')
   */
  async function handleDeactivate(id) {
    try {
      await updateRecipe(id, { active: false })
      reloadRecipes()
    } catch (err) {
      setActionError('Failed to deactivate recipe')
      console.error(err)
    }
  }

  /**
   * Reactivates a soft-deleted recipe so the wizard can offer it again.
   *
   * @param {string} id - Recipe UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleActivate('d1e2…')
   */
  async function handleActivate(id) {
    try {
      await updateRecipe(id, { active: true })
      reloadRecipes()
    } catch (err) {
      setActionError('Failed to activate recipe')
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
          <p style={styles.sectionLabel}>Linked products</p>
          <div style={styles.productChecklist}>
            {products.map((p) => (
              <label key={p.id} style={styles.productCheckboxRow}>
                <input
                  type="checkbox"
                  checked={selectedProductIds.includes(p.id)}
                  onChange={() => handleToggleProduct(p.id)}
                />
                {p.name} {p.code ? `(${p.code})` : ''}
              </label>
            ))}
          </div>
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
              onWheel={(e) => e.target.blur()}
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
              opacity: isTotalValid(totalPercentage) && name.trim() && selectedProductIds.length > 0 ? 1 : 0.4,
              cursor: isTotalValid(totalPercentage) && name.trim() && selectedProductIds.length > 0 ? 'pointer' : 'not-allowed'
            }}
            onClick={handleSubmit}
          >
            Save Recipe
          </button>
        </div>
      )}

      <div style={common.list}>
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            style={{ ...common.card, cursor: 'pointer' }}
            onClick={() => navigate(`/recipes/${recipe.id}`)}
          >
            <div style={common.cardLeft}>
              <span style={common.cardName}>{recipe.name}</span>
              <span style={common.cardType}>
                {recipe.products.map((link) => link.product.name).join(', ')}
              </span>
              {recipe.notes && (
                <span style={common.cardType}>{recipe.notes}</span>
              )}
              {recipe.recipeItems && recipe.recipeItems.length > 0 && (
                <span style={common.cardType}>
                  {recipe.recipeItems.length} ingredient{recipe.recipeItems.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={styles.cardRight}>
              <span style={recipe.active ? styles.badgeActive : styles.badgeInactive}>
                {recipe.active ? 'Active' : 'Inactive'}
              </span>
              {recipe.active ? (
                <button
                  style={styles.deactivateButton}
                  onClick={(e) => { e.stopPropagation(); handleDeactivate(recipe.id) }}
                >
                  Deactivate
                </button>
              ) : (
                <button
                  style={styles.activateButton}
                  onClick={(e) => { e.stopPropagation(); handleActivate(recipe.id) }}
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
  productChecklist: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '160px',
    overflowY: 'auto',
    padding: '8px 12px',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
  },
  productCheckboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
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
  cardRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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

export default RecipesPage
