/**
 * @file RecipeDetailPage.jsx
 * @description Per-recipe detail view: the read-only material formula
 * (ingredient name + percentage) plus link/unlink controls for the products
 * this recipe's formula is valid for. Mirrors MachineDetailPage.jsx's
 * link/unlink structure. Recipe/RecipeItem creation happens on RecipesPage —
 * this page does not build or edit the formula itself.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getRecipeById } from '../api/recipes'
import { getRecipeProducts, linkProductToRecipe, unlinkProductFromRecipe } from '../api/recipeProducts'
import { getAllProducts } from '../api/products'
import { common } from '../styles/common'

/**
 * Renders one recipe's ingredients (read-only) and linked products (with
 * link/unlink controls).
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/recipes/:recipeId" element={<RecipeDetailPage />} />
 */
function RecipeDetailPage() {
  const { recipeId } = useParams()
  const navigate = useNavigate()

  const [recipe, setRecipe] = useState(null)
  const [linkedProducts, setLinkedProducts] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  // Kept separate from loadError: a failed link/unlink (e.g. the "last
  // product" 409) shouldn't blank the whole page, just the Products section.
  const [actionError, setActionError] = useState(null)

  // ─── DATA LOADING ───────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [recipeRes, linkedProductsRes, allProductsRes] = await Promise.all([
          getRecipeById(recipeId),
          getRecipeProducts(recipeId),
          getAllProducts()
        ])
        setRecipe(recipeRes.data)
        setLinkedProducts(linkedProductsRes.data)
        setAllProducts(allProductsRes.data)
      } catch (err) {
        setLoadError('Failed to load recipe details')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [recipeId])

  // ─── LINK / UNLINK HANDLERS ─────────────────────────────────────────────────

  /**
   * Links the selected product to this recipe, then refetches only the
   * product links.
   *
   * @returns {Promise<void>} Resolves after the list refresh or after the error state is set.
   *
   * @example
   * <button onClick={handleLinkProduct}>Link</button>
   */
  async function handleLinkProduct() {
    if (!selectedProductId) return
    try {
      setActionError(null)
      await linkProductToRecipe({ recipeId, productId: selectedProductId })
      setSelectedProductId('')
      const res = await getRecipeProducts(recipeId)
      setLinkedProducts(res.data)
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to link product')
      console.error(err)
    }
  }

  /**
   * Unlinks a product from this recipe. The server rejects this with 409 when
   * it would leave the recipe with zero linked products.
   *
   * @param {string} linkId - RecipeProduct link UUID.
   * @returns {Promise<void>} Resolves after the list refresh or after the error state is set.
   *
   * @example
   * handleUnlinkProduct('f0a1…')
   */
  async function handleUnlinkProduct(linkId) {
    try {
      setActionError(null)
      await unlinkProductFromRecipe(linkId)
      const res = await getRecipeProducts(recipeId)
      setLinkedProducts(res.data)
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to unlink product')
      console.error(err)
    }
  }

  // Dropdown offers only what is NOT yet linked — linking twice would just
  // bounce off the unique constraint with an error.
  const availableProducts = allProducts.filter(
    (p) => !linkedProducts.some((lp) => lp.productId === p.id)
  )

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (loadError) return <p style={{ padding: '16px', color: 'var(--color-danger)' }}>{loadError}</p>

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div style={common.container}>
      <button style={styles.backButton} onClick={() => navigate('/recipes')}>
        ← Back
      </button>

      <h1 style={styles.heading}>{recipe.name}</h1>
      {recipe.notes && <p style={styles.subtext}>{recipe.notes}</p>}

      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>Ingredients</h2>

        <div style={common.list}>
          {recipe.recipeItems.map((item) => (
            <div key={item.id} style={common.card}>
              <div style={common.cardLeft}>
                <span style={common.cardName}>{item.material.name}</span>
              </div>
              <span style={styles.itemPercentage}>{item.percentage}%</span>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>Linked products</h2>

        {actionError && <p style={styles.actionErrorText}>{actionError}</p>}

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
              <div style={styles.linkedProductRight}>
                {lp.isDefault && <span style={styles.defaultBadge}>Default</span>}
                <button
                  style={styles.unlinkButton}
                  onClick={() => handleUnlinkProduct(lp.id)}
                >
                  Remove
                </button>
              </div>
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
    marginBottom: '4px',
  },
  section: {
    marginTop: '24px',
    marginBottom: '32px',
  },
  sectionHeading: {
    color: 'var(--color-text-primary)',
    fontSize: '16px',
    marginBottom: '12px',
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: '8px',
  },
  itemPercentage: {
    color: 'var(--color-accent-link)',
    fontSize: '13px',
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
  linkedProductRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  defaultBadge: {
    fontSize: '12px',
    color: 'var(--color-accent-link)',
    backgroundColor: 'var(--color-surface-alt)',
    padding: '4px 8px',
    borderRadius: '12px',
  },
  empty: {
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontStyle: 'italic',
  },
  actionErrorText: {
    color: 'var(--color-danger-strong)',
    fontSize: '13px',
    marginBottom: '8px',
  },
}

export default RecipeDetailPage
