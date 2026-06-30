/**
 * Renders step 5 of the production-run wizard.
 * Captures final output, energy, scrap, and completion details.
 * Submits the transactional completion payload to the backend.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeRun } from '../../api/productionRuns'
import { getMachineProducts } from '../../api/machineProducts'
import { common } from '../../styles/common'

export default function Step5_Output({ data, runId }) {

const navigate = useNavigate()

const [endTime, setEndTime] = useState(data.endTime || '')
const [energyEnd, setEnergyEnd] = useState(data.energyEnd || '')
const [notes, setNotes] = useState(data.notes || '')

const [outputs, setOutputs] = useState(() => {
    // If user came back to this step preserve their previous outputs
    if (data.outputs && data.outputs.length > 0) {
    return data.outputs.map(o => ({ ...o, id: Date.now() + Math.random() }))
    }
    // Otherwise start with one row pre-filled with the primary product
    return [{
    id: Date.now(),
    productId: data.productId,
    quantityProduced: '',
    grossWeightKg: '',
    scrapKg: ''
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

function handleOutputChange(id, field, value) {
    setOutputs(prev => prev.map(o =>
    o.id === id ? { ...o, [field]: value } : o
    ))
}

function addOutput() {
    setOutputs(prev => [...prev, {
    id: Date.now(),
    productId: '',
    quantityProduced: '',
    grossWeightKg: '',
    scrapKg: ''
    }])
}

function removeOutput(id) {
    // Never allow removing the last output row
    if (outputs.length === 1) return
    setOutputs(prev => prev.filter(o => o.id !== id))
}

function validate() {
    if (!endTime) {
    setError('End time is required.')
    return false
    }

    // Every output row must have all four fields filled
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

    // Validate numbers are positive
    const allPositive = outputs.every(o =>
    Number(o.quantityProduced) > 0 &&
    Number(o.grossWeightKg) > 0 &&
    Number(o.scrapKg) >= 0  // scrap can be zero
    )

    if (!allPositive) {
    setError('Quantities must be positive. Scrap can be zero.')
    return false
    }

    return true
}

async function handleComplete() {
    if (!validate()) return

    setIsSubmitting(true)
    setError(null)

    try {
    const payload = {
        endTime: `${data.date}T${endTime}:00.000`,
        parameterValues: data.parameterValues,
        materialUsages: data.materialUsages,
        outputs: outputs.map(o => ({
        productId: o.productId,
        quantityProduced: Number(o.quantityProduced),
        grossWeightKg: Number(o.grossWeightKg),
        scrapKg: Number(o.scrapKg)
        })),
        ...(energyEnd && { energyEnd: Number(energyEnd) }),
        ...(notes && { notes }),
    }

    await completeRun(runId, payload)
    navigate('/runs')

    } catch (err) {
    console.error(err)
    setError('Failed to complete run. Please try again.')
    } finally {
    setIsSubmitting(false)
    }
}

if (loading) return <p style={common.loadingText}>Loading...</p>

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

    {/* Output rows */}
    <h3 style={styles.sectionHeading}>Production Outputs</h3>

    {outputs.map((output, index) => (
        <div key={output.id} style={styles.outputCard}>

        {/* Card header with row number and remove button */}
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

        {/* Gross Weight */}
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

        {/* Scrap */}
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

    {/* Add output button */}
    <button style={styles.addButton} onClick={addOutput}>
        + Add Another Output
    </button>

    {/* Complete button */}
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

