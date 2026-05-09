import { useState, useEffect } from 'react'
import { getMachineParameters } from '../../api/machineParameters'

export default function Step3_Parameters({ data, onNext }) {

const [machineParameters, setMachineParameters] = useState([])
const [values, setValues] = useState({})
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

const machineId = data.machineId
const initialParameterValues = data.parameterValues

useEffect(() => {
    async function loadParameters() {
    try {
        const response = await getMachineParameters(machineId)
        const params = response.data
        setMachineParameters(params)

        // Initialize values object with empty strings for each parameter
        // This ensures every parameter has a controlled input from the start
        const initialValues = {}
        params.forEach(mp => {
        // If user came back to this step, preserve their previous answers
        const existing = initialParameterValues?.find(
            pv => pv.machineParameterId === mp.id
        )
        initialValues[mp.id] = existing ? String(existing.value) : ''
        })
        setValues(initialValues)

    } catch (err) {
        setError('Failed to load parameters')
        console.error(err)
    } finally {
        setLoading(false)
    }
    }
    loadParameters()
}, [machineId, initialParameterValues])

function handleChange(machineParameterId, newValue) {
    setValues(prev => ({
    ...prev,
    [machineParameterId]: newValue
    }))
}

function handleNext() {
    // Validate — every parameter must have a value
    const allFilled = machineParameters.every(mp => {
    const val = values[mp.id]
    return val !== undefined && val.trim() !== ''
    })

    if (!allFilled) {
    setError('Please fill in all parameter values before continuing.')
    return
    }

    setError(null)

    // Convert values object into the array format the backend expects
    const parameterValues = machineParameters.map(mp => ({
    machineParameterId: mp.id,
    value: Number(values[mp.id])
    }))

    onNext({ parameterValues })
}

if (loading) return <p style={styles.loadingText}>Loading parameters...</p>

return (
    <div style={styles.container}>
    <h2 style={styles.heading}>Machine Parameters</h2>

    {error && <div style={styles.errorBox}>{error}</div>}

    {machineParameters.length === 0 ? (
        <div style={styles.emptyBox}>
        <p style={styles.emptyText}>No parameters linked to this machine.</p>
        <p style={styles.emptySubtext}>
            Go to Admin → Machines → select machine to add parameters.
        </p>
        </div>
    ) : (
        <div style={styles.list}>
        {machineParameters.map(mp => (
            <div key={mp.id} style={styles.field}>
            <label style={styles.label}>
                {mp.parameter.name}
                {mp.parameter.unit ? ` (${mp.parameter.unit})` : ''}
            </label>
            <input
                style={styles.input}
                type='number'
                value={values[mp.id] ?? ''}
                onChange={e => handleChange(mp.id, e.target.value)}
                placeholder='Enter value'
            />
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
input: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a2e',
    color: '#ffffff',
    fontSize: '0.95rem',
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