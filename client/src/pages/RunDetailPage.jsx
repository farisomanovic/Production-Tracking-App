/**
 * @file RunDetailPage.jsx
 * @description One run's page in both of its lives: a completion form while the
 * run is in_progress (so a run can be finished outside the original wizard
 * session), and a read-only record with delete once completed.
 * TODO: RunCompleteView duplicates wizard Steps 3–5 almost verbatim — a bug fix
 * in one won't reach the other. Extract a shared RunCompletionForm.
 * todo.md Group 7 #3.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getRunById, completeRun, getAllRuns, deleteRun } from '../api/productionRuns'
import { getMachineParameters } from '../api/machineParameters'
import { getMachineProducts } from '../api/machineProducts'
import { buildEndTimestamp } from '../lib/dates'
import { common } from '../styles/common'

/**
 * Loads the run and dispatches to the completion form or the read-only view
 * based on its status.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/runs/:id" element={<RunDetailPage />} />
 */
export default function RunDetailPage() {

const { id } = useParams()
const navigate = useNavigate()

const [run, setRun] = useState(null)
const [machineParameters, setMachineParameters] = useState([])
const [products, setProducts] = useState([])
const [lastRunParameterValues, setLastRunParameterValues] = useState([])
const [lastRunMaterialUsages, setLastRunMaterialUsages] = useState([])
const [lastRunQuantityProduced, setLastRunQuantityProduced] = useState('')
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

// ─── DATA LOADING ────────────────────────────────────────────────────────────

useEffect(() => {
    async function loadRun() {
    try {
        const runRes = await getRunById(id)
        const fetchedRun = runRes.data
        setRun(fetchedRun)

        // Form config (machine parameters + allowed products) is only needed
        // when the completion form will render — completed runs skip 3 requests.
        if (fetchedRun.status === 'in_progress') {
        const [paramsRes, productsRes] = await Promise.all([
            getMachineParameters(fetchedRun.machineId),
            getMachineProducts(fetchedRun.machineId)
        ])
        setMachineParameters(paramsRes.data)
        setProducts(productsRes.data.map(item => item.product))

        // Same prefill idea as the wizard: machine settings rarely change
        // between runs of the same product, so the last completed run's values
        // are the best starting guess.
        try {
            const lastRunRes = await getAllRuns({
                machineId: fetchedRun.machineId,
                productId: fetchedRun.productId,
                status: 'completed',
                limit: 1
            })
            // TODO: same-day runs tie on the API's date-only sort, so this may
            // not truly be the LATEST run. todo.md Group 4 #4.
            const lastRunSummary = lastRunRes.data[0]
            if (lastRunSummary) {
                const lastRunDetail = await getRunById(lastRunSummary.id)
                const lastRun = lastRunDetail.data
                if (lastRun.runParameterValues && lastRun.runParameterValues.length > 0) {
                    setLastRunParameterValues(lastRun.runParameterValues.map(pv => ({
                        machineParameterId: pv.machineParameterId,
                        value: pv.value
                    })))
                }
                if (lastRun.materialUsages && lastRun.materialUsages.length > 0) {
                    setLastRunMaterialUsages(lastRun.materialUsages.map(mu => ({
                        materialId: mu.materialId,
                        quantityUsed: mu.quantityUsed
                    })))
                }
                if (lastRun.runOutputs && lastRun.runOutputs.length > 0) {
                    setLastRunQuantityProduced(String(lastRun.runOutputs[0].quantityProduced))
                }
            }
        } catch (err) {
            // Own try/catch: prefill is a convenience and its failure must not
            // block the operator from completing the run.
            console.error('Could not fetch last run for pre-fill:', err)
        }
    }

    } catch (err) {
        setError('Failed to load production run')
        console.error(err)
    } finally {
        setLoading(false)
    }
    }
    loadRun()
}, [id])

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Formats the run's production date for display.
 *
 * @param {string} dateStr - ISO date string from the API; may be null.
 * @returns {string} e.g. "04 Jul 2026", or "—" so missing data keeps the row layout.
 *
 * @example
 * formatDate('2026-07-04T00:00:00.000Z') // → "04 Jul 2026"
 */
function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
    })
}

