import { useState, useEffect } from 'react'
import { getRecipeById } from '../../api/recipes'

export default function Step4_Materials({ data, onNext }) {

const [recipeItems, setRecipeItems] = useState([])
const [values, setValues] = useState({})
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

const recipeId = data.recipeId
const initialMaterialUsages = data.materialUsages

useEffect(() => {
    async function loadRecipe() {
    try {
        const response = await getRecipeById(recipeId)
        const items = response.data.recipeItems
        setRecipeItems(items)

        // Initialize values object keyed by materialId
        const initialValues = {}
        items.forEach(item => {
        // If user came back to this step, preserve their previous answers
        const existing = initialMaterialUsages?.find(
            mu => mu.materialId === item.materialId
        )
        initialValues[item.materialId] = existing
            ? String(existing.quantityUsed)
            : ''
        })
        setValues(initialValues)

    } catch (err) {
        setError('Failed to load recipe materials')
        console.error(err)
    } finally {
        setLoading(false)
    }
    }
    loadRecipe()
}, [recipeId, initialMaterialUsages])

function handleChange(materialId, newValue) {
    setValues(prev => ({
    ...prev,
    [materialId]: newValue
    }))
}

function handleNext() {
    // Validate — every material must have a value
    const allFilled = recipeItems.every(item => {
    const val = values[item.materialId]
    return val !== undefined && val.trim() !== ''
    })

    if (!allFilled) {
    setError('Please fill in quantity used for every material.')
    return
    }

    // Validate — every value must be a positive number
    const allPositive = recipeItems.every(item => {
    const val = Number(values[item.materialId])
    return !isNaN(val) && val > 0
    })

    if (!allPositive) {
    setError('All quantities must be positive numbers.')
    return
    }

    setError(null)

    const materialUsages = recipeItems.map(item => ({
    materialId: item.materialId,
    quantityUsed: Number(values[item.materialId])
    }))

    onNext({ materialUsages })
}

if (loading) return <p style={styles.loadingText}>Loading materials...</p>

return (
    <div style={styles.container}>
    <h2 style={styles.heading}>Material Usage</h2>
    <p style={styles.subheading}>
        Enter the actual quantity used for each material in this run.
    </p>

    {error && <div style={styles.errorBox}>{error}</div>}

    {recipeItems.length === 0 ? (
        <div style={styles.emptyBox}>
        <p style={styles.emptyText}>No materials found in this recipe.</p>
        <p style={styles.emptySubtext}>
            Go to Admin → Recipes and add materials to this recipe.
        </p>
        </div>
    ) : (
        <div style={styles.list}>
        {recipeItems.map(item => (
            <div key={item.materialId} style={styles.field}>
            <label style={styles.label}>
                {item.material.name}
                <span style={styles.hint}>
                {' '}— {item.percentage}% planned
                {item.plannedQtyKg ? ` (${item.plannedQtyKg} kg)` : ''}
                </span>
            </label>
            <div style={styles.inputRow}>
                <input
                style={styles.input}
                type='number'
                value={values[item.materialId] ?? ''}
                onChange={e => handleChange(item.materialId, e.target.value)}
                placeholder='Enter kg used'
                min='0'
                step='0.1'
                />
                <span style={styles.unit}>kg</span>
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
    color: '#ffffff',
    marginBottom: '0.5rem',
},
subheading: {
    color: '#888',
    fontSize: '0.85rem',
    marginBottom: '1.5rem',
},
loadingText: {
    color: '#888',
    fontSize: '0.9rem',
},
errorBox: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
},
emptyBox: {
    padding: '2rem',
    textAlign: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #333',
    marginBottom: '1rem',
},
emptyText: {
    color: '#ffffff',
    marginBottom: '0.5rem',
},
emptySubtext: {
    color: '#888',
    fontSize: '0.85rem',
},
list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0rem',
    marginBottom: '1.5rem',
},
field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    marginBottom: '1rem',
},
label: {
    color: '#888',
    fontSize: '0.85rem',
},
hint: {
    color: '#555',
    fontSize: '0.8rem',
},
inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
},
input: {
    flex: 1,
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '0.95rem',
},
unit: {
    color: '#888',
    fontSize: '0.85rem',
    minWidth: '2rem',
},
nextButton: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    width: '100%',
},
}