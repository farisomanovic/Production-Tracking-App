/**
 * @file productionRuns.create.test.js
 * @description Tests for POST /api/production-runs — the relational
 * validation matrix from PR #24 (machine/product/recipe wiring, inactive
 * entities, busy machine) plus the date guards. Completion and deletion are
 * covered by completion.e2e.test.js, not here.
 *
 * Fixtures created directly via prisma with the VT-RUNS prefix: an inactive
 * operator, an inactive machine, a product NOT linked to any machine, and a
 * recipe belonging to that unlinked product. A validPayload() built from
 * baseline ids is the reference point — every failure test breaks exactly
 * one field, so a 400 can only mean the field under test caused it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-RUNS'

let baseline
let inactiveOperator
let inactiveMachine
let unlinkedProduct
let recipeOfUnlinkedProduct
let inactiveRecipe

async function cleanup(machineId) {
    // in_progress runs on the baseline machine can only be leftovers from a
    // crashed previous run of this file (the seed's template run is completed).
    // Their child rows are removed by ON DELETE CASCADE.
    await prisma.productionRun.deleteMany({ where: { machineId, status: 'in_progress' } })
    // FK order: RecipeProduct references both recipe and product.
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.operator.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    baseline = await getBaseline()
    await cleanup(baseline.machine.id)
    inactiveOperator = await prisma.operator.create({
        data: { name: `${PREFIX} inactive operator`, active: false }
    })
    inactiveMachine = await prisma.machine.create({
        data: { name: `${PREFIX} inactive machine`, code: `${PREFIX}-M-INACTIVE`, active: false }
    })
    unlinkedProduct = await prisma.product.create({
        data: { name: `${PREFIX} unlinked product`, code: `${PREFIX}-P2`, unit: 'kg' }
    })
    recipeOfUnlinkedProduct = await prisma.recipe.create({
        data: { name: `${PREFIX} other recipe`, products: { create: [{ productId: unlinkedProduct.id }] } }
    })
    inactiveRecipe = await prisma.recipe.create({
        data: { name: `${PREFIX} inactive recipe`, active: false, products: { create: [{ productId: baseline.product.id }] } }
    })
})

afterAll(async () => {
    await cleanup(baseline.machine.id)
})

function validPayload() {
    return {
        date: new Date().toISOString(),
        startTime: new Date().toISOString(),
        operatorId: baseline.operator.id,
        machineId: baseline.machine.id,
        productId: baseline.product.id,
        recipeId: baseline.recipe.id
    }
}

const post = (payload) => request(app).post('/api/production-runs').send(payload)

describe('POST /api/production-runs — required fields and dates', () => {
    it('rejects a missing recipeId with 400', async () => {
        const res = await post({ ...validPayload(), recipeId: undefined })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('date, startTime, operatorId, machineId, productId and recipeId are required')
    })

    it('rejects an unparseable date with 400', async () => {
        const res = await post({ ...validPayload(), date: 'banana' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('date is not a valid timestamp')
    })

    it('rejects an unparseable startTime with 400', async () => {
        const res = await post({ ...validPayload(), startTime: 'banana' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('startTime is not a valid timestamp')
    })

    it('rejects a future date with 400', async () => {
        const dayAfterTomorrow = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
        const res = await post({ ...validPayload(), date: dayAfterTomorrow })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Production run date cannot be in the future')
    })

    it('rejects an explicit null warmupStartTime with 400', async () => {
        const res = await post({ ...validPayload(), warmupStartTime: null })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('warmupStartTime is not a valid timestamp')
    })

    it('rejects an explicit null stableStartTime with 400', async () => {
        const res = await post({ ...validPayload(), stableStartTime: null })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stableStartTime is not a valid timestamp')
    })

    it('rejects a non-string warmupStartTime (e.g. a number) with 400', async () => {
        const res = await post({ ...validPayload(), warmupStartTime: 12345 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('warmupStartTime is not a valid timestamp')
    })
})

describe('POST /api/production-runs — warmup/stable ordering (Group 6 #7)', () => {
    it('rejects a warmupStartTime after startTime with 400', async () => {
        const payload = validPayload()
        const after = new Date(new Date(payload.startTime).getTime() + 60_000).toISOString()
        const res = await post({ ...payload, warmupStartTime: after })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('warmupStartTime must be at or before startTime')
    })

    it('rejects a stableStartTime before startTime with 400', async () => {
        const payload = validPayload()
        const before = new Date(new Date(payload.startTime).getTime() - 60_000).toISOString()
        const res = await post({ ...payload, stableStartTime: before })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stableStartTime must be at or after startTime')
    })

    it('accepts a warmupStartTime exactly equal to startTime', async () => {
        const payload = validPayload()
        const res = await post({ ...payload, warmupStartTime: payload.startTime })
        expect(res.status).toBe(201)
        const del = await request(app).delete(`/api/production-runs/${res.body.id}`)
        expect(del.status).toBe(200)
    })

    it('accepts a stableStartTime exactly equal to startTime', async () => {
        const payload = validPayload()
        const res = await post({ ...payload, stableStartTime: payload.startTime })
        expect(res.status).toBe(201)
        const del = await request(app).delete(`/api/production-runs/${res.body.id}`)
        expect(del.status).toBe(200)
    })

    it('accepts a normal valid ordering: warmup before start, stable after start', async () => {
        const payload = validPayload()
        const startMs = new Date(payload.startTime).getTime()
        const res = await post({
            ...payload,
            warmupStartTime: new Date(startMs - 5 * 60_000).toISOString(),
            stableStartTime: new Date(startMs + 5 * 60_000).toISOString()
        })
        expect(res.status).toBe(201)
        const del = await request(app).delete(`/api/production-runs/${res.body.id}`)
        expect(del.status).toBe(200)
    })
})

describe('POST /api/production-runs — energyStart type validation (Group 3 #12)', () => {
    it('rejects a non-numeric energyStart with 400', async () => {
        const res = await post({ ...validPayload(), energyStart: 'broken' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyStart must be a number greater than 0 when provided')
    })

    it('rejects a negative energyStart with 400', async () => {
        const res = await post({ ...validPayload(), energyStart: -5 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyStart must be a number greater than 0 when provided')
    })

    it('rejects an energyStart of exactly 0 with 400', async () => {
        const res = await post({ ...validPayload(), energyStart: 0 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyStart must be a number greater than 0 when provided')
    })

    it('accepts a valid energyStart', async () => {
        const res = await post({ ...validPayload(), energyStart: 100 })
        expect(res.status).toBe(201)
        expect(res.body.energyStart).toBe(100)
        const del = await request(app).delete(`/api/production-runs/${res.body.id}`)
        expect(del.status).toBe(200)
    })
})

describe('POST /api/production-runs — relational validation (PR #24)', () => {
    it('rejects an unknown operatorId with 400', async () => {
        const res = await post({ ...validPayload(), operatorId: crypto.randomUUID() })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Operator is inactive or does not exist')
    })

    it('rejects an inactive operator with 400', async () => {
        const res = await post({ ...validPayload(), operatorId: inactiveOperator.id })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Operator is inactive or does not exist')
    })

    it('rejects an unknown machineId with 400', async () => {
        const res = await post({ ...validPayload(), machineId: crypto.randomUUID() })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Machine is inactive or does not exist')
    })

    it('rejects an inactive machine with 400', async () => {
        const res = await post({ ...validPayload(), machineId: inactiveMachine.id })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Machine is inactive or does not exist')
    })

    it('rejects a product not linked to the machine with 400', async () => {
        const res = await post({ ...validPayload(), productId: unlinkedProduct.id })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('This product is not assigned to the selected machine')
    })

    it('rejects an unknown recipeId with 400', async () => {
        const res = await post({ ...validPayload(), recipeId: crypto.randomUUID() })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Recipe does not exist')
    })

    it('rejects an inactive recipe with 400', async () => {
        const res = await post({ ...validPayload(), recipeId: inactiveRecipe.id })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Recipe is inactive')
    })

    it("rejects another product's recipe with 400", async () => {
        const res = await post({ ...validPayload(), recipeId: recipeOfUnlinkedProduct.id })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Recipe does not belong to the selected product')
    })
})

describe('POST /api/production-runs — happy path and busy machine', () => {
    it('creates an in_progress run with relations included', async () => {
        const res = await post(validPayload())
        expect(res.status).toBe(201)
        expect(res.body.status).toBe('in_progress')
        expect(res.body.operator.id).toBe(baseline.operator.id)
        expect(res.body.machine.id).toBe(baseline.machine.id)
        expect(res.body.product.id).toBe(baseline.product.id)
        expect(res.body.recipe.id).toBe(baseline.recipe.id)
        // Free the machine again — later tests (and other files) assume the
        // baseline machine has no run in progress.
        const del = await request(app).delete(`/api/production-runs/${res.body.id}`)
        expect(del.status).toBe(200)
    })

    it('rejects a run while the machine already has one in progress', async () => {
        // Arrange the busy state directly via prisma — this test owns it
        // end-to-end and removes it before finishing.
        const busyRun = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                operatorId: baseline.operator.id,
                machineId: baseline.machine.id,
                productId: baseline.product.id,
                recipeId: baseline.recipe.id
            }
        })
        const res = await post(validPayload())
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Machine already has a run in progress')
        await prisma.productionRun.delete({ where: { id: busyRun.id } })
    })
})

describe('POST /api/production-runs — concurrent race on the same machine', () => {
    it('lets exactly one of two simultaneous requests win; the loser gets 409, not 400', async () => {
        const payload = validPayload()
        const [first, second] = await Promise.all([post(payload), post(payload)])

        const statuses = [first.status, second.status].sort()
        expect(statuses).toEqual([201, 409])

        const winner = first.status === 201 ? first : second
        const loser = first.status === 201 ? second : first
        expect(loser.body.error).toBe('Machine already has a run in progress')

        const inProgressRuns = await prisma.productionRun.findMany({
            where: { machineId: baseline.machine.id, status: 'in_progress' }
        })
        expect(inProgressRuns).toHaveLength(1)
        expect(inProgressRuns[0].id).toBe(winner.body.id)

        const del = await request(app).delete(`/api/production-runs/${winner.body.id}`)
        expect(del.status).toBe(200)
    })
})