/**
 * Deletes this run (server restores its consumed stock) and returns to the list.
 *
 * @returns {Promise<void>} Resolves after navigation or after the error state is set.
 *
 * @example
 * <RunDetailView onDelete={handleDelete} />
 */
async function handleDelete() {
    try {
        await deleteRun(run.id)
        navigate('/runs')
    } catch (err) {
        console.error(err)
        setError('Failed to delete production run')
    }
}

/**
 * Formats a timestamp as a short clock time for the Times card.
 *
 * @param {string} dateStr - ISO timestamp from the API; null for never-set optional times.
 * @returns {string} e.g. "08:30 AM", or "—" for missing values.
 *
 * @example
 * formatTime('2026-07-04T08:30:00.000') // → "08:30 AM"
 */
function formatTime(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    })
}

/**
 * Formats the run's end time, marking ends that land on a later calendar day
 * than the start — otherwise an overnight run's "02:00 AM" under the card's
 * single Date row reads as if it happened on the start date.
 *
 * @param {string} startStr - The run's startTime ISO timestamp.
 * @param {string} endStr - The run's endTime ISO timestamp; null while in progress.
 * @returns {string} e.g. "02:00 AM (+1 day)", or "—" for missing values.
 *
 * @example
 * formatEndTime('2026-07-07T22:00:00.000', '2026-07-08T02:00:00.000') // → "02:00 AM (+1 day)"
 */
function formatEndTime(startStr, endStr) {
    if (!endStr) return '—'
    const start = new Date(startStr)
    const end = new Date(endStr)
    // Compare local calendar days, not raw timestamps: 23:00 → 01:00 is only
    // 2h apart but one day apart on the calendar, which is what the marker means.
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    const days = Math.round((endDay - startDay) / 86400000)
    if (days <= 0) return formatTime(endStr)
    return `${formatTime(endStr)} (+${days} day${days > 1 ? 's' : ''})`
}

/**
 * Formats the elapsed time between start and end as "Xh Ym". Legacy rows
 * stored before the overnight endTime fix can hold end-before-start values —
 * those show a minus sign rather than being hidden, so bad data stays visible.
 *
 * @param {string} startStr - The run's startTime ISO timestamp.
 * @param {string} endStr - The run's endTime ISO timestamp; null while in progress.
 * @returns {string} e.g. "4h 0m", or "—" when either timestamp is missing.
 *
 * @example
 * formatDuration('2026-07-07T22:00:00.000', '2026-07-08T02:00:00.000') // → "4h 0m"
 */
function formatDuration(startStr, endStr) {
    if (!startStr || !endStr) return '—'
    const totalMinutes = Math.round((new Date(endStr) - new Date(startStr)) / 60000)
    const sign = totalMinutes < 0 ? '-' : ''
    const abs = Math.abs(totalMinutes)
    return `${sign}${Math.floor(abs / 60)}h ${abs % 60}m`
}

if (loading) return <p style={styles.loadingText}>Loading run...</p>
if (error) return <p style={styles.errorText}>{error}</p>
if (!run) return <p style={styles.errorText}>Run not found.</p>

return (
    <div style={styles.container}>

    <button style={styles.backButton} onClick={() => navigate('/runs')}>
        ← Back to Runs
    </button>

    <div style={styles.titleRow}>
        <h1 style={styles.heading}>{run.machine.name}</h1>
        <span style={run.status === 'in_progress' ? styles.badgeLive : styles.badgeDone}>
        {run.status === 'in_progress' ? '● Live' : '✓ Completed'}
        </span>
    </div>

    {run.status === 'in_progress' ? (
        <RunCompleteView
            run={run}
            machineParameters={machineParameters}
            products={products}
            lastRunParameterValues={lastRunParameterValues}
            lastRunMaterialUsages={lastRunMaterialUsages}
            lastRunQuantityProduced={lastRunQuantityProduced}
            onCompleted={() => navigate('/runs')}
            onDelete={handleDelete}
        />
    ) : (
        <RunDetailView
        run={run}
        formatDate={formatDate}
        formatTime={formatTime}
        formatEndTime={formatEndTime}
        formatDuration={formatDuration}
        onDelete={handleDelete}
    />
    )}

    </div>
)
}

