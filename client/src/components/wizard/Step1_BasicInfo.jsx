/**
 * Renders step 1 of the production-run wizard.
 * Collects operator, machine, product, date, and setup timing fields.
 * Filters product choices through machine-product compatibility links.
 */
import { useState, useEffect } from 'react'
import { getAllOperators } from '../../api/operators'
import { getAllMachines } from '../../api/machines'
import { getMachineProducts } from '../../api/machineProducts'
import { common } from '../../styles/common'

export default function Step1_BasicInfo({ data, onNext }) {

// Form field state — initialized from data prop so if user comes back, values are preserved
const [operatorId, setOperatorId] = useState(data.operatorId || '')
const [machineId, setMachineId] = useState(data.machineId || '')
const [productId, setProductId] = useState(data.productId || '')
const [date, setDate] = useState(data.date || '')
const [startTime, setStartTime] = useState(data.startTime || '')
const [warmupStartTime, setWarmupStartTime] = useState(data.warmupStartTime || '')
const [stableStartTime, setStableStartTime] = useState(data.stableStartTime || '')
const [energyStart, setEnergyStart] = useState(data.energyStart || '')
const [potentialBuyer, setPotentialBuyer] = useState(data.potentialBuyer || '')

// Data lists fetched from API
const [operators, setOperators] = useState([])
const [machines, setMachines] = useState([])
const [products, setProducts] = useState([])

// Loading and error state
const [loadingInitial, setLoadingInitial] = useState(true)
const [loadingProducts, setLoadingProducts] = useState(false)
const [error, setError] = useState(null)

// Runs once on mount — fetch operators and machines at the same time
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

function handleNext() {
    // Validate required fields
    if (!operatorId || !machineId || !productId || !date || !startTime) {
    setError('Please fill in all required fields before continuing.')
    return
    }

    setError(null)

    // Build the data object to pass up to the parent
    const stepData = {
    operatorId,
    machineId,
    productId,
    date,
    startTime,
    // Optional fields — only include if they have a value
    ...(warmupStartTime && { warmupStartTime }),
    ...(stableStartTime && { stableStartTime }),
    ...(energyStart && { energyStart }),
    ...(potentialBuyer && { potentialBuyer }),
    }

    onNext(stepData)
}

if (loadingInitial) return <p style={common.loadingText}>Loading...</p>

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
        {/* Soft deletion: inactive operators stay in historical runs but are hidden from new-run entry. */}
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
            setProductId('')
            setProducts([])
        }}
        >
        <option value=''>Select machine...</option>
        {/* Soft deletion: inactive machines remain traceable but cannot be selected for new production. */}
        {machines.filter(m => m.active).map(machine => (
            <option key={machine.id} value={machine.id}>
                {machine.name}
            </option>
        ))}
        </select>
    </div>

    {/* Product — only shown after machine is selected */}
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
