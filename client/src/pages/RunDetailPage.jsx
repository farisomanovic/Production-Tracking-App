import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getRunById, completeRun } from '../api/productionRuns'
import { getMachineParameters } from '../api/machineParameters'
import { getMachineProducts } from '../api/machineProducts'

export default function RunDetailPage() {

const { id } = useParams()
const navigate = useNavigate()

const [run, setRun] = useState(null)
const [machineParameters, setMachineParameters] = useState([])
const [products, setProducts] = useState([])
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

function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
    })
}

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
        onCompleted={() => navigate('/runs')}
        />
    ) : (
        <RunDetailView run={run} formatDate={formatDate} formatTime={formatTime} />
    )}

    </div>
)
}

// Completion form for in-progress runs
function RunCompleteView({ run, machineParameters, products, onCompleted }) {

const [endTime, setEndTime] = useState('')
const [energyEnd, setEnergyEnd] = useState('')
const [notes, setNotes] = useState('')

const [paramValues, setParamValues] = useState(() => {
    const initial = {}
    machineParameters.forEach(mp => {
    initial[mp.id] = ''
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

    {error && <div style={styles.errorBox}>{error}</div>}


    {/* Parameters */}
    {machineParameters.length > 0 && (
        <div style={styles.section}>
        <p style={styles.sectionLabel}>Parameters</p>
        {machineParameters.map(mp => (
            <div key={mp.id} style={styles.field}>
            <label style={styles.label}>
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
        <p style={styles.sectionLabel}>Material Usage</p>
        {run.recipe.recipeItems.map(item => (
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
                value={materialValues[item.materialId] ?? ''}
                onChange={e => handleMaterialChange(item.materialId, e.target.value)}
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

    {/* Outputs */}
    <div style={styles.section}>
        <p style={styles.sectionLabel}>Production Outputs</p>
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

            <div style={styles.field}>
            <label style={styles.label}>Product *</label>
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

            <div style={styles.field}>
            <label style={styles.label}>Quantity Produced *</label>
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

            <div style={styles.field}>
            <label style={styles.label}>Gross Weight *</label>
            <div style={styles.inputRow}>
                <input
                style={styles.input}
                type='number'
                value={output.grossWeightKg}
                onChange={e => handleOutputChange(output.id, 'grossWeightKg', e.target.value)}
                placeholder='0.0'
                min='0'
                step='0.1'
                />
                <span style={styles.unit}>kg</span>
            </div>
            </div>

            <div style={styles.field}>
            <label style={styles.label}>Scrap *</label>
            <div style={styles.inputRow}>
                <input
                style={styles.input}
                type='number'
                value={output.scrapKg}
                onChange={e => handleOutputChange(output.id, 'scrapKg', e.target.value)}
                placeholder='0.0'
                min='0'
                step='0.1'
                />
                <span style={styles.unit}>kg</span>
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
        <p style={styles.sectionLabel}>Completion</p>
        <div style={styles.field}>
        <label style={styles.label}>End Time *</label>
        <input
            style={styles.input}
            type='time'
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
        />
        </div>
        <div style={styles.field}>
        <label style={styles.label}>Energy Meter End (kWh)</label>
        <input
            style={styles.input}
            type='number'
            value={energyEnd}
            onChange={e => setEnergyEnd(e.target.value)}
            placeholder='e.g. 12500'
        />
        </div>
        <div style={styles.field}>
        <label style={styles.label}>Notes</label>
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
function RunDetailView({ run, formatDate, formatTime }) {
return (
    <div>
    <div style={styles.section}>
        <p style={styles.sectionLabel}>Run Info</p>
        <div style={styles.infoCard}>
        <InfoRow label='Date' value={formatDate(run.date)} />
        <InfoRow label='Operator' value={run.operator.name} />
        <InfoRow label='Product' value={run.product.name} />
        <InfoRow label='Recipe' value={run.recipe.name} />
        </div>
    </div>

    <div style={styles.section}>
        <p style={styles.sectionLabel}>Times</p>
        <div style={styles.infoCard}>
        <InfoRow label='Warmup Start' value={formatTime(run.warmupStartTime)} />
        <InfoRow label='Production Start' value={formatTime(run.startTime)} />
        <InfoRow label='Stable Start' value={formatTime(run.stableStartTime)} />
        <InfoRow label='End Time' value={formatTime(run.endTime)} />
        </div>
    </div>

    {(run.energyStart || run.energyEnd) && (
        <div style={styles.section}>
        <p style={styles.sectionLabel}>Energy</p>
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
        <p style={styles.sectionLabel}>Parameters</p>
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
        <p style={styles.sectionLabel}>Materials Used</p>
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
        <p style={styles.sectionLabel}>Outputs</p>
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
        <p style={styles.sectionLabel}>Notes</p>
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
    color: '#888',
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
    color: '#ffffff',
    fontSize: '1.4rem',
},
badgeLive: {
    color: '#4f46e5',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    backgroundColor: '#1e1b4b',
    padding: '0.3rem 0.75rem',
    borderRadius: '999px',
    border: '1px solid #4f46e5',
},
badgeDone: {
    color: '#16a34a',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    backgroundColor: '#052e16',
    padding: '0.3rem 0.75rem',
    borderRadius: '999px',
    border: '1px solid #16a34a',
},
loadingText: {
    color: '#888',
    padding: '16px',
},
errorText: {
    color: '#dc2626',
    padding: '16px',
},
summaryCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #4f46e5',
    overflow: 'hidden',
    marginBottom: '1.5rem',
},
section: {
    marginBottom: '1.5rem',
},
sectionLabel: {
    color: '#888',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
},
infoCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #333',
    overflow: 'hidden',
},
infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #222',
},
infoLabel: {
    color: '#888',
    fontSize: '0.85rem',
},
infoValue: {
    color: '#ffffff',
    fontSize: '0.85rem',
    textAlign: 'right',
},
outputCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    border: '1px solid #333',
    overflow: 'hidden',
    marginBottom: '0.75rem',
},
outputTitle: {
    color: '#ffffff',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    padding: '10px 16px',
    borderBottom: '1px solid #222',
},
outputCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #222',
},
outputCardTitle: {
    color: '#ffffff',
    fontSize: '0.85rem',
    fontWeight: 'bold',
},
notesText: {
    color: '#ffffff',
    fontSize: '0.85rem',
    padding: '10px 16px',
    lineHeight: '1.5',
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
input: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
},
textarea: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '0.95rem',
    resize: 'vertical',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
},
inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
},
unit: {
    color: '#888',
    fontSize: '0.85rem',
    minWidth: '2rem',
},
removeButton: {
    backgroundColor: 'transparent',
    border: '1px solid #dc2626',
    color: '#dc2626',
    padding: '0.25rem 0.75rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
},
addButton: {
    width: '100%',
    padding: '0.65rem',
    backgroundColor: 'transparent',
    border: '1px dashed #555',
    color: '#888',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginBottom: '1rem',
},
completeButton: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    width: '100%',
    marginBottom: '2rem',
},
}