// ─── COMPLETION FORM (in-progress runs) ──────────────────────────────────────

/**
 * Completion form: parameters, material usage, outputs, and end-of-run fields
 * for a run still in progress. Near-duplicate of wizard Steps 3–5 (see the
 * file-level TODO).
 *
 * @component
 * @param {Object} props
 * @param {Object} props.run - The in_progress run aggregate (recipe items included).
 * @param {Array} props.machineParameters - The machine's parameter links, in display order.
 * @param {Array} props.products - Products this machine may output.
 * @param {Array} props.lastRunParameterValues - Prefill values from the last completed matching run.
 * @param {Array} props.lastRunMaterialUsages - Prefill usage from the last completed matching run.
 * @param {string} props.lastRunQuantityProduced - Prefill quantity from the last run's first output.
 * @param {Function} props.onCompleted - Called after successful completion (parent navigates away).
 * @param {Function} props.onDelete - Called to cancel/abandon this in-progress run (parent navigates away).
 * @returns {JSX.Element}
 *
 * @example
 * <RunCompleteView run={run} machineParameters={mps} products={prods}
 *   lastRunParameterValues={[]} lastRunMaterialUsages={[]}
 *   lastRunQuantityProduced="" onCompleted={() => navigate('/runs')}
 *   onDelete={handleDelete} />
 */
