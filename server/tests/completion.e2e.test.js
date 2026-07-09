/**
 * @file completion.e2e.test.js
 * @description End-to-end tests for the run-completion transaction: the
 * double-completion race, the material stock floor, payload validation,
 * endTime guards, and cascade deletion. Talks to the REAL running server and
 * database — start the dev server first (`npm run dev`), then run `npm test`
 * from server/.
 *
 * Only run this against a development database. It creates real runs and moves
 * real stock while it works — it deletes every run it creates and reverses
 * every stock movement, so a clean pass leaves the database exactly as it was,
 * but a crash halfway through could leave a test run behind.
 */
import prisma from '../lib/prisma.js'

const API = 'http://localhost:3000/api'
let pass = 0, fail = 0
function check(label, ok, detail = '') {
    if (ok) { pass++; console.log(`  PASS  ${label}`) }
    else { fail++; console.log(`  FAIL  ${label} ${detail}`) }
}
const j = (r) => r.json().catch(() => ({}))

// ── Gather a coherent id set from an existing completed run ──────────────────
const template = await prisma.productionRun.findFirst({
    where: { status: 'completed' },
    include: { runParameterValues: true }
})
if (!template) { console.error('No completed run to use as a template — aborting'); process.exit(1) }
const operator = await prisma.operator.findFirst({ where: { active: true } })
const material = await prisma.material.findFirst()
const stockBefore = material.stockQty
const machineParameterId = template.runParameterValues[0].machineParameterId
console.log(`Template run ${template.id.slice(0, 8)}…, material "${material.name}" stock ${stockBefore}`)

const basePayload = (usage) => ({
    endTime: new Date().toISOString(),
    parameterValues: [{ machineParameterId, value: 210 }],
    materialUsages: usage,
    outputs: [{ productId: template.productId, quantityProduced: 1 }],
    // Run-level weights (optional in the API) ride along so the happy paths
    // exercise their persistence too — Test H asserts they come back.
    netWeightPerUnit: 1.5, grossWeightPerUnit: 1.6, scrapKg: 2
})
async function createRun() {
    const r = await fetch(`${API}/production-runs`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            date: new Date().toISOString(), startTime: new Date().toISOString(),
            operatorId: operator.id, machineId: template.machineId,
            productId: template.productId, recipeId: template.recipeId
        })
    })
    if (r.status !== 201) throw new Error(`run creation failed: ${r.status} ${JSON.stringify(await j(r))}`)
    // Full run, not just the id: the endTime-guard tests need the exact
    // startTime the server stored.
    return r.json()
}
const complete = (id, payload) => fetch(`${API}/production-runs/${id}/complete`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
})
const stockNow = async () => (await prisma.material.findUnique({ where: { id: material.id } })).stockQty

// ── Test A: two simultaneous completions — exactly one winner ────────────────
console.log('\nA. Race: two parallel /complete calls')
const runA = (await createRun()).id
const payloadA = basePayload([{ materialId: material.id, quantityUsed: 1 }])
const [r1, r2] = await Promise.all([complete(runA, payloadA), complete(runA, payloadA)])
const statuses = [r1.status, r2.status].sort()
check('one 200 and one 409', statuses[0] === 200 && statuses[1] === 409, `got ${statuses}`)
const loser = r1.status === 409 ? r1 : r2
check('loser gets the conflict message', (await j(loser)).error === 'Production run is already completed')
check('stock decremented exactly once', await stockNow() === stockBefore - 1, `stock ${await stockNow()}`)
const children = await prisma.productionRun.findUnique({
    where: { id: runA }, include: { runParameterValues: true, materialUsages: true, runOutputs: true }
})
check('exactly one set of child rows',
    children.runParameterValues.length === 1 && children.materialUsages.length === 1 && children.runOutputs.length === 1,
    `${children.runParameterValues.length}/${children.materialUsages.length}/${children.runOutputs.length}`)

// ── Test B: sequential re-completion → 409 ───────────────────────────────────
console.log('\nB. Completing an already-completed run')
const rB = await complete(runA, payloadA)
check('sequential second completion → 409', rB.status === 409, `got ${rB.status}`)

// ── Test C: cascade delete restores stock and removes children ───────────────
console.log('\nC. Deleting the completed run (cascade + stock restore)')
const rC = await fetch(`${API}/production-runs/${runA}`, { method: 'DELETE' })
check('delete → 200', rC.status === 200, `got ${rC.status}`)
const orphans = await prisma.runParameterValue.count({ where: { productionRunId: runA } })
    + await prisma.materialUsage.count({ where: { productionRunId: runA } })
    + await prisma.runOutput.count({ where: { productionRunId: runA } })
check('children removed by DB cascade', orphans === 0, `${orphans} orphans`)
check('stock restored', await stockNow() === stockBefore, `stock ${await stockNow()}`)

