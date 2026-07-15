/**
 * @file Step1_BasicInfo.jsx
 * @description Wizard step 1: who/where/what/when — operator, machine, product,
 * date, and setup times. Nothing is written to the server here; the run is only
 * created after step 2.
 */
import { useState, useEffect } from 'react'
import { getAllOperators } from '../../api/operators'
import { getAllMachines } from '../../api/machines'
import { getMachineProducts } from '../../api/machineProducts'
import { common } from '../../styles/common'

/**
 * Renders the run header form and reports its values upward on Next.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.data - Accumulated wizard formData; used to restore values if the user returns.
 * @param {Function} props.onNext - Called with this step's fields merged-ready; parent advances the step.
 * @returns {JSX.Element}
 *
 * @example
 * <Step1_BasicInfo data={formData} onNext={handleStepNext} />
 */
export default function Step1_BasicInfo({ data, onNext }) {

// ─── FORM STATE ──────────────────────────────────────────────────────────────
// Initialized from the data prop so values survive a return to this step —
// wizard state lives in the parent, each step is just an editor for its slice.
const [operatorId, setOperatorId] = useState(data.operatorId || '')
const [machineId, setMachineId] = useState(data.machineId || '')
const [productId, setProductId] = useState(data.productId || '')
const [date, setDate] = useState(data.date || '')
const [startTime, setStartTime] = useState(data.startTime || '')
const [warmupStartTime, setWarmupStartTime] = useState(data.warmupStartTime || '')
const [stableStartTime, setStableStartTime] = useState(data.stableStartTime || '')
const [energyStart, setEnergyStart] = useState(data.energyStart || '')
const [potentialBuyer, setPotentialBuyer] = useState(data.potentialBuyer || '')

const [operators, setOperators] = useState([])
const [machines, setMachines] = useState([])
const [products, setProducts] = useState([])

// Two loading flags because they gate different UI: loadingInitial blocks the
// whole step, loadingProducts only the product dropdown after a machine pick.
const [loadingInitial, setLoadingInitial] = useState(true)
const [loadingProducts, setLoadingProducts] = useState(false)
const [error, setError] = useState(null)

// ─── DATA LOADING ────────────────────────────────────────────────────────────

useEffect(() => {
    async function loadInitial() {
    try {
        const [operatorsRes, machinesRes] = await Promise.all([
        getAllOperators(),
        getAllMachines()
        ])
        setOperators(operatorsRes.data)
        setMachines(machinesRes.data)
    } catch (err) {
        setError('Failed to load operators and machines')
        console.error(err)
    } finally {
        setLoadingInitial(false)
    }
    }
    loadInitial()
}, [])

// Products are machine-dependent (MachineProduct links), so they reload every
// time the machine changes rather than being fetched once.
useEffect(() => {
if (!machineId) return

async function loadProducts() {
    setLoadingProducts(true)
    try {
    const response = await getMachineProducts(machineId)
    const productList = response.data.map(item => item.product)
    setProducts(productList)
    } catch (err) {
    setError('Failed to load products for this machine')
    console.error(err)
    } finally {
    setLoadingProducts(false)
    }
}
loadProducts()
}, [machineId])

// ─── VALIDATION & SUBMIT ─────────────────────────────────────────────────────

/**
 * Validates required fields and passes this step's data up to the wizard.
 *
 * @returns {void} Calls onNext on success; sets an error message otherwise.
 *
 * @example
 * <button onClick={handleNext}>Next →</button>
 */
function handleNext() {
    if (!operatorId || !machineId || !productId || !date || !startTime) {
    setError('Please fill in all required fields before continuing.')
    return
    }

    setError(null)

    const stepData = {
    operatorId,
    machineId,
    productId,
    date,
    startTime,
    // Optionals are spread-if-truthy so the payload builder later doesn't have
    // to distinguish "" (untouched input) from a real value.
    ...(warmupStartTime && { warmupStartTime }),
    ...(stableStartTime && { stableStartTime }),
    ...(energyStart && { energyStart }),
    ...(potentialBuyer && { potentialBuyer }),
    }

    onNext(stepData)
}

if (loadingInitial) return <p style={common.loadingText}>Loading...</p>

// ─── RENDER ──────────────────────────────────────────────────────────────────

return (
    <div style={common.wizardContainer}>
    <h2 style={styles.heading}>Basic Information</h2>

    {error && <div style={common.errorBox}>{error}</div>}

    {/* Operator */}
    <div style={common.field}>
        <label style={common.label}>Operator *</label>
        <select
        style={common.wizardInput}
        value={operatorId}
        onChange={e => setOperatorId(e.target.value)}
        >
        <option value=''>Select operator...</option>
        {/* Client-side active filter — the API returns inactive operators too
            (the admin page needs them). The server re-checks on create, so this
            is UX, not security. */}
        {operators.filter(op => op.active).map(op => (
            <option key={op.id} value={op.id}>
                {op.name}
            </option>
        ))}
        </select>
    </div>

    {/* Machine */}
    <div style={common.field}>
        <label style={common.label}>Machine *</label>
        <select
        style={common.wizardInput}
        value={machineId}
        onChange={e => {
            setMachineId(e.target.value)
            // Product must reset with the machine: the old selection may not be
            // producible on the new machine, and keeping it would create exactly
            // the machine/product mismatch the link table exists to prevent.
            setProductId('')
            setProducts([])
        }}
        >
        <option value=''>Select machine...</option>
        {machines.filter(m => m.active).map(machine => (
            <option key={machine.id} value={machine.id}>
                {machine.name}
            </option>
        ))}
        </select>
    </div>

    {/* Product — hidden until a machine is chosen because the list is machine-specific */}
    {machineId && (
        <div style={common.field}>
        <label style={common.label}>Product *</label>
        {loadingProducts ? (
            <p style={common.loadingText}>Loading products...</p>
        ) : (
            <select
            style={common.wizardInput}
            value={productId}
            onChange={e => setProductId(e.target.value)}
            >
            <option value=''>Select product...</option>
            {products.map(product => (
                <option key={product.id} value={product.id}>
                    {product.name}{product.code ? ` — ${product.code}` : ''}
                </option>
            ))}
            </select>
        )}
        </div>
    )}

    {/* Date */}
    <div style={common.field}>
        <label style={common.label}>Date *</label>
        <input
            style={common.wizardInput}
            type='date'
            value={date}
            onChange={e => setDate(e.target.value)}
            // TODO: max is computed in UTC — right after local midnight this
            // still says "yesterday" and blocks today's date. todo.md Group 6.
            max={new Date().toISOString().split('T')[0]}
        />
    </div>

    {/* Warmup Start Time */}
    <div style={common.field}>
        <label style={common.label}>Warmup Start Time</label>
        <input
        style={common.wizardInput}
        type='time'
        value={warmupStartTime}
        onChange={e => setWarmupStartTime(e.target.value)}
        />
    </div>

    {/* Start Time */}
    <div style={common.field}>
        <label style={common.label}>Start Time *</label>
        <input
        style={common.wizardInput}
        type='time'
        value={startTime}
        onChange={e => setStartTime(e.target.value)}
        />
    </div>

    {/* Stable Start Time */}
    <div style={common.field}>
        <label style={common.label}>Stable Start Time</label>
        <input
        style={common.wizardInput}
        type='time'
        value={stableStartTime}
        onChange={e => setStableStartTime(e.target.value)}
        />
    </div>

    {/* Energy Start */}
    <div style={common.field}>
        <label style={common.label}>Energy Meter Start (kWh)</label>
        <input
        style={common.wizardInput}
        type='number'
        value={energyStart}
        onChange={e => setEnergyStart(e.target.value)}
        onWheel={e => e.target.blur()}
        placeholder='e.g. 12400'
        />
    </div>

    {/* Potential Buyer */}
    <div style={common.field}>
        <label style={common.label}>Potential Buyer</label>
        <input
        style={common.wizardInput}
        type='text'
        value={potentialBuyer}
        onChange={e => setPotentialBuyer(e.target.value)}
        placeholder='Optional'
        />
    </div>

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
}