function RunCompleteView({ run, machineParameters, products, lastRunParameterValues, lastRunMaterialUsages, lastRunQuantityProduced, onCompleted, onDelete }) {

const [endTime, setEndTime] = useState('')
const [energyEnd, setEnergyEnd] = useState('')
const [notes, setNotes] = useState('')

// Lazy initializers are safe here because this component only mounts AFTER the
// parent finished loading run, parameters, and prefill data — so the props are
// final on first render and never need re-syncing.
const [paramValues, setParamValues] = useState(() => {
    const initial = {}
    machineParameters.forEach(mp => {
        const prefilled = lastRunParameterValues.find(
            pv => pv.machineParameterId === mp.id
        )
        initial[mp.id] = prefilled ? String(prefilled.value) : ''
    })
    return initial
})

const [materialValues, setMaterialValues] = useState(() => {
    const initial = {}
    run.recipe.recipeItems.forEach(item => {
    const existing = lastRunMaterialUsages.find(mu => mu.materialId === item.materialId)
    initial[item.materialId] = existing ? String(existing.quantityUsed) : ''
    })
    return initial
})

const [quantityProduced, setQuantityProduced] = useState(lastRunQuantityProduced)
const [netWeightPerUnit, setNetWeightPerUnit] = useState('')

const [outputs, setOutputs] = useState(() => [{
    id: Date.now(),
    productId: run.productId,
    quantityProduced: lastRunQuantityProduced,
    grossWeightKg: '',
    scrapKg: ''
}])

const [isSubmitting, setIsSubmitting] = useState(false)
const [error, setError] = useState(null)

/**
 * Stores one parameter's raw input string under its machineParameterId.
 *
 * @param {string} mpId - MachineParameter link UUID.
 * @param {string} value - Raw input value; converted to Number only on submit.
 * @returns {void}
 *
 * @example
 * handleParamChange('31f0…', '210')
 */
function handleParamChange(mpId, value) {
    setParamValues(prev => ({ ...prev, [mpId]: value }))
}

/**
 * Stores one material's raw kg input under its materialId.
 *
 * @param {string} materialId - Material UUID.
 * @param {string} value - Raw input value; converted to Number only on submit.
 * @returns {void}
 *
 * @example
 * handleMaterialChange('a9d2…', '480')
 */
function handleMaterialChange(materialId, value) {
    setMaterialValues(prev => ({ ...prev, [materialId]: value }))
}

/**
 * Fills every material input from total weight × recipe percentage
 * (total kg = quantity × net weight per unit).
 *
 * @param {string|number} qty - Produced quantity (pieces).
 * @param {string|number} nw - Net weight of one piece in kg.
 * @returns {void} No-op until both inputs are non-zero numbers.
 *
 * @example
 * recalculateMaterials('500', '1.5')
 */
// TODO: replaces ALL material inputs, including hand-corrected ones — same
// behavior (and same fix) as wizard Step 4's calculator.
function recalculateMaterials(qty, nw) {
    const q = Number(qty)
    const n = Number(nw)
    if (!q || !n || run.recipe.recipeItems.length === 0) return
    const totalKg = q * n
    const computed = {}
    run.recipe.recipeItems.forEach(item => {
    // toFixed(2)+parseFloat: 2-decimal kg without trailing zeros.
    computed[item.materialId] = String(
        parseFloat((totalKg * item.percentage / 100).toFixed(2))
    )
    })
    setMaterialValues(computed)
}

/**
 * Updates the calculator's quantity and re-derives material amounts.
 * Note: does NOT update the output rows below — the calculator quantity and
 * output quantity are independent fields here, unlike in the wizard.
 *
 * @param {string} value - Raw input string.
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
 * Updates the calculator's unit weight and re-derives material amounts.
 *
 * @param {string} value - Raw input string.
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
 * Updates one field of one output row by its local list key.
 *
 * @param {number} id - Local row id (React key only, never sent to the server).
 * @param {string} field - "productId" | "quantityProduced" | "grossWeightKg" | "scrapKg".
 * @param {string} value - Raw input value.
 * @returns {void}
 *
 * @example
 * handleOutputChange(1751623945000, 'scrapKg', '10')
 */
function handleOutputChange(id, field, value) {
    setOutputs(prev => prev.map(o =>
    o.id === id ? { ...o, [field]: value } : o
    ))
}

/**
 * Appends an empty output row for multi-product runs.
 *
 * @returns {void}
 *
 * @example
 * <button onClick={addOutput}>+ Add Another Output</button>
 */
function addOutput() {
    setOutputs(prev => [...prev, {
    id: Date.now(),
    productId: '',
    quantityProduced: '',
    grossWeightKg: '',
    scrapKg: ''
    }])
}

/**
 * Removes an output row — except the last, since the server requires at least
 * one output to complete a run.
 *
 * @param {number} id - Local row id to remove.
 * @returns {void}
 *
 * @example
 * removeOutput(1751623945000)
 */
function removeOutput(id) {
    if (outputs.length === 1) return
    setOutputs(prev => prev.filter(o => o.id !== id))
}

/**
 * Checks completion requirements: end time set, all parameters and materials
 * filled, every output row complete with positive quantities (scrap may be 0).
 *
 * @returns {boolean} true when the payload is safe to send; false after setting an error.
 *
 * @example
 * if (!validate()) return
 */
function validate() {
    if (!endTime) {
    setError('End time is required.')
    return false
    }

    const allParamsFilled = machineParameters.every(mp => {
    const val = paramValues[mp.id]
    return val !== undefined && val.toString().trim() !== ''
    })
    if (!allParamsFilled) {
    setError('Please fill in all parameter values.')
    return false
    }

    const allMaterialsFilled = run.recipe.recipeItems.every(item => {
    const val = materialValues[item.materialId]
    return val !== undefined && val.toString().trim() !== ''
    })
    if (!allMaterialsFilled) {
    setError('Please fill in all material quantities.')
    return false
    }

    const allOutputsFilled = outputs.every(o =>
    o.productId &&
    o.quantityProduced !== '' &&
    o.grossWeightKg !== '' &&
    o.scrapKg !== ''
    )
    if (!allOutputsFilled) {
    setError('Please fill in all fields for every output row.')
    return false
    }

    const allPositive = outputs.every(o =>
    Number(o.quantityProduced) > 0 &&
    Number(o.grossWeightKg) > 0 &&
    Number(o.scrapKg) >= 0
    )
    if (!allPositive) {
    setError('Quantities must be positive. Scrap can be zero.')
    return false
    }

    return true
}

/**
 * Builds the completion payload from form state and submits it; hands control
 * back to the parent (which navigates away) on success.
 *
 * @returns {Promise<void>} Resolves after onCompleted or after the error state is set.
 *
 * @example
 * <button onClick={handleComplete}>Complete Run ✓</button>
 */
async function handleComplete() {
    if (!validate()) return

    setIsSubmitting(true)
    setError(null)

    const datePart = run.date.split('T')[0]
    // Recover the start wall-clock as "HH:mm" from the stored timestamp —
    // same local conversion the summary display below uses.
    const start = new Date(run.startTime)
    const pad = (n) => String(n).padStart(2, '0')
    const startHHmm = `${pad(start.getHours())}:${pad(start.getMinutes())}`

    try {
    const payload = {
        // The helper rolls the date to the next day for overnight runs
        // (end wall-clock at or before start wall-clock).
        endTime: buildEndTimestamp(datePart, startHHmm, endTime),
        parameterValues: machineParameters.map(mp => ({
        machineParameterId: mp.id,
        value: Number(paramValues[mp.id])
        })),
        materialUsages: run.recipe.recipeItems.map(item => ({
        materialId: item.materialId,
        quantityUsed: Number(materialValues[item.materialId])
        })),
        outputs: outputs.map(o => ({
        productId: o.productId,
        quantityProduced: Number(o.quantityProduced),
        grossWeightKg: Number(o.grossWeightKg),
        scrapKg: Number(o.scrapKg)
        })),
        // TODO: truthiness drops a legitimate 0 meter reading — use
        // energyEnd !== ''. todo.md Group 7 #2.
        ...(energyEnd && { energyEnd: Number(energyEnd) }),
        ...(notes && { notes }),
    }

    await completeRun(run.id, payload)
    onCompleted()

    } catch (err) {
    console.error(err)
    // Prefer the server's message: 409s carry actionable detail (which material
    // is short, or that someone else already completed this run).
    setError(err.response?.data?.error || 'Failed to complete run. Please try again.')
    } finally {
    setIsSubmitting(false)
    }
}

return (
    <div>

    {/* Run summary at top so operator knows what they're completing */}
    <div style={styles.summaryCard}>
        <SummaryRow label='Operator' value={run.operator.name} />
        <SummaryRow label='Product' value={run.product.name} />
        <SummaryRow label='Recipe' value={run.recipe.name} />
        <SummaryRow label='Started' value={
        new Date(run.startTime).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        })
        } />
    </div>

    {error && <div style={common.errorBox}>{error}</div>}


    {/* Parameters */}
    {machineParameters.length > 0 && (
        <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Parameters</p>
        {machineParameters.map(mp => (
            <div key={mp.id} style={common.field}>
            <label style={common.label}>
                {mp.parameter.name}
                {mp.parameter.unit ? ` (${mp.parameter.unit})` : ''}
            </label>
            <input
                style={styles.input}
                type='number'
                value={paramValues[mp.id] ?? ''}
                onChange={e => handleParamChange(mp.id, e.target.value)}
                placeholder='Enter value'
            />
            </div>
        ))}
        </div>
    )}

    {/* Quick Calculator */}
    {run.recipe.recipeItems.length > 0 && (
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
    )}

    {/* Materials */}
    {run.recipe.recipeItems.length > 0 && (
        <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Material Usage</p>
        {run.recipe.recipeItems.map(item => (
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
                value={materialValues[item.materialId] ?? ''}
                onChange={e => handleMaterialChange(item.materialId, e.target.value)}
                placeholder='Enter kg used'
                min='0'
                step='0.1'
                />
                <span style={common.unit}>kg</span>
            </div>
            </div>
        ))}
        </div>
    )}

    {/* Outputs */}
    <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Production Outputs</p>
        {outputs.map((output, index) => (
        <div key={output.id} style={styles.outputCard}>
            <div style={styles.outputCardHeader}>
            <span style={styles.outputCardTitle}>Output {index + 1}</span>
            {outputs.length > 1 && (
                <button
                style={styles.removeButton}
                onClick={() => removeOutput(output.id)}
                >
                Remove
                </button>
            )}
            </div>

            <div style={common.field}>
            <label style={common.label}>Product *</label>
            <select
                style={styles.input}
                value={output.productId}
                onChange={e => handleOutputChange(output.id, 'productId', e.target.value)}
            >
                <option value=''>Select product...</option>
                {products.map(product => (
                <option key={product.id} value={product.id}>
                    {product.name}{product.code ? ` — ${product.code}` : ''}
                </option>
                ))}
            </select>
            </div>

            <div style={common.field}>
            <label style={common.label}>Quantity Produced *</label>
            <input
                style={styles.input}
                type='number'
                value={output.quantityProduced}
                onChange={e => handleOutputChange(output.id, 'quantityProduced', e.target.value)}
                placeholder='0'
                min='0'
                step='1'
            />
            </div>

            <div style={common.field}>
            <label style={common.label}>Gross Weight *</label>
            <div style={common.inputRow}>
                <input
                style={styles.input}
                type='number'
                value={output.grossWeightKg}
                onChange={e => handleOutputChange(output.id, 'grossWeightKg', e.target.value)}
                placeholder='0.0'
                min='0'
                step='0.1'
                />
                <span style={common.unit}>kg</span>
            </div>
            </div>

            <div style={common.field}>
            <label style={common.label}>Scrap *</label>
            <div style={common.inputRow}>
                <input
                style={styles.input}
                type='number'
                value={output.scrapKg}
                onChange={e => handleOutputChange(output.id, 'scrapKg', e.target.value)}
                placeholder='0.0'
                min='0'
                step='0.1'
                />
                <span style={common.unit}>kg</span>
            </div>
            </div>

        </div>
        ))}

        <button style={styles.addButton} onClick={addOutput}>
        + Add Another Output
        </button>
    </div>

    {/* End Time */}
    <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Completion</p>
        <div style={common.field}>
        <label style={common.label}>End Time *</label>
        <input
            style={styles.input}
            type='time'
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
        />
        </div>
        <div style={common.field}>
        <label style={common.label}>Energy Meter End (kWh)</label>
        <input
            style={styles.input}
            type='number'
            value={energyEnd}
            onChange={e => setEnergyEnd(e.target.value)}
            placeholder='e.g. 12500'
        />
        </div>
        <div style={common.field}>
        <label style={common.label}>Notes</label>
        <textarea
            style={styles.textarea}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder='Any observations about this run...'
            rows={3}
        />
        </div>
    </div>

    <button
        style={{
        ...styles.completeButton,
        opacity: isSubmitting ? 0.6 : 1
        }}
        onClick={handleComplete}
        disabled={isSubmitting}
    >
        {isSubmitting ? 'Completing Run...' : 'Complete Run ✓'}
    </button>

    <button
        style={styles.deleteButton}
        disabled={isSubmitting}
        onClick={() => {
            const confirmed = window.confirm('Are you sure you want to cancel this in-progress run? This cannot be undone.')
            if (confirmed) onDelete()
        }}
    >
        Cancel Run
    </button>

    </div>
)
}

