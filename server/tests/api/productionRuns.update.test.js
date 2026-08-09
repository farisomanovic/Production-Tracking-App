/**
 * @file productionRuns.update.test.js
 * @description Tests for PUT /api/production-runs/:id —
 * the route was missing the same endTime > startTime rule /complete enforces,
 * and never checked status, so it could silently rewrite a completed run.
 * The concurrency block at the bottom covers the completed-run race: that status
 * check used to be a separate read from the write, so a run completed in
 * between was edited anyway.
 * Fixtures follow productionRuns.complete.test.js's conventions.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-UPDATE'

let baseline
let machineParameter
let runId
let runStartTime

beforeAll(async () => {
    baseline = await getBaseline()
    machineParameter = await prisma.machineParameter.findFirstOrThrow({ where: { machineId: baseline.machine.id } })
})

afterAll(async () => {
    await prisma.productionRun.deleteMany({ where: { machineId: baseline.machine.id, status: 'in_progress' } })
})

beforeEach(async () => {
    const run = await prisma.productionRun.create({
        data: {
            date: new Date(),
            startTime: new Date(),
            operatorId: baseline.operator.id,
            machineId: baseline.machine.id,
            productId: baseline.product.id,
            recipeId: baseline.recipe.id
        }
    })
    runId = run.id
    runStartTime = run.startTime
})

afterEach(async () => {
    await request(app).delete(`/api/production-runs/${runId}`)
})

const put = (payload) => request(app).put(`/api/production-runs/${runId}`).send(payload)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Runs `mutate` against the test run inside a transaction that then STOPS,
 * holding the row's write lock until `release()` is called. That lock is what
 * makes the check-then-write window below reproducible instead of a coin flip.
 * Await `lockAcquired` before racing anything against it — otherwise the racer
 * could get in before the mutation has even been issued.
 */
function holdRunLocked(mutate) {
    let release
    let markAcquired
    const held = new Promise(resolve => { release = resolve })
    const lockAcquired = new Promise(resolve => { markAcquired = resolve })
    const settled = prisma.$transaction(async (tx) => {
        await mutate(tx)
        markAcquired()
        await held
    })
    return { lockAcquired, release: () => release(), settled }
}

// Same startTime-derived endTime as productionRuns.complete.test.js's
// validPayload, and for the same reason — see the comment there.
function completePayload() {
    return {
        endTime: new Date(runStartTime.getTime() + 60_000).toISOString(),
        parameterValues: [{ machineParameterId: machineParameter.id, value: 1 }],
        materialUsages: [{ materialId: baseline.material.id, quantityUsed: 1 }],
        quantityProduced: 1
    }
}

