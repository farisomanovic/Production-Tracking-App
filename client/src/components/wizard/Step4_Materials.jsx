/**
 * @file Step4_Materials.jsx
 * @description Wizard step 4: record actual kg used per recipe material, with a
 * calculator that derives the amounts from produced quantity × unit weight ×
 * recipe percentages so the operator doesn't do mental math at the machine.
 */
import { useState, useEffect } from 'react'
import { getRecipeById } from '../../api/recipes'
import { common } from '../../styles/common'

/**
 * Renders the material usage inputs plus the quick calculator.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.data - Accumulated wizard formData; `recipeId` drives the fetch,
 * `materialUsages` restores previous answers.
 * @param {string} props.runId - The created run's UUID (unused here, passed for step API symmetry).
 * @param {Function} props.onNext - Called with `{ materialUsages: [{ materialId, quantityUsed }], quantityProduced }`.
 * @returns {JSX.Element}
 *
 * @example
 * <Step4_Materials data={formData} runId={runId} onNext={handleStepNext} />
 */
export default function Step4_Materials({ data, onNext }) {

const [recipeItems, setRecipeItems] = useState([])
// Keyed by materialId for O(1) writes from each input's onChange.
const [values, setValues] = useState({})
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)
// String(… ?? '') so a real 0 from a previous visit survives (0 || '' would
// drop it) while undefined still becomes an empty input.
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

        // Pre-key every material so all inputs are controlled from first render.
        const initialValues = {}
        items.forEach(item => {
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

// ─── CALCULATOR ──────────────────────────────────────────────────────────────

/**
 * Fills every material input from total weight × recipe percentage:
 * total kg = quantity × net weight per unit, split by each item's share.
 *
 * @param {string|number} qty - Produced quantity (pieces).
 * @param {string|number} nw - Net weight of one piece in kg.
 * @returns {void} No-op until both inputs are non-zero numbers.
 *
 * @example
 * recalculateMaterials('500', '1.5') // 750 kg total → 70% item gets "525"
 */
function recalculateMaterials(qty, nw) {
    const q = Number(qty)
    const n = Number(nw)
    if (!q || !n || recipeItems.length === 0) return
    const totalKg = q * n
    const computed = {}
    recipeItems.forEach(item => {
    // toFixed(2) then parseFloat: round to 2 decimals for sane kg values but
    // strip trailing zeros ("525.00" → "525") so inputs look hand-entered.
    computed[item.materialId] = String(
        parseFloat((totalKg * item.percentage / 100).toFixed(2))
    )
    })
    // TODO: this REPLACES all material inputs, including ones the operator
    // already corrected by hand — manual edits are lost on the next calculator
    // keystroke. Consider only filling untouched fields.
    setValues(computed)
}

/**
 * Updates produced quantity and re-derives all material amounts.
 *
 * @param {string} value - Raw input string from the quantity field.
 * @returns {void}
 *
 * @example
 * handleQuantityChange('500')
 */
function handleQuantityChange(value) {
    setQuantityProduced(value)
    recalculateMaterials(value, netWeightPerUnit)
}

/**
 * Updates unit weight and re-derives all material amounts.
 *
 * @param {string} value - Raw input string from the net-weight field.
 * @returns {void}
 *
 * @example
 * handleNetWeightChange('1.5')
 */
function handleNetWeightChange(value) {
    setNetWeightPerUnit(value)
    recalculateMaterials(quantityProduced, value)
}

/**
 * Stores one material's raw kg input under its materialId.
 *
 * @param {string} materialId - Material UUID identifying which input changed.
 * @param {string} newValue - Raw input value; converted to Number only on submit.
 * @returns {void}
 *
 * @example
 * handleChange('a9d2…', '480')
 */
function handleChange(materialId, newValue) {
    setValues(prev => ({
    ...prev,
    [materialId]: newValue
    }))
}

// ─── VALIDATION & SUBMIT ─────────────────────────────────────────────────────

/**
 * Requires a positive number for every material, then passes usage rows and
 * the produced quantity (which step 5 uses to prefill its first output).
 *
 * @returns {void} Calls onNext on success; sets an error message otherwise.
 *
 * @example
 * <button onClick={handleNext}>Next →</button>
 */
function handleNext() {
    const allFilled = recipeItems.every(item => {
    const val = values[item.materialId]
    return val !== undefined && val.trim() !== ''
    })

    if (!allFilled) {
    setError('Please fill in quantity used for every material.')
    return
    }

    // Positive, not just numeric: zero or negative usage would corrupt the
    // stock decrement on completion (negative would INCREASE stock).
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

// ─── RENDER ──────────────────────────────────────────────────────────────────

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