// ─── READ-ONLY VIEW (completed runs) ─────────────────────────────────────────

/**
 * Read-only record of a completed run: info, times, energy, parameters,
 * materials, outputs, notes — plus the delete action.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.run - Completed run aggregate with all relations.
 * @param {Function} props.formatDate - Parent's date formatter (shared so both views format identically).
 * @param {Function} props.formatTime - Parent's time formatter.
 * @param {Function} props.formatEndTime - Parent's end-time formatter (adds the "+1 day" marker).
 * @param {Function} props.formatDuration - Parent's start→end duration formatter.
 * @param {Function} props.onDelete - Called after the user confirms deletion.
 * @returns {JSX.Element}
 *
 * @example
 * <RunDetailView run={run} formatDate={formatDate} formatTime={formatTime}
 *   formatEndTime={formatEndTime} formatDuration={formatDuration} onDelete={handleDelete} />
 */
function RunDetailView({ run, formatDate, formatTime, formatEndTime, formatDuration, onDelete }) {
return (
    <div>
    <button
        style={styles.deleteButton}
        onClick={() => {
            const confirmed = window.confirm('Are you sure you want to delete this run? This cannot be undone.')
            if (confirmed) onDelete()
        }}
    >
        Delete Run
    </button>
    <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Run Info</p>
        <div style={styles.infoCard}>
        <InfoRow label='Date' value={formatDate(run.date)} />
        <InfoRow label='Operator' value={run.operator.name} />
        <InfoRow label='Product' value={run.product.name} />
        <InfoRow label='Recipe' value={run.recipe.name} />
        </div>
    </div>

    <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Times</p>
        <div style={styles.infoCard}>
        <InfoRow label='Warmup Start' value={formatTime(run.warmupStartTime)} />
        <InfoRow label='Production Start' value={formatTime(run.startTime)} />
        <InfoRow label='Stable Start' value={formatTime(run.stableStartTime)} />
        <InfoRow label='End Time' value={formatEndTime(run.startTime, run.endTime)} />
        <InfoRow label='Duration' value={formatDuration(run.startTime, run.endTime)} />
        </div>
    </div>

    {/* TODO: truthiness hides this whole section (and the readings inside)
        when a meter legitimately reads 0 — use != null checks. todo.md Group 7 #2. */}
    {(run.energyStart || run.energyEnd) && (
        <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Energy</p>
        <div style={styles.infoCard}>
            <InfoRow
            label='Start Reading'
            value={run.energyStart ? `${run.energyStart} kWh` : '—'}
            />
            <InfoRow
            label='End Reading'
            value={run.energyEnd ? `${run.energyEnd} kWh` : '—'}
            />
            {run.energyStart && run.energyEnd && (
            <InfoRow
                label='Consumed'
                value={`${(run.energyEnd - run.energyStart).toFixed(1)} kWh`}
            />
            )}
        </div>
        </div>
    )}

    {run.runParameterValues.length > 0 && (
        <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Parameters</p>
        <div style={styles.infoCard}>
            {/* Defensive re-sort on a COPY ([...] because .sort mutates): the API
                already orders by displayOrder, but this view breaks visibly if
                that ever regresses, so it doesn't rely on it. */}
            {[...run.runParameterValues]
            .sort((a, b) => a.machineParameter.displayOrder - b.machineParameter.displayOrder)
            .map(pv => (
            <InfoRow
                key={pv.id}
                label={pv.machineParameter.parameter.name}
                value={
                pv.machineParameter.parameter.unit
                    ? `${pv.value} ${pv.machineParameter.parameter.unit}`
                    : String(pv.value)
                }
            />
            ))}
        </div>
        </div>
    )}

    {run.materialUsages.length > 0 && (
        <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Materials Used</p>
        <div style={styles.infoCard}>
            {run.materialUsages.map(mu => (
            <InfoRow
                key={mu.id}
                label={mu.material.name}
                value={`${mu.quantityUsed} kg`}
            />
            ))}
        </div>
        </div>
    )}

    {run.runOutputs.length > 0 && (
        <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Outputs</p>
        {run.runOutputs.map((output, index) => (
            <div key={output.id} style={styles.outputCard}>
            <p style={styles.outputTitle}>Output {index + 1}</p>
            <InfoRow label='Product' value={output.product.name} />
            <InfoRow label='Quantity' value={output.quantityProduced} />
            <InfoRow label='Gross Weight' value={`${output.grossWeightKg} kg`} />
            <InfoRow label='Scrap' value={`${output.scrapKg} kg`} />
            </div>
        ))}
        </div>
    )}

    {run.notes && (
        <div style={styles.section}>
        <p style={{ ...common.sectionLabel, marginBottom: '0.5rem' }}>Notes</p>
        <div style={styles.infoCard}>
            <p style={styles.notesText}>{run.notes}</p>
        </div>
        </div>
    )}

    </div>
)
}

