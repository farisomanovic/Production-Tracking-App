/**
 * @file ProductDetailPage.jsx
 * @description Per-product detail view: the recipes linked to this product,
 * with a control to see and change which one is the default (the one the
 * wizard preselects). Mirrors RecipeDetailPage.jsx's structure, but in the
 * reverse direction and read-mostly — linking/unlinking a recipe to this
 * product happens on RecipeDetailPage, not here.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProductById } from '../api/products'
import { getProductRecipes, setRecipeProductDefault } from '../api/recipeProducts'
import { common } from '../styles/common'

/**
 * Renders one product's header and its linked recipes, each with an
 * Active/Inactive badge and either a "Default" badge or a "Set as default" button.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/products/:productId" element={<ProductDetailPage />} />
 */
function ProductDetailPage() {
  const { productId } = useParams()
  const navigate = useNavigate()

  const [product, setProduct] = useState(null)
  const [recipeLinks, setRecipeLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  // Kept separate from loadError: a failed "set as default" shouldn't blank
  // the whole page, just the recipes section.
  const [actionError, setActionError] = useState(null)

  // ─── DATA LOADING ───────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [productRes, recipeLinksRes] = await Promise.all([
          getProductById(productId),
          getProductRecipes(productId)
        ])
        setProduct(productRes.data)
        setRecipeLinks(recipeLinksRes.data)
      } catch (err) {
        setLoadError('Failed to load product details')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [productId])

  /**
   * Sets one linked recipe as this product's default, then refetches only
   * the recipe links.
   *
   * @param {string} linkId - RecipeProduct link UUID.
   * @returns {Promise<void>} Resolves after the list refresh or after the error state is set.
   *
   * @example
   * handleSetDefault('f0a1…')
   */
  async function handleSetDefault(linkId) {
    try {
      setActionError(null)
      await setRecipeProductDefault(linkId, true)
      const res = await getProductRecipes(productId)
      setRecipeLinks(res.data)
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to set default recipe')
      console.error(err)
    }
  }

  if (loading) return <p style={{ padding: '16px' }}>Loading...</p>
  if (loadError) return <p style={{ padding: '16px', color: 'var(--color-danger)' }}>{loadError}</p>

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div style={common.container}>
      <button style={styles.backButton} onClick={() => navigate('/products')}>
        ← Back
      </button>

      <h1 style={styles.heading}>{product.name}</h1>
      <p style={styles.subtext}>{product.code} — {product.unit}</p>

      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>Recipes</h2>

        {actionError && <p style={styles.actionErrorText}>{actionError}</p>}

        <div style={common.list}>
          {recipeLinks.length === 0 && (
            <p style={styles.empty}>No recipes linked to this product yet</p>
          )}
          {recipeLinks.map((link) => (
            <div
              key={link.id}
              style={{ ...common.card, cursor: 'pointer' }}
              onClick={() => navigate(`/recipes/${link.recipeId}`)}
            >
              <div style={common.cardLeft}>
                <span style={common.cardName}>{link.recipe.name}</span>
                {link.recipe.recipeItems && link.recipe.recipeItems.length > 0 && (
                  <span style={common.cardType}>
                    {link.recipe.recipeItems.length} ingredient{link.recipe.recipeItems.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={styles.cardRight}>
                <span style={link.recipe.active ? styles.badgeActive : styles.badgeInactive}>
                  {link.recipe.active ? 'Active' : 'Inactive'}
                </span>
                {link.isDefault ? (
                  <span style={styles.defaultBadge}>Default</span>
                ) : link.recipe.active ? (
                  <button
                    style={styles.setDefaultButton}
                    onClick={(e) => { e.stopPropagation(); handleSetDefault(link.id) }}
                  >
                    Set as default
                  </button>
                ) : null}
                <span style={common.arrow}>›</span>
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
  defaultBadge: {
    fontSize: '12px',
    color: 'var(--color-accent-link)',
    backgroundColor: 'var(--color-surface-alt)',
    padding: '4px 8px',
    borderRadius: '12px',
  },
  setDefaultButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'var(--color-surface-alt)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    cursor: 'pointer',
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

export default ProductDetailPage
