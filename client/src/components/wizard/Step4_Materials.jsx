/**
 * @file Step4_Materials.jsx
 * @description Wizard step 4: record actual kg used per recipe material, with a
 * calculator that derives the amounts from (quantity × neto weight + scrap) ×
 * recipe percentages so the operator doesn't do mental math at the machine.
 * Bruto (per-unit gross weight) is recorded here too but never enters the
 * formula — packaging weight isn't made of raw material.
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
 * `materialUsages` and the calculator fields restore previous answers (or the
 * last-run prefill seeded by NewRunPage).
 * @param {string} props.runId - The created run's UUID (unused here, passed for step API symmetry).
 * @param {Function} props.onNext - Called with `{ materialUsages: [{ materialId, quantityUsed }],
 * quantityProduced, netWeightPerUnit, grossWeightPerUnit, scrapKg }` (weights are null when left blank).
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
const [grossWeightPerUnit, setGrossWeightPerUnit] = useState(String(data.grossWeightPerUnit ?? ''))
const [scrapKg, setScrapKg] = useState(String(data.scrapKg ?? ''))

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
 * total kg = quantity × neto weight per unit + scrap, split by each item's
 * share. Scrap counts because wasted material still came off the shelf.
 * Bruto is deliberately NOT a parameter — packaging isn't raw material.
 *
 * @param {string|number} qty - Produced quantity (pieces).
 * @param {string|number} nw - Neto weight of one piece in kg.
 * @param {string|number} scrap - Total scrap for the run in kg.
 * @returns {void} No-op while every input is empty/zero.
 *
 * @example
 * recalculateMaterials('500', '1.5', '10') // 760 kg total → 70% item gets "532"
 */
function recalculateMaterials(qty, nw, scrap) {
    const q = Number(qty) || 0
    const n = Number(nw) || 0
    const s = Number(scrap) || 0
    const totalKg = q * n + s
    if (!totalKg || recipeItems.length === 0) return
    const computed = {}
    recipeItems.forEach(item => {
    // toFixed(2) then parseFloat: round to 2 decimals for sane kg values but
    // strip trailing zeros ("525.00" → "525") so inputs look hand-entered.
    computed[item.materialId] = String(
        parseFloat((totalKg * item.percentage / 100).toFixed(2))
    )
    })
    setValues(computed)
}

/**
 * Re-derives all material amounts from the current calculator fields. The
 * only call site for recalculateMaterials — operators trigger this
 * explicitly via the "Recalculate" button so a hand-corrected material
 * quantity is never overwritten by a calculator keystroke.
 *
 * @returns {void}
 *
 * @example
 * <button onClick={handleRecalculate}>Recalculate</button>
 */
function handleRecalculate() {
    recalculateMaterials(quantityProduced, netWeightPerUnit, scrapKg)
}

/**
 * Updates produced quantity. Does not touch material amounts — see
 * handleRecalculate.
 *
 * @param {string} value - Raw input string from the quantity field.
 * @returns {void}
 *
 * @example
 * handleQuantityChange('500')
 */
function handleQuantityChange(value) {
    setQuantityProduced(value)
}

/**
 * Updates neto unit weight. Does not touch material amounts — see
 * handleRecalculate.
 *
 * @param {string} value - Raw input string from the neto-weight field.
 * @returns {void}
 *
 * @example
 * handleNetWeightChange('1.5')
 */
function handleNetWeightChange(value) {
    setNetWeightPerUnit(value)
}

/**
 * Updates total scrap. Does not touch material amounts — see
 * handleRecalculate.
 *
 * @param {string} value - Raw input string from the scrap field.
 * @returns {void}
 *
 * @example
 * handleScrapChange('10')
 */
function handleScrapChange(value) {
    setScrapKg(value)
}

/**
 * Updates bruto unit weight. Record-only: bruto includes packaging, which is
 * not raw material, so it never triggers a material recalculation.
 *
 * @param {string} value - Raw input string from the bruto-weight field.
 * @returns {void}
 *
 * @example
 * handleGrossWeightChange('1.6')
 */
function handleGrossWeightChange(value) {
    setGrossWeightPerUnit(value)
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
 * Requires a positive number for every material, then passes usage rows, the
 * produced quantity (which step 5 uses to prefill its first output), and the
 * run-level weights (null when blank, so step 5 can skip them cleanly and a
 * revisit restores them as empty inputs via String(null ?? '')).
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

    onNext({
    materialUsages,
    quantityProduced: Number(quantityProduced),
    netWeightPerUnit: netWeightPerUnit !== '' ? Number(netWeightPerUnit) : null,
    grossWeightPerUnit: grossWeightPerUnit !== '' ? Number(grossWeightPerUnit) : null,
    scrapKg: scrapKg !== '' ? Number(scrapKg) : null
    })
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
            <div style={styles.calcGrid}>
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
                <label style={common.label}>Neto Weight per Unit</label>
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
            <div style={styles.calcField}>
                <label style={common.label}>Bruto Weight per Unit</label>
                <div style={common.inputRow}>
                <input
                    style={styles.calcInput}
                    type='number'
                    value={grossWeightPerUnit}
                    onChange={e => handleGrossWeightChange(e.target.value)}
                    placeholder='e.g. 1.6'
                    min='0'
                    step='0.01'
                />
                <span style={common.unit}>kg</span>
                </div>
            </div>
            <div style={styles.calcField}>
                <label style={common.label}>Scrap (total)</label>
                <div style={common.inputRow}>
                <input
                    style={styles.calcInput}
                    type='number'
                    value={scrapKg}
                    onChange={e => handleScrapChange(e.target.value)}
                    placeholder='e.g. 10'
                    min='0'
                    step='0.1'
                />
                <span style={common.unit}>kg</span>
                </div>
            </div>
            </div>
            <button
            type='button'
            style={styles.recalcButton}
            onClick={handleRecalculate}
            >
            Recalculate
            </button>
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
calcGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
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
recalcButton: {
    marginTop: '1rem',
    width: '100%',
    padding: '0.65rem',
    backgroundColor: 'transparent',
    border: '1px dashed var(--color-text-muted)',
    color: 'var(--color-text-secondary)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
},
}
