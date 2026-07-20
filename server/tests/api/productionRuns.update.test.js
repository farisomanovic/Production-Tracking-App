/**
 * @file productionRuns.update.test.js
 * @description Tests for PUT /api/production-runs/:id — todo.md Group 3 #13:
 * the route was missing the same endTime > startTime rule /complete enforces,
 * and never checked status, so it could silently rewrite a completed run.
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
})

afterEach(async () => {
    await request(app).delete(`/api/production-runs/${runId}`)
})

const put = (payload) => request(app).put(`/api/production-runs/${runId}`).send(payload)

function completePayload() {
    return {
        endTime: new Date().toISOString(),
        parameterValues: [{ machineParameterId: machineParameter.id, value: 1 }],
        materialUsages: [{ materialId: baseline.material.id, quantityUsed: 1 }],
        outputs: [{ productId: baseline.product.id, quantityProduced: 1 }]
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

    it('rejects a non-numeric energyStart with 400 (Group 3 #12)', async () => {
        const res = await put({ energyStart: 'broken' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyStart must be a number greater than 0 when provided')
    })

    it('rejects an energyEnd of exactly 0 with 400 (Group 3 #12)', async () => {
        const res = await put({ energyEnd: 0 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be a number greater than 0 when provided')
    })

    it('rejects a negative energyEnd with 400 (Group 3 #12)', async () => {
        const res = await put({ energyEnd: -1 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be a number greater than 0 when provided')
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

    it('rejects a warmupStartTime after the run startTime (Group 6 #7)', async () => {
        const after = new Date(Date.now() + 60_000).toISOString()
        const res = await put({ warmupStartTime: after })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('warmupStartTime must be at or before the run start time')
    })

    it('rejects a stableStartTime before the run startTime (Group 6 #7)', async () => {
        const before = new Date(0).toISOString()
        const res = await put({ stableStartTime: before })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stableStartTime must be at or after the run start time')
    })

    it('accepts a warmupStartTime exactly equal to the run startTime (Group 6 #7)', async () => {
        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        const res = await put({ warmupStartTime: run.startTime.toISOString() })
        expect(res.status).toBe(200)
    })

    it('accepts a stableStartTime exactly equal to the run startTime (Group 6 #7)', async () => {
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
})
