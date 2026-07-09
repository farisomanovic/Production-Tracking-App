/**
 * @file Step5_Output.jsx
 * @description Wizard step 5: record what was produced (one or more output
 * rows), the end time, and closing details — then submit the whole completion
 * payload (including steps 3–4 data held in wizard state) in one call.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeRun } from '../../api/productionRuns'
import { getMachineProducts } from '../../api/machineProducts'
import { buildEndTimestamp } from '../../lib/dates'
import { common } from '../../styles/common'

/**
 * Renders output rows + completion fields and submits the run completion.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.data - Accumulated wizard formData: parameterValues, materialUsages,
 * and the run-level weights (netWeightPerUnit/grossWeightPerUnit/scrapKg) from steps 3–4
 * ride along in the final payload; `productId`/`quantityProduced` prefill row 1.
 * @param {string} props.runId - UUID of the run created after step 2 — the completion target.
 * @returns {JSX.Element}
 *
 * @example
 * <Step5_Output data={formData} runId={runId} onNext={handleStepNext} />
 */
export default function Step5_Output({ data, runId }) {

const navigate = useNavigate()

const [endTime, setEndTime] = useState(data.endTime || '')
const [energyEnd, setEnergyEnd] = useState(data.energyEnd || '')
const [notes, setNotes] = useState(data.notes || '')

const [outputs, setOutputs] = useState(() => {
    if (data.outputs && data.outputs.length > 0) {
    // Restored rows get fresh ids: Date.now()+random because these are only
    // React list keys for add/remove — they are never sent to the server.
    return data.outputs.map(o => ({ ...o, id: Date.now() + Math.random() }))
    }
    // First visit: one row preselecting the run's main product and the quantity
    // the operator already typed into step 4's calculator — usually correct,
    // always editable.
    return [{
    id: Date.now(),
    productId: data.productId,
    quantityProduced: data.quantityProduced ? String(data.quantityProduced) : ''
    }]
})

const [products, setProducts] = useState([])
const [loading, setLoading] = useState(true)
const [isSubmitting, setIsSubmitting] = useState(false)
const [error, setError] = useState(null)

const machineId = data.machineId

useEffect(() => {
    async function loadProducts() {
    try {
        // Machine-linked products only: an extra output (e.g. a second width cut
        // on the same run) must still be something this machine can produce.
        const response = await getMachineProducts(machineId)
        setProducts(response.data.map(item => item.product))
    } catch (err) {
        setError('Failed to load products')
        console.error(err)
    } finally {
        setLoading(false)
    }
    }
    loadProducts()
}, [machineId])

// ─── OUTPUT ROW MANAGEMENT ───────────────────────────────────────────────────

/**
 * Updates one field of one output row, identified by its local list key.
 *
 * @param {number} id - Local row id (Date.now()-based key, not a server id).
 * @param {string} field - One of "productId" | "quantityProduced".
 * @param {string} value - Raw input value; converted to Number only on submit.
 * @returns {void}
 *
 * @example
 * handleOutputChange(1751623945000, 'quantityProduced', '500')
 */
function handleOutputChange(id, field, value) {
    setOutputs(prev => prev.map(o =>
    o.id === id ? { ...o, [field]: value } : o
    ))
}

/**
 * Appends an empty output row for runs that produced more than one product.
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
    quantityProduced: ''
    }])
}

/**
 * Removes an output row — except the last one, because the server requires at
 * least one output to complete a run.
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

// ─── VALIDATION & SUBMIT ─────────────────────────────────────────────────────

/**
 * Checks completion requirements before submit: end time present, every output
 * row fully filled, quantities positive.
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

    const allOutputsFilled = outputs.every(o =>
    o.productId &&
    o.quantityProduced !== ''
    )

    if (!allOutputsFilled) {
    setError('Please fill in all fields for every output row.')
    return false
    }

    const allPositive = outputs.every(o =>
    Number(o.quantityProduced) > 0
    )

    if (!allPositive) {
    setError('Quantities must be positive.')
    return false
    }

    return true
}

/**
 * Builds the completion payload (merging steps 3–4 data from wizard state) and
 * submits it; navigates to the runs list on success.
 *
 * @returns {Promise<void>} Resolves after navigation or after the error state is set.
 *
 * @example
 * <button onClick={handleComplete}>Complete Run ✓</button>
 */
async function handleComplete() {
    if (!validate()) return

    setIsSubmitting(true)
    setError(null)

    try {
    const payload = {
        // No timezone suffix on purpose: the DB column is a naive Timestamp, so
        // "what the wall clock said" is stored as-is (see todo.md Group 6 #3).
        // The helper rolls the date to the next day for overnight runs
        // (end wall-clock at or before start wall-clock).
        endTime: buildEndTimestamp(data.date, data.startTime, endTime),
        parameterValues: data.parameterValues,
        materialUsages: data.materialUsages,
        outputs: outputs.map(o => ({
        productId: o.productId,
        quantityProduced: Number(o.quantityProduced)
        })),
        // != null (not truthiness): a scrap of 0 is a real value that must be
        // sent — a perfect run's zero scrap should overwrite nothing silently.
        ...(data.netWeightPerUnit != null && { netWeightPerUnit: data.netWeightPerUnit }),
        ...(data.grossWeightPerUnit != null && { grossWeightPerUnit: data.grossWeightPerUnit }),
        ...(data.scrapKg != null && { scrapKg: data.scrapKg }),
        // TODO: truthiness drops a legitimate meter reading of 0 — use
        // energyEnd !== '' instead. todo.md Group 7 #2.
        ...(energyEnd && { energyEnd: Number(energyEnd) }),
        ...(notes && { notes }),
    }

    await completeRun(runId, payload)
    navigate('/runs')

    } catch (err) {
    console.error(err)
    // Prefer the server's message: 409s carry actionable detail (which material
    // is short, or that someone else already completed this run).
    setError(err.response?.data?.error || 'Failed to complete run. Please try again.')
    } finally {
    setIsSubmitting(false)
    }
}

if (loading) return <p style={common.loadingText}>Loading...</p>

// ─── RENDER ──────────────────────────────────────────────────────────────────

return (
    <div style={common.wizardContainer}>
    <h2 style={styles.heading}>Output & Completion</h2>
    <p style={common.subheading}>
        Record what was produced and close out the run.
    </p>

    {error && <div style={common.errorBox}>{error}</div>}

    {/* End Time */}
    <div style={common.field}>
        <label style={common.label}>End Time *</label>
        <input
        style={styles.input}
        type='time'
        value={endTime}
        onChange={e => setEndTime(e.target.value)}
        />
    </div>

    {/* Energy End */}
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

    {/* Notes */}
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

    <h3 style={styles.sectionHeading}>Production Outputs</h3>

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

        {/* Product */}
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

        {/* Quantity Produced */}
        <div style={common.field}>
            <label style={common.label}>Quantity Produced *</label>
            <div style={common.inputRow}>
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
        </div>

        </div>
    ))}

    <button style={styles.addButton} onClick={addOutput}>
        + Add Another Output
    </button>

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

    </div>
)
}

const styles = {
heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '0.5rem',
},
sectionHeading: {
    color: 'var(--color-text-primary)',
    fontSize: '1rem',
    marginBottom: '1rem',
    marginTop: '0.5rem',
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
},
outputCard: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
},
outputCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
},
outputCardTitle: {
    color: 'var(--color-text-primary)',
    fontSize: '0.9rem',
    fontWeight: 'bold',
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
},
}
