/**
 * @file completion.e2e.test.js
 * @description End-to-end tests for the run-completion transaction: the
 * double-completion race, the material stock floor, payload validation,
 * endTime guards, cascade deletion, and the delete-vs-complete race. Talks to
 * a REAL running server and database — but a dedicated test one, never your
 * real data.
 *
 * Two terminals: `npm run dev:test` (starts a server against
 * production_tracker_test on the port from .env.test), then `npm test` (this
 * file) in another. Your normal `npm run dev` / real data are never touched —
 * assertTestDatabase.js refuses to run if DATABASE_URL isn't the test
 * database. Run `npm run seed:test` once beforehand (and any time you want to
 * reset the test database to its known baseline).
 *
 * It still creates real runs and moves real stock *in the test database*
 * while it works, deleting every run it creates and reversing every stock
 * movement — a clean pass leaves it exactly as seed-test.js left it, but a
 * crash halfway through could leave a test run behind (harmless: it's fake
 * data, just re-run `npm run seed:test` to reset).
 */
import '../lib/assertTestDatabase.js'
import prisma from '../lib/prisma.js'

const API = `http://localhost:${process.env.PORT}/api`
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

// ── Test I: delete-vs-complete race — no interleaving corrupts stock ─────────
console.log('\nI. Race: /complete vs DELETE on the same in_progress run')
const runI = (await createRun()).id
const payloadI = basePayload([{ materialId: material.id, quantityUsed: 1 }])
const [rI1, rI2] = await Promise.all([
    complete(runI, payloadI),
    fetch(`${API}/production-runs/${runI}`, { method: 'DELETE' })
])
// DELETE always succeeds: it either deletes the still-in_progress run (it won
// the lock) or deletes the just-completed run after /complete committed first
// (it lost the lock, re-read committed state, restored stock, then deleted).
check('delete always → 200', rI2.status === 200, `got ${rI2.status}`)
// /complete → 200 (won the lock) or 404 (DELETE removed the row first, so its
// updateMany matched 0 rows and hit the !exists branch) — never 409, since
// that status means racing against ANOTHER /complete, not a DELETE.
check('complete → 200 or 404, never 409/500',
    rI1.status === 200 || rI1.status === 404, `got ${rI1.status}`)
check('stock ends back at stockBefore regardless of interleaving',
    await stockNow() === stockBefore, `stock ${await stockNow()}`)
const runIGone = await prisma.productionRun.findUnique({ where: { id: runI } })
check('run no longer exists', runIGone === null)
const orphansI = await prisma.runParameterValue.count({ where: { productionRunId: runI } })
    + await prisma.materialUsage.count({ where: { productionRunId: runI } })
    + await prisma.runOutput.count({ where: { productionRunId: runI } })
check('zero orphaned child rows', orphansI === 0, `${orphansI} orphans`)

console.log(`\n${pass} passed, ${fail} failed`)
await prisma.$disconnect()
// exitCode instead of process.exit(): exit() kills the process mid-teardown and
// can trip a libuv assertion on Windows while Prisma's engine is still closing.
process.exitCode = fail === 0 ? 0 : 1
