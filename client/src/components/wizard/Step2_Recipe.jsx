/**
 * @file Step2_Recipe.jsx
 * @description Wizard step 2: pick the material formula for the chosen product.
 * This is the last step before the run is written to the database — the parent
 * calls createRun immediately after this step's onNext.
 */
import { useState, useEffect } from 'react'
import { getRecipesByProduct } from '../../api/recipes'
import { common } from '../../styles/common'

/**
 * Renders the product's recipes as selectable cards, preselecting the default.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.data - Accumulated wizard formData; `productId` drives the fetch,
 * `recipeId` restores a previous selection.
 * @param {Function} props.onNext - Called with `{ recipeId }`; the parent then creates the run.
 * @param {boolean} props.isSubmitting - True while the parent's createRun call is in flight;
 * disables Next so a double-click can't fire two run-creation requests.
 * @returns {JSX.Element}
 *
 * @example
 * <Step2_Recipe data={formData} onNext={handleStepNext} isSubmitting={isSubmitting} />
 */
export default function Step2_Recipe({ data, onNext, isSubmitting }) {

const [recipes, setRecipes] = useState([])
const [recipeId, setRecipeId] = useState(data.recipeId || '')
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

// Pulled into plain constants so the effect can depend on stable primitives
// instead of the whole data object (which changes identity every merge).
const productId = data.productId
const initialRecipeId = data.recipeId

useEffect(() => {
async function loadRecipes() {
    try {
    const response = await getRecipesByProduct(productId)
    const fetchedRecipes = response.data
    setRecipes(fetchedRecipes)

    // Preselect the default only when the user hasn't chosen before —
    // returning to this step must not overwrite an explicit choice.
    if (!initialRecipeId) {
        const defaultRecipe = fetchedRecipes.find(r => r.isDefault === true)
        if (defaultRecipe) {
        setRecipeId(defaultRecipe.id)
        }
    }
    } catch (err) {
    setError('Failed to load recipes')
    console.error(err)
    } finally {
    setLoading(false)
    }
}
loadRecipes()
}, [productId, initialRecipeId])

/**
 * Requires a selection, then hands the chosen recipe id up to the wizard.
 *
 * @returns {void} Calls onNext on success; sets an error message otherwise.
 *
 * @example
 * <button onClick={handleNext}>Next →</button>
 */
function handleNext() {
    if (isSubmitting) return

    if (!recipeId) {
    setError('Please select a recipe before continuing.')
    return
    }
    setError(null)
    onNext({ recipeId })
}

if (loading) return <p style={common.loadingText}>Loading recipes...</p>

return (
    <div style={common.wizardContainer}>
    <h2 style={styles.heading}>Select Recipe</h2>

    {error && <div style={common.errorBox}>{error}</div>}

    {recipes.length === 0 ? (
        <div style={common.emptyBox}>
        <p style={common.emptyText}>No recipes found for this product.</p>
        <p style={common.emptySubtext}>Go to Admin → Recipes and create one first.</p>
        </div>
    ) : (
        <div style={styles.list}>
        {recipes.map(recipe => (
            <div
            key={recipe.id}
            style={{
                ...styles.card,
                ...(recipeId === recipe.id ? styles.cardSelected : {})
            }}
            onClick={() => setRecipeId(recipe.id)}
            >
            <div style={styles.cardHeader}>
                <span style={styles.recipeName}>{recipe.name}</span>
                {recipe.isDefault && (
                <span style={styles.defaultBadge}>Default</span>
                )}
            </div>

            {/* Full material breakdown on the card so the operator can verify
                the formula without leaving the wizard. */}
            <div style={styles.itemList}>
                {recipe.recipeItems.map(item => (
                <div key={item.id} style={styles.itemRow}>
                    <span style={styles.itemName}>{item.material.name}</span>
                    <span style={styles.itemPercent}>{item.percentage}%</span>
                </div>
                ))}
            </div>

            </div>
        ))}
        </div>
    )}

    <button
        style={{ ...common.nextButton, opacity: isSubmitting ? 0.6 : 1 }}
        onClick={handleNext}
        disabled={isSubmitting}
    >
        {isSubmitting ? 'Creating Run...' : 'Next →'}
    </button>
    </div>
)
}

const styles = {
heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '1.5rem',
},
list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1.5rem',
},
card: {
    padding: '1rem',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '2px solid var(--color-border)',
    cursor: 'pointer',
},
cardSelected: {
    border: '2px solid var(--color-accent)',
    backgroundColor: 'var(--color-selected-surface)',
},
cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
},
recipeName: {
    color: 'var(--color-text-primary)',
    fontSize: '1rem',
    fontWeight: 'bold',
},
defaultBadge: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontSize: '0.7rem',
    padding: '0.2rem 0.5rem',
    borderRadius: '999px',
},
itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
},
itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
},
itemName: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
},
itemPercent: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
},
}
