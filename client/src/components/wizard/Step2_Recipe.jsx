/**
 * Renders step 2 of the production-run wizard.
 * Loads and selects recipes available for the chosen product.
 * Advances run creation once the production formula is selected.
 */
import { useState, useEffect } from 'react'
import { getRecipesByProduct } from '../../api/recipes'

export default function Step2_Recipe({ data, onNext }) {

const [recipes, setRecipes] = useState([])
const [recipeId, setRecipeId] = useState(data.recipeId || '')
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

const productId = data.productId
const initialRecipeId = data.recipeId

useEffect(() => {
async function loadRecipes() {
    try {
    const response = await getRecipesByProduct(productId)
    const fetchedRecipes = response.data
    setRecipes(fetchedRecipes)

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

function handleNext() {
    if (!recipeId) {
    setError('Please select a recipe before continuing.')
    return
    }
    setError(null)
    onNext({ recipeId })
}

if (loading) return <p style={styles.loadingText}>Loading recipes...</p>

return (
    <div style={styles.container}>
    <h2 style={styles.heading}>Select Recipe</h2>

    {error && <div style={styles.errorBox}>{error}</div>}

    {recipes.length === 0 ? (
        <div style={styles.emptyBox}>
        <p style={styles.emptyText}>No recipes found for this product.</p>
        <p style={styles.emptySubtext}>Go to Admin → Recipes and create one first.</p>
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
            {/* Recipe header */}
            <div style={styles.cardHeader}>
                <span style={styles.recipeName}>{recipe.name}</span>
                {recipe.isDefault && (
                <span style={styles.defaultBadge}>Default</span>
                )}
            </div>

            {/* Recipe items */}
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

    <button style={styles.nextButton} onClick={handleNext}>
        Next →
    </button>
    </div>
)
}

const styles = {
container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0rem',
},
heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '1.5rem',
},
loadingText: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.9rem',
},
errorBox: {
    backgroundColor: 'var(--color-danger-soft)',
    color: 'var(--color-danger)',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
},
emptyBox: {
    padding: '2rem',
    textAlign: 'center',
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    marginBottom: '1rem',
},
emptyText: {
    color: 'var(--color-text-primary)',
    marginBottom: '0.5rem',
},
emptySubtext: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
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
nextButton: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    width: '100%',
},
}

