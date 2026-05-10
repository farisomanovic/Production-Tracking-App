import { useState, useEffect } from 'react'
import { getAllOperators } from '../../api/operators'
import { getAllMachines } from '../../api/machines'
import { getMachineProducts } from '../../api/machineProducts'

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

if (loadingInitial) return <p style={styles.loadingText}>Loading...</p>

return (
    <div style={styles.container}>
    <h2 style={styles.heading}>Basic Information</h2>

    {error && <div style={styles.errorBox}>{error}</div>}

    {/* Operator */}
    <div style={styles.field}>
        <label style={styles.label}>Operator *</label>
        <select
        style={styles.input}
        value={operatorId}
        onChange={e => setOperatorId(e.target.value)}
        >
        <option value=''>Select operator...</option>
        {operators.filter(op => op.active).map(op => (
            <option key={op.id} value={op.id}>
                {op.name}
            </option>
        ))}
        </select>
    </div>

    {/* Machine */}
    <div style={styles.field}>
        <label style={styles.label}>Machine *</label>
        <select
        style={styles.input}
        value={machineId}
        onChange={e => {
            setMachineId(e.target.value)
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

    {/* Product — only shown after machine is selected */}
    {machineId && (
        <div style={styles.field}>
        <label style={styles.label}>Product *</label>
        {loadingProducts ? (
            <p style={styles.loadingText}>Loading products...</p>
        ) : (
            <select
            style={styles.input}
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
    <div style={styles.field}>
        <label style={styles.label}>Date *</label>
        <input
            style={styles.input}
            type='date'
            value={date}
            onChange={e => setDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
        />
    </div>

    {/* Start Time */}
    <div style={styles.field}>
        <label style={styles.label}>Start Time *</label>
        <input
        style={styles.input}
        type='time'
        value={startTime}
        onChange={e => setStartTime(e.target.value)}
        />
    </div>

    {/* Warmup Start Time */}
    <div style={styles.field}>
        <label style={styles.label}>Warmup Start Time</label>
        <input
        style={styles.input}
        type='time'
        value={warmupStartTime}
        onChange={e => setWarmupStartTime(e.target.value)}
        />
    </div>

    {/* Stable Start Time */}
    <div style={styles.field}>
        <label style={styles.label}>Stable Start Time</label>
        <input
        style={styles.input}
        type='time'
        value={stableStartTime}
        onChange={e => setStableStartTime(e.target.value)}
        />
    </div>

    {/* Energy Start */}
    <div style={styles.field}>
        <label style={styles.label}>Energy Meter Start (kWh)</label>
        <input
        style={styles.input}
        type='number'
        value={energyStart}
        onChange={e => setEnergyStart(e.target.value)}
        placeholder='e.g. 12400'
        />
    </div>

    {/* Potential Buyer */}
    <div style={styles.field}>
        <label style={styles.label}>Potential Buyer</label>
        <input
        style={styles.input}
        type='text'
        value={potentialBuyer}
        onChange={e => setPotentialBuyer(e.target.value)}
        placeholder='Optional'
        />
    </div>

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
errorBox: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
},
loadingText: {
    color: '#888',
    fontSize: '0.9rem',
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