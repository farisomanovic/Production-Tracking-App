/**
 * Renders production-run detail, completion, editing, and deletion workflows.
 * Displays related parameters, material usage, outputs, and traceability data.
 * Completes in-progress runs using machine-specific configuration and outputs.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getRunById, completeRun, getAllRuns, deleteRun } from '../api/productionRuns'
import { getMachineParameters } from '../api/machineParameters'
import { getMachineProducts } from '../api/machineProducts'
import { common } from '../styles/common'

export default function RunDetailPage() {

const { id } = useParams()
const navigate = useNavigate()

const [run, setRun] = useState(null)
const [machineParameters, setMachineParameters] = useState([])
const [products, setProducts] = useState([])
const [lastRunParameterValues, setLastRunParameterValues] = useState([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

useEffect(() => {
    async function loadRun() {
    try {
        const runRes = await getRunById(id)
        const fetchedRun = runRes.data
        setRun(fetchedRun)

        if (fetchedRun.status === 'in_progress') {
        const [paramsRes, productsRes] = await Promise.all([
            getMachineParameters(fetchedRun.machineId),
            getMachineProducts(fetchedRun.machineId)
        ])
        setMachineParameters(paramsRes.data)
        setProducts(productsRes.data.map(item => item.product))

        // Fetch last completed run for same machine + product to pre-fill parameters
        try {
            const lastRunRes = await getAllRuns({
                machineId: fetchedRun.machineId,
                productId: fetchedRun.productId,
                status: 'completed',
                limit: 1
            })
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
            }
        } catch (err) {
            // Pre-fill is a convenience, failure here should not block the completion form
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

/**
 * Formats a production-run date for detail display.
 *
 * @param {string} dateStr - Date string returned by the API.
 * @returns {string} Human-readable date or a fallback dash.
 */
function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
    })
}

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
 * Formats a production-run timestamp for detail display.
 *
 * @param {string} dateStr - Timestamp string returned by the API.
 * @returns {string} Human-readable time or a fallback dash.
 */
function formatTime(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    })
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
            onCompleted={() => navigate('/runs')}
        />
    ) : (
        <RunDetailView
        run={run}
        formatDate={formatDate}
        formatTime={formatTime}
        onDelete={handleDelete}
    />
    )}

    </div>
)
}

// Completion form for in-progress runs
function RunCompleteView({ run, machineParameters, products, lastRunParameterValues, onCompleted }) {

const [endTime, setEndTime] = useState('')
const [energyEnd, setEnergyEnd] = useState('')
const [notes, setNotes] = useState('')

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
    initial[item.materialId] = ''
    })
    return initial
})

const [outputs, setOutputs] = useState(() => [{
    id: Date.now(),
    productId: run.productId,
    quantityProduced: '',
    grossWeightKg: '',
    scrapKg: ''
}])

const [isSubmitting, setIsSubmitting] = useState(false)
const [error, setError] = useState(null)

function handleParamChange(mpId, value) {
    setParamValues(prev => ({ ...prev, [mpId]: value }))
}

function handleMaterialChange(materialId, value) {
    setMaterialValues(prev => ({ ...prev, [materialId]: value }))
}

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
    if (outputs.length === 1) return
    setOutputs(prev => prev.filter(o => o.id !== id))
}

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

async function handleComplete() {
    if (!validate()) return

    setIsSubmitting(true)
    setError(null)

    // Extract just the date part from run.date for combining with endTime
    const datePart = run.date.split('T')[0]

    try {
    const payload = {
        endTime: `${datePart}T${endTime}:00.000`,
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
        ...(energyEnd && { energyEnd: Number(energyEnd) }),
        ...(notes && { notes }),
    }

    await completeRun(run.id, payload)
    onCompleted()

    } catch (err) {
    console.error(err)
    setError('Failed to complete run. Please try again.')
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

    </div>
)
}

// Read only detail view for completed runs
function RunDetailView({ run, formatDate, formatTime, onDelete }) {
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
        <InfoRow label='End Time' value={formatTime(run.endTime)} />
        </div>
    </div>

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
            {run.runParameterValues.map(pv => (
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

function InfoRow({ label, value }) {
return (
    <div style={styles.infoRow}>
    <span style={styles.infoLabel}>{label}</span>
    <span style={styles.infoValue}>{value || '—'}</span>
    </div>
)
}

function SummaryRow({ label, value }) {
return (
    <div style={styles.infoRow}>
    <span style={styles.infoLabel}>{label}</span>
    <span style={styles.infoValue}>{value || '—'}</span>
    </div>
)
}

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
}

