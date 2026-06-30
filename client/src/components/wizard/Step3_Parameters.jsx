/**
 * Renders step 3 of the production-run wizard.
 * Collects machine-specific parameter measurements in displayOrder order.
 * Supports prefilled values from the last completed matching run.
 */
import { useState, useEffect } from 'react'
import { getMachineParameters } from '../../api/machineParameters'
import { common } from '../../styles/common'

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

if (loading) return <p style={common.loadingText}>Loading parameters...</p>

return (
    <div style={common.wizardContainer}>
    <h2 style={styles.heading}>Machine Parameters</h2>

    {error && <div style={common.errorBox}>{error}</div>}

    {machineParameters.length === 0 ? (
        <div style={common.emptyBox}>
        <p style={common.emptyText}>No parameters linked to this machine.</p>
        <p style={common.emptySubtext}>
            Go to Admin → Machines → select machine to add parameters.
        </p>
        </div>
    ) : (
        <div style={styles.list}>
        {machineParameters.map(mp => (
            <div key={mp.id} style={common.field}>
            <label style={common.label}>
                {mp.parameter.name}
                {mp.parameter.unit ? ` (${mp.parameter.unit})` : ''}
            </label>
            <input
                style={common.wizardInput}
                type='number'
                value={values[mp.id] ?? ''}
                onChange={e => handleChange(mp.id, e.target.value)}
                placeholder='Enter value'
            />
            </div>
        ))}
        </div>
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
    marginBottom: '1.5rem',
},
list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0rem',
    marginBottom: '1.5rem',
},
}