// ── Test D: insufficient stock blocks completion atomically ──────────────────
console.log('\nD. Insufficient stock')
const runD = (await createRun()).id
const rD = await complete(runD, basePayload([{ materialId: material.id, quantityUsed: stockBefore + 999999 }]))
const bodyD = await j(rD)
check('completion → 409', rD.status === 409, `got ${rD.status}`)
check('message names the material', (bodyD.error || '').includes(material.name), bodyD.error)
const runDState = await prisma.productionRun.findUnique({ where: { id: runD }, include: { runParameterValues: true } })
check('run still in_progress, no partial children',
    runDState.status === 'in_progress' && runDState.runParameterValues.length === 0)
check('stock untouched', await stockNow() === stockBefore)

// ── Test E: payload validation → 400 before anything happens ─────────────────
console.log('\nE. Validation')
const cases = [
    ['negative quantityUsed', basePayload([{ materialId: material.id, quantityUsed: -5 }])],
    ['string quantityUsed', basePayload([{ materialId: material.id, quantityUsed: '5' }])],
    ['zero quantityProduced', { ...basePayload([]), outputs: [{ productId: template.productId, quantityProduced: 0 }] }],
    ['non-numeric parameter value', { ...basePayload([]), parameterValues: [{ machineParameterId, value: 'hot' }] }],
    ['negative scrapKg', { ...basePayload([]), scrapKg: -1 }],
    ['negative netWeightPerUnit', { ...basePayload([]), netWeightPerUnit: -0.5 }],
    ['string grossWeightPerUnit', { ...basePayload([]), grossWeightPerUnit: 'heavy' }],
    ['unknown material', basePayload([{ materialId: 'no-such-material', quantityUsed: 1 }])]
]
for (const [label, payload] of cases) {
    const r = await complete(runD, payload)
    check(`${label} → 400`, r.status === 400, `got ${r.status}: ${JSON.stringify(await j(r))}`)
}
check('stock still untouched after validation attempts', await stockNow() === stockBefore)
await fetch(`${API}/production-runs/${runD}`, { method: 'DELETE' })

// ── Test F: DB CHECK constraint is the backstop ──────────────────────────────
console.log('\nF. CHECK constraint backstop (raw SQL bypassing the app)')
let checkFired = false
try {
    await prisma.$executeRawUnsafe('UPDATE "Material" SET "stockQty" = -1 WHERE id = $1', material.id)
} catch (e) {
    checkFired = /stockQty_nonnegative|check constraint/i.test(String(e.message))
}
check('direct negative write rejected by Postgres', checkFired)
check('stock value unchanged', await stockNow() === stockBefore)

// ── Test G: materials PUT guards ─────────────────────────────────────────────
console.log('\nG. Materials route stock guards')
const put = (body) => fetch(`${API}/materials/${material.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
})
const rG1 = await put({ stockDelta: -(stockBefore + 1000) })
check('overdrawing stockDelta → 409', rG1.status === 409, `got ${rG1.status}`)
const rG2 = await put({ stockQty: -5 })
check('negative stockQty → 400', rG2.status === 400, `got ${rG2.status}`)
const rG3 = await put({ stockDelta: 2 })
const rG4 = await put({ stockDelta: -2 })
check('normal delivery + correction still work', rG3.status === 200 && rG4.status === 200,
    `got ${rG3.status}/${rG4.status}`)
check('stock back to start', await stockNow() === stockBefore, `stock ${await stockNow()}`)

// ── Test H: endTime guards — a run cannot end at/before its start ────────────
console.log('\nH. endTime guards (overnight-run backstop)')
const runH = await createRun()
const hourBefore = new Date(new Date(runH.startTime).getTime() - 3600_000).toISOString()
const rH1 = await complete(runH.id, { ...basePayload([]), endTime: hourBefore })
check('endTime before startTime → 400', rH1.status === 400, `got ${rH1.status}`)
// Echo the stored startTime back verbatim: proves the rule is <=, not just <.
const rH2 = await complete(runH.id, { ...basePayload([]), endTime: runH.startTime })
check('endTime equal to startTime → 400', rH2.status === 400, `got ${rH2.status}`)
const rH3 = await complete(runH.id, { ...basePayload([]), endTime: 'banana' })
check('unparseable endTime → 400', rH3.status === 400, `got ${rH3.status}`)
const runHState = await prisma.productionRun.findUnique({ where: { id: runH.id } })
check('run still in_progress after rejected attempts', runHState.status === 'in_progress')
const rH4 = await complete(runH.id, basePayload([]))
check('valid later endTime still completes → 200', rH4.status === 200, `got ${rH4.status}`)
const bodyH = await j(rH4)
check('run-level weights persisted',
    bodyH.netWeightPerUnit === 1.5 && bodyH.grossWeightPerUnit === 1.6 && bodyH.scrapKg === 2,
    `got ${bodyH.netWeightPerUnit}/${bodyH.grossWeightPerUnit}/${bodyH.scrapKg}`)
check('outputs carry no weight fields',
    bodyH.runOutputs?.[0]?.grossWeightKg === undefined && bodyH.runOutputs?.[0]?.scrapKg === undefined)
await fetch(`${API}/production-runs/${runH.id}`, { method: 'DELETE' })

console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
// exitCode instead of process.exit(): exit() kills the process mid-teardown and
// can trip a libuv assertion on Windows while Prisma's engine is still closing.
process.exitCode = fail === 0 ? 0 : 1