describe('PUT /api/production-runs/:id', () => {
    it('updates mutable fields on an in_progress run', async () => {
        const res = await put({ potentialBuyer: `${PREFIX} buyer` })
        expect(res.status).toBe(200)
        expect(res.body.potentialBuyer).toBe(`${PREFIX} buyer`)
    })

    it('updates warmupStartTime, stableStartTime, energyStart, energyEnd, and notes', async () => {
        const res = await put({
            // Offset well clear of the run's startTime (set to "now" in beforeEach)
            // so this doesn't collide with the warmup/stable ordering check below.
            warmupStartTime: new Date(Date.now() - 10 * 60_000).toISOString(),
            stableStartTime: new Date(Date.now() + 10 * 60_000).toISOString(),
            energyStart: 10,
            energyEnd: 20,
            notes: `${PREFIX} note`
        })
        expect(res.status).toBe(200)
        expect(res.body.energyStart).toBe(10)
        expect(res.body.energyEnd).toBe(20)
        expect(res.body.notes).toBe(`${PREFIX} note`)
    })

    it('rejects a numeric notes with 400', async () => {
        const res = await put({ notes: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('notes must be a string')
    })

    it('rejects a numeric potentialBuyer with 400', async () => {
        const res = await put({ potentialBuyer: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('potentialBuyer must be a string')
    })

    it('rejects a non-numeric energyStart with 400', async () => {
        const res = await put({ energyStart: 'broken' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyStart must be a number of at least 0 when provided')
    })

    it('rejects a negative energyStart with 400', async () => {
        const res = await put({ energyStart: -1 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyStart must be a number of at least 0 when provided')
    })

    // 0 is a real reading on a meter that was just installed or replaced, so
    // it must persist as 0 rather than being rejected (Group 7 #32).
    it('accepts an energyEnd of exactly 0 (Group 7 #32)', async () => {
        const res = await put({ energyEnd: 0 })
        expect(res.status).toBe(200)
        expect(res.body.energyEnd).toBe(0)
    })

    it('rejects a negative energyEnd with 400', async () => {
        const res = await put({ energyEnd: -1 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be a number of at least 0 when provided')
    })

    it('rejects an endTime at or before the run startTime', async () => {
        const res = await put({ endTime: new Date(0).toISOString() })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('endTime must be after the run start time')
    })

    it('rejects an explicit null warmupStartTime with 400', async () => {
        const res = await put({ warmupStartTime: null })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('warmupStartTime is not a valid timestamp')
    })

    it('rejects an explicit null stableStartTime with 400', async () => {
        const res = await put({ stableStartTime: null })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stableStartTime is not a valid timestamp')
    })

    it('rejects an explicit null endTime with 400', async () => {
        const res = await put({ endTime: null })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('endTime is not a valid timestamp')
    })

    it('accepts an endTime after the run startTime', async () => {
        const future = new Date(Date.now() + 60_000).toISOString()
        const res = await put({ endTime: future })
        expect(res.status).toBe(200)
        expect(new Date(res.body.endTime).toISOString()).toBe(future)
    })

    it('rejects a warmupStartTime after the run startTime', async () => {
        const after = new Date(Date.now() + 60_000).toISOString()
        const res = await put({ warmupStartTime: after })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('warmupStartTime must be at or before the run start time')
    })

    it('rejects a stableStartTime before the run startTime', async () => {
        const before = new Date(0).toISOString()
        const res = await put({ stableStartTime: before })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stableStartTime must be at or after the run start time')
    })

    it('accepts a warmupStartTime exactly equal to the run startTime', async () => {
        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        const res = await put({ warmupStartTime: run.startTime.toISOString() })
        expect(res.status).toBe(200)
    })

    it('accepts a stableStartTime exactly equal to the run startTime', async () => {
        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        const res = await put({ stableStartTime: run.startTime.toISOString() })
        expect(res.status).toBe(200)
    })

    it('returns 404 for an unknown run id', async () => {
        const res = await request(app)
            .put('/api/production-runs/00000000-0000-0000-0000-000000000000')
            .send({ notes: 'x' })
        expect(res.status).toBe(404)
    })

    it('rejects any edit to an already-completed run', async () => {
        const completeRes = await request(app).post(`/api/production-runs/${runId}/complete`).send(completePayload())
        expect(completeRes.status).toBe(200)

        const res = await put({ notes: `${PREFIX} should not apply` })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('Production run is already completed')
    })

    // Sharper than the test above, and it guards a DIFFERENT line. That one
    // sends `notes`, so `data` is non-empty and the compare-and-swap refuses it.
    // A body of nothing but completion-written fields leaves `data` EMPTY, which
    // skips the compare-and-swap altogether — so the route's pre-read status
    // check is the only guard on this path, and deleting it would turn a
    // correction attempt into a 200 that silently changed nothing. This is the
    // shape a future edit screen would send if it wired the quantity field to
    // the client's updateRun helper.
    it('rejects a completed-run edit whose only field is quantityProduced', async () => {
        const completeRes = await request(app).post(`/api/production-runs/${runId}/complete`).send(completePayload())
        expect(completeRes.status).toBe(200)

        const res = await put({ quantityProduced: 999 })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('Production run is already completed')

        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        expect(run.quantityProduced).toBe(1)
    })

    // A body with nothing updatable in it writes no fields, and Prisma's
    // updateMany reports count: 0 for an empty `data` even when the row matched
    // — this pins the route's long-standing no-op 200 so the compare-and-swap
    // below can never misreport it as a conflict.
    it('treats a PUT with no updatable fields as a no-op 200', async () => {
        const res = await put({})
        expect(res.status).toBe(200)
        expect(res.body.id).toBe(runId)
        expect(res.body.status).toBe('in_progress')
    })

    // quantityProduced is written exactly once, by /complete. Pinning the
    // silence here makes it a decision rather than an accident of the
    // destructure: the field is a known column of this model, so "the route
    // happens not to read it" and "the route refuses to write it" look identical
    // from the outside until something asserts the difference. Note the DB would
    // ALLOW this write (the CHECK only bars a null quantity on a completed run),
    // so nothing but the route stops it.
    it('ignores a quantityProduced sent to an in_progress run', async () => {
        const res = await put({ quantityProduced: 999 })
        expect(res.status).toBe(200)

        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        expect(run.quantityProduced).toBeNull()
    })

    /*
     * ── The completed-run guard must BE the write ────────────────────────────
     *
     * A plain Promise.all([put, complete]) proves nothing when it passes — it
     * may simply never interleave inside the window. These two tests force the
     * interleaving with a real Postgres row lock: an uncommitted transaction
     * holds the run's row, so the route's own pre-read (a plain SELECT, which
     * under READ COMMITTED does NOT block on a row lock) is guaranteed to see
     * the pre-change snapshot, pass its status check, and then park on the
     * write until the adversary commits.
     *
     * Known limitation, stated so nobody over-trusts these: if the pre-read
     * were ever scheduled after the adversary's commit, the route would return
     * the same status for the boring reason. They can MISS a regression here;
     * they cannot report one that isn't there.
     */
    it('rejects an edit to a run that completes while the request is in flight', async () => {
        const adversary = holdRunLocked(tx => tx.productionRun.update({
            where: { id: runId },
            // quantityProduced rides along because the DB's
            // ProductionRun_quantityProduced_valid CHECK refuses a completed
            // run without one — the adversary has to look like a
            // real completion, not just a status flip.
            data: { status: 'completed', endTime: new Date(Date.now() + 60_000), quantityProduced: 1 }
        }))
        await adversary.lockAcquired

        // .then() is what actually issues a supertest request — without it the
        // Test object sits idle until awaited and nothing would be racing.
        const pending = put({ notes: `${PREFIX} raced` }).then(res => res)
        await sleep(150)
        adversary.release()
        await adversary.settled

        const res = await pending
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('Production run is already completed')

        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        expect(run.status).toBe('completed')
        expect(run.notes).toBeNull()
    })

    it('returns 404 for a run deleted while the request is in flight', async () => {
        const adversary = holdRunLocked(tx => tx.productionRun.delete({ where: { id: runId } }))
        await adversary.lockAcquired

        const pending = put({ notes: `${PREFIX} raced` }).then(res => res)
        await sleep(150)
        adversary.release()
        await adversary.settled

        const res = await pending
        expect(res.status).toBe(404)
    })
})

/*
 * ── The energy pair, not each reading on its own ─────────────────────────────
 *
 * The two guards above only ever asked whether each reading was a number ≥ 0.
 * A kWh totalizer climbs, so the pair carries a rule neither field can state
 * alone — and because this route accepts either field in isolation, the rule
 * has to hold against the pair the row ENDS UP with, not just against whatever
 * the body happened to carry. Hence the stored-side cases below.
 */
describe('PUT /api/production-runs/:id — energy pair ordering', () => {
    it('rejects a body carrying an energyEnd below its own energyStart', async () => {
        const res = await put({ energyStart: 100, energyEnd: 50 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be at or above energyStart')
    })

    it('rejects an energyEnd below the run\'s stored energyStart', async () => {
        await prisma.productionRun.update({ where: { id: runId }, data: { energyStart: 100 } })

        const res = await put({ energyEnd: 50 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be at or above energyStart')

        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        expect(run.energyEnd).toBeNull()
    })

    it('rejects an energyStart above the run\'s stored energyEnd', async () => {
        await prisma.productionRun.update({ where: { id: runId }, data: { energyEnd: 200 } })

        const res = await put({ energyStart: 300 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be at or above energyStart')

        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        expect(run.energyStart).toBeNull()
    })

    // The meter did not move — a short run, or one on a counter whose resolution
    // is coarser than what it consumed. Zero consumption is a real measurement,
    // so the rule is >=, not >.
    it('accepts an equal pair', async () => {
        const res = await put({ energyStart: 100, energyEnd: 100 })
        expect(res.status).toBe(200)
        expect(res.body.energyStart).toBe(100)
        expect(res.body.energyEnd).toBe(100)
    })

    // The regression this pins: comparing against a missing end reading coerces
    // null to 0, which turns an ordinary "record the start reading" edit into a
    // 400 on every run that has not been completed yet — i.e. all of them.
    it('accepts an energyStart on a run with no energyEnd yet', async () => {
        const res = await put({ energyStart: 100 })
        expect(res.status).toBe(200)
        expect(res.body.energyStart).toBe(100)
        expect(res.body.energyEnd).toBeNull()
    })
})
