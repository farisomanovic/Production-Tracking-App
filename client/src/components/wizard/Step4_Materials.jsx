/**
 * Renders step 4 of the production-run wizard.
 * Collects actual material usage against the selected recipe composition.
 * Carries usage values forward for transactional run completion.
 */
import { useState, useEffect } from 'react'
import { getRecipeById } from '../../api/recipes'
import { common } from '../../styles/common'

export default function Step4_Materials({ data, onNext }) {

const [recipeItems, setRecipeItems] = useState([])
const [values, setValues] = useState({})
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)
const [quantityProduced, setQuantityProduced] = useState(String(data.quantityProduced ?? ''))
const [netWeightPerUnit, setNetWeightPerUnit] = useState(String(data.netWeightPerUnit ?? ''))

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

function recalculateMaterials(qty, nw) {
    const q = Number(qty)
    const n = Number(nw)
    if (!q || !n || recipeItems.length === 0) return
    const totalKg = q * n
    const computed = {}
    recipeItems.forEach(item => {
    computed[item.materialId] = String(
        parseFloat((totalKg * item.percentage / 100).toFixed(2))
    )
    })
    setValues(computed)
}

function handleQuantityChange(value) {
    setQuantityProduced(value)
    recalculateMaterials(value, netWeightPerUnit)
}

function handleNetWeightChange(value) {
    setNetWeightPerUnit(value)
    recalculateMaterials(quantityProduced, value)
}

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

    onNext({ materialUsages, quantityProduced: Number(quantityProduced) })
}

if (loading) return <p style={common.loadingText}>Loading materials...</p>

return (
    <div style={common.wizardContainer}>
    <h2 style={styles.heading}>Material Usage</h2>
    <p style={common.subheading}>
        Enter the actual quantity used for each material in this run.
    </p>

    {error && <div style={common.errorBox}>{error}</div>}

    {recipeItems.length === 0 ? (
        <div style={common.emptyBox}>
        <p style={common.emptyText}>No materials found in this recipe.</p>
        <p style={common.emptySubtext}>
            Go to Admin → Recipes and add materials to this recipe.
        </p>
        </div>
    ) : (
        <>
        <div style={styles.calculator}>
            <p style={styles.calcLabel}>Quick Calculator</p>
            <div style={styles.calcRow}>
            <div style={styles.calcField}>
                <label style={common.label}>Quantity Produced</label>
                <div style={common.inputRow}>
                <input
                    style={styles.calcInput}
                    type='number'
                    value={quantityProduced}
                    onChange={e => handleQuantityChange(e.target.value)}
                    placeholder='e.g. 500'
                    min='0'
                    step='1'
                />
                <span style={common.unit}>pcs</span>
                </div>
            </div>
            <div style={styles.calcField}>
                <label style={common.label}>Net Weight per Unit</label>
                <div style={common.inputRow}>
                <input
                    style={styles.calcInput}
                    type='number'
                    value={netWeightPerUnit}
                    onChange={e => handleNetWeightChange(e.target.value)}
                    placeholder='e.g. 1.5'
                    min='0'
                    step='0.01'
                />
                <span style={common.unit}>kg</span>
                </div>
            </div>
            </div>
        </div>

        <div style={styles.list}>
            {recipeItems.map(item => (
            <div key={item.materialId} style={common.field}>
                <label style={common.label}>
                {item.material.name}
                <span style={styles.hint}>
                    {' '}— {item.percentage}% planned
                    {item.plannedQtyKg ? ` (${item.plannedQtyKg} kg)` : ''}
                </span>
                </label>
                <div style={common.inputRow}>
                <input
                    style={styles.input}
                    type='number'
                    value={values[item.materialId] ?? ''}
                    onChange={e => handleChange(item.materialId, e.target.value)}
                    placeholder='Enter kg used'
                    min='0'
                    step='0.1'
                />
                <span style={common.unit}>kg</span>
                </div>
            </div>
            ))}
        </div>
        </>
    )}

    <button style={common.nextButton} onClick={handleNext}>
        Next →
    </button>
    </div>
)
}

const styles = {
heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '0.5rem',
},
list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0rem',
    marginBottom: '1.5rem',
},
hint: {
    color: 'var(--color-text-muted)',
    fontSize: '0.8rem',
},
input: {
    ...common.wizardInput,
    flex: 1,
},
calculator: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
},
calcLabel: {
    color: 'var(--color-text-muted)',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
},
calcRow: {
    display: 'flex',
    gap: '1rem',
},
calcField: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
},
calcInput: {
    ...common.wizardInput,
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
},
}

