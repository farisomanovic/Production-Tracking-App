/**
 * @file Step3_Parameters.jsx
 * @description Wizard step 3: enter the measured value for each parameter the
 * chosen machine collects. Runs AFTER the run exists in the DB — values are
 * held in wizard state and only submitted at step 5's completion call.
 */
import { useState, useEffect } from 'react'
import { getMachineParameters } from '../../api/machineParameters'
import { common } from '../../styles/common'

/**
 * Renders one numeric input per machine parameter, in configured display order.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.data - Accumulated wizard formData; `machineId` drives the fetch,
 * `parameterValues` restores previous answers or the last-run prefill.
 * @param {string} props.runId - The created run's UUID (unused here, passed for step API symmetry).
 * @param {Function} props.onNext - Called with `{ parameterValues: [{ machineParameterId, value }] }`.
 * @returns {JSX.Element}
 *
 * @example
 * <Step3_Parameters data={formData} runId={runId} onNext={handleStepNext} />
 */
export default function Step3_Parameters({ data, onNext }) {

const [machineParameters, setMachineParameters] = useState([])
// values is an object keyed by machineParameterId (not an array) so each
// input's onChange is a single O(1) key write instead of an array search.
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

        // Every parameter gets a key up front (empty string when unknown) so
        // every input is controlled from its first render — React warns if an
        // input flips from undefined (uncontrolled) to a value (controlled).
        const initialValues = {}
        params.forEach(mp => {
        // Previous answers win over blank: covers both "user came back" and
        // the last-completed-run prefill the parent fetched.
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

/**
 * Stores one parameter's raw input string under its machineParameterId.
 *
 * @param {string} machineParameterId - Link UUID identifying which input changed.
 * @param {string} newValue - Raw input value; converted to Number only on submit.
 * @returns {void}
 *
 * @example
 * handleChange('31f0…', '210')
 */
function handleChange(machineParameterId, newValue) {
    setValues(prev => ({
    ...prev,
    [machineParameterId]: newValue
    }))
}

/**
 * Requires every parameter to be filled, converts strings to numbers, and
 * passes the array format the completion endpoint expects.
 *
 * @returns {void} Calls onNext on success; sets an error message otherwise.
 *
 * @example
 * <button onClick={handleNext}>Next →</button>
 */
function handleNext() {
    const allFilled = machineParameters.every(mp => {
    const val = values[mp.id]
    return val !== undefined && val.trim() !== ''
    })

    if (!allFilled) {
    setError('Please fill in all parameter values before continuing.')
    return
    }

    setError(null)

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