// ─── SHARED ROW COMPONENTS ───────────────────────────────────────────────────

/**
 * One label/value line inside an info card.
 *
 * @component
 * @param {Object} props
 * @param {string} props.label - Left-hand label text.
 * @param {string|number} props.value - Right-hand value; falsy renders as "—".
 * @returns {JSX.Element}
 *
 * @example
 * <InfoRow label='Operator' value={run.operator.name} />
 */
function InfoRow({ label, value }) {
return (
    <div style={styles.infoRow}>
    <span style={styles.infoLabel}>{label}</span>
    <span style={styles.infoValue}>{value || '—'}</span>
    </div>
)
}

/**
 * Row used by the completion form's summary card.
 *
 * @component
 * @param {Object} props
 * @param {string} props.label - Left-hand label text.
 * @param {string|number} props.value - Right-hand value; falsy renders as "—".
 * @returns {JSX.Element}
 *
 * @example
 * <SummaryRow label='Product' value={run.product.name} />
 */
// TODO: character-for-character duplicate of InfoRow — delete this and use
// InfoRow in both places. todo.md Group 8 #1.
function SummaryRow({ label, value }) {
return (
    <div style={styles.infoRow}>
    <span style={styles.infoLabel}>{label}</span>
    <span style={styles.infoValue}>{value || '—'}</span>
    </div>
)
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = {
container: {
    padding: '16px',
    maxWidth: '600px',
    margin: '0 auto',
},
backButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: '0.9rem',
    cursor: 'pointer',
    padding: '0',
    marginBottom: '1rem',
},
titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
},
heading: {
    color: 'var(--color-text-primary)',
    fontSize: '1.4rem',
},
badgeLive: {
    color: 'var(--color-accent)',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    backgroundColor: 'var(--color-selected-surface)',
    padding: '0.3rem 0.75rem',
    borderRadius: '999px',
    border: '1px solid var(--color-accent)',
},
badgeDone: {
    color: 'var(--color-success)',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    backgroundColor: 'var(--color-success-surface)',
    padding: '0.3rem 0.75rem',
    borderRadius: '999px',
    border: '1px solid var(--color-success)',
},
loadingText: {
    color: 'var(--color-text-secondary)',
    padding: '16px',
},
errorText: {
    color: 'var(--color-danger)',
    padding: '16px',
},
summaryCard: {
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-accent)',
    overflow: 'hidden',
    marginBottom: '1.5rem',
},
section: {
    marginBottom: '1.5rem',
},
infoCard: {
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
},
infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-border-muted)',
},
infoLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
},
infoValue: {
    color: 'var(--color-text-primary)',
    fontSize: '0.85rem',
    textAlign: 'right',
},
outputCard: {
    backgroundColor: 'var(--color-surface)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    marginBottom: '0.75rem',
},
outputTitle: {
    color: 'var(--color-text-primary)',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-border-muted)',
},
outputCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-border-muted)',
},
outputCardTitle: {
    color: 'var(--color-text-primary)',
    fontSize: '0.85rem',
    fontWeight: 'bold',
},
notesText: {
    color: 'var(--color-text-primary)',
    fontSize: '0.85rem',
    padding: '10px 16px',
    lineHeight: '1.5',
},
hint: {
    color: 'var(--color-text-muted)',
    fontSize: '0.8rem',
},
input: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
},
textarea: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.95rem',
    resize: 'vertical',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
},
removeButton: {
    backgroundColor: 'transparent',
    border: '1px solid var(--color-danger)',
    color: 'var(--color-danger)',
    padding: '0.25rem 0.75rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
},
addButton: {
    width: '100%',
    padding: '0.65rem',
    backgroundColor: 'transparent',
    border: '1px dashed var(--color-text-muted)',
    color: 'var(--color-text-secondary)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginBottom: '1rem',
},
completeButton: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    backgroundColor: 'var(--color-success)',
    color: 'var(--color-on-accent)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    width: '100%',
    marginBottom: '2rem',
},
deleteButton: {
    backgroundColor: 'transparent',
    border: '1px solid var(--color-danger)',
    color: 'var(--color-danger)',
    padding: '0.5rem 1.25rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    marginBottom: '1.5rem',
},
calculator: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
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
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
},
}

