/**
 * @file productionRuns.complete.test.js
 * @description Tests for POST /api/production-runs/:id/complete — the
 * relational validation: parameterValues and
 * materialUsages ids must belong to the run's own machine/recipe, not just
 * exist somewhere in the database. Duplicate ids within one payload are also
 * rejected before they can hit a @@unique constraint mid-transaction. Since
 * the single-output migration this file also covers the scalar `quantityProduced`
 * that replaced the outputs array, including the DB CHECK standing behind it.
 * The rest of /complete's behavior (races, stock floor, cascade delete,
 * endTime guards) is covered by productionRuns.stockRace.test.js, not here.
 *
 * Fixtures created directly via prisma with the VT-COMPLETE prefix: a second
 * machine + parameter (for a machineParameterId foreign to the baseline
 * machine), a material outside the baseline recipe, and a third machine with
 * zero linked parameters (its own product/recipe). A fresh
 * in_progress run on the baseline machine is created before each test and
 * cleaned up through the DELETE route after, so a rejected /complete (which
 * leaves the run in_progress) never leaks into the next test.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-COMPLETE'

let baseline
let machineParameter
let foreignMachineParameter
let rogueMaterial
let zeroParamMachine
let zeroParamProduct
let zeroParamRecipe
let runId
let runStartTime

async function cleanupFixtures(machineId) {
    await prisma.productionRun.deleteMany({ where: { machineId, status: 'in_progress' } })
    await prisma.productionRun.deleteMany({ where: { machine: { code: { startsWith: PREFIX } }, status: 'in_progress' } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.machineProduct.deleteMany({ where: { product: { code: { startsWith: PREFIX } } } })
    await prisma.machineParameter.deleteMany({ where: { parameter: { name: { startsWith: PREFIX } } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.parameter.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.material.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    baseline = await getBaseline()
    await cleanupFixtures(baseline.machine.id)

    machineParameter = await prisma.machineParameter.findFirstOrThrow({ where: { machineId: baseline.machine.id } })

    const foreignMachine = await prisma.machine.create({ data: { name: `${PREFIX} foreign machine`, code: `${PREFIX}-M2` } })
    const foreignParameter = await prisma.parameter.create({ data: { name: `${PREFIX} foreign parameter`, unit: 'C' } })
    foreignMachineParameter = await prisma.machineParameter.create({
        data: { machineId: foreignMachine.id, parameterId: foreignParameter.id }
    })
    rogueMaterial = await prisma.material.create({ data: { name: `${PREFIX} rogue material`, unit: 'kg', stockQty: 1000 } })

    // A machine with zero MachineParameter links — no parameter
    // row is created for it, unlike every other machine in this file.
    zeroParamMachine = await prisma.machine.create({ data: { name: `${PREFIX} zero-param machine`, code: `${PREFIX}-M3` } })
    zeroParamProduct = await prisma.product.create({ data: { name: `${PREFIX} zero-param product`, code: `${PREFIX}-P3`, unit: 'kg' } })
    await prisma.machineProduct.create({ data: { machineId: zeroParamMachine.id, productId: zeroParamProduct.id } })
    zeroParamRecipe = await prisma.recipe.create({
        data: { name: `${PREFIX} zero-param recipe`, products: { create: [{ productId: zeroParamProduct.id }] } }
    })
})

afterAll(async () => {
    await cleanupFixtures(baseline.machine.id)
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
    // Goes through the real route so a completed run's stock is restored the
    // same way any other /complete + DELETE pair would restore it.
    await request(app).delete(`/api/production-runs/${runId}`)
})

// endTime is derived from the run's own startTime, never from a second
// new Date(). /complete rejects an endTime at or BEFORE startTime, and the two
// wall-clock reads are separated by a single INSERT — often fast enough to land
// in the same millisecond. That made ~5% of suite runs fail on whichever test
// happened to be running, always blaming the rule it never reached.
function validPayload() {
    return {
        endTime: new Date(runStartTime.getTime() + 60_000).toISOString(),
        parameterValues: [{ machineParameterId: machineParameter.id, value: 1 }],
        materialUsages: [{ materialId: baseline.material.id, quantityUsed: 1 }],
        quantityProduced: 1
    }
}

const complete = (payload) => request(app).post(`/api/production-runs/${runId}/complete`).send(payload)

describe('POST /api/production-runs/:id/complete — notes validation', () => {
    it('rejects a numeric notes with 400', async () => {
        const res = await complete({ ...validPayload(), notes: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('notes must be a string')
    })
})

describe('POST /api/production-runs/:id/complete — endTime type validation', () => {
    it('rejects a numeric endTime with 400 instead of completing the run', async () => {
        const res = await complete({ ...validPayload(), endTime: 1789000000000 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('endTime is not a valid timestamp')
        const run = await prisma.productionRun.findUnique({ where: { id: runId } })
        expect(run.status).toBe('in_progress')
    })

    it('rejects an explicit null endTime with 400', async () => {
        const res = await complete({ ...validPayload(), endTime: null })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('endTime is required to complete a run')
    })

    it('rejects a naive (no timezone) endTime with 400', async () => {
        const res = await complete({ ...validPayload(), endTime: '2026-07-04T09:00:00.000' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('endTime must include a timezone (e.g. end in "Z")')
        const run = await prisma.productionRun.findUnique({ where: { id: runId } })
        expect(run.status).toBe('in_progress')
    })
})

describe('POST /api/production-runs/:id/complete — relational validation', () => {
    it('rejects a machineParameterId belonging to another machine', async () => {
        const res = await complete({
            ...validPayload(),
            parameterValues: [{ machineParameterId: foreignMachineParameter.id, value: 1 }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe("One or more parameterValues reference a machine parameter that does not belong to this run's machine")
    })

    it('rejects a duplicate machineParameterId within one payload', async () => {
        const res = await complete({
            ...validPayload(),
            parameterValues: [
                { machineParameterId: machineParameter.id, value: 1 },
                { machineParameterId: machineParameter.id, value: 2 }
            ]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('parameterValues contains a duplicate machineParameterId')
    })

    it("rejects a materialId outside the run's recipe", async () => {
        const res = await complete({
            ...validPayload(),
            materialUsages: [{ materialId: rogueMaterial.id, quantityUsed: 1 }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe("One or more materialUsages reference a material that is not part of this run's recipe")
    })

    it('rejects a duplicate materialId within materialUsages', async () => {
        const res = await complete({
            ...validPayload(),
            materialUsages: [
                { materialId: baseline.material.id, quantityUsed: 1 },
                { materialId: baseline.material.id, quantityUsed: 2 }
            ]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('materialUsages contains a duplicate materialId')
    })

    // Re-anchored to a foreign machineParameterId when the single-output work
    // removed the
    // outputs array this used to be rejected by: the point of the test is that
    // ANY rejection leaves nothing half-written, not which rule did the
    // rejecting. The parameter values are the last thing validated before the
    // transaction, so they are the closest equivalent trigger.
    it('leaves the run in_progress with no partial child rows after a rejection', async () => {
        await complete({
            ...validPayload(),
            parameterValues: [{ machineParameterId: foreignMachineParameter.id, value: 1 }]
        })
        const run = await prisma.productionRun.findUnique({
            where: { id: runId },
            include: { runParameterValues: true, materialUsages: true }
        })
        expect(run.status).toBe('in_progress')
        expect(run.quantityProduced).toBeNull()
        expect(run.runParameterValues).toHaveLength(0)
        expect(run.materialUsages).toHaveLength(0)
    })

    it("accepts a payload where every id genuinely belongs to the run's machine/recipe", async () => {
        const res = await complete(validPayload())
        expect(res.status).toBe(200)
        expect(res.body.status).toBe('completed')
    })
})

describe('POST /api/production-runs/:id/complete — zero-parameter machine', () => {
    it('completes with an empty parameterValues array when the machine has no linked parameters', async () => {
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                operatorId: baseline.operator.id,
                machineId: zeroParamMachine.id,
                productId: zeroParamProduct.id,
                recipeId: zeroParamRecipe.id
            }
        })
        // Own run, so it needs the same startTime-derived endTime validPayload uses.
        const res = await request(app).post(`/api/production-runs/${run.id}/complete`).send({
            endTime: new Date(run.startTime.getTime() + 60_000).toISOString(),
            parameterValues: [],
            quantityProduced: 1
        })
        expect(res.status).toBe(200)
        expect(res.body.status).toBe('completed')
        await request(app).delete(`/api/production-runs/${run.id}`)
    })

    it('still rejects an empty parameterValues array for a machine that has linked parameters', async () => {
        const res = await complete({ ...validPayload(), parameterValues: [] })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('At least one parameter value is required')
    })
})

describe('POST /api/production-runs/:id/complete — energyEnd type validation', () => {
    it('rejects a non-numeric energyEnd with 400 instead of aborting the transaction', async () => {
        const res = await complete({ ...validPayload(), energyEnd: 'broken' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be a number of at least 0 when provided')
        const run = await prisma.productionRun.findUnique({ where: { id: runId } })
        expect(run.status).toBe('in_progress')
    })

    it('rejects a negative energyEnd with 400 instead of aborting the transaction', async () => {
        const res = await complete({ ...validPayload(), energyEnd: -1 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be a number of at least 0 when provided')
        const run = await prisma.productionRun.findUnique({ where: { id: runId } })
        expect(run.status).toBe('in_progress')
    })

    // 0 is a real reading on a meter installed or replaced during the run, so
    // completion must store it rather than 400 (Group 7 #32).
    it('accepts an energyEnd of exactly 0', async () => {
        const res = await complete({ ...validPayload(), energyEnd: 0 })
        expect(res.status).toBe(200)
        expect(res.body.energyEnd).toBe(0)
    })

    it('accepts a valid energyEnd', async () => {
        const res = await complete({ ...validPayload(), energyEnd: 50 })
        expect(res.status).toBe(200)
        expect(res.body.energyEnd).toBe(50)
    })
})

/*
 * The reading this route receives is only half the pair. The other half was
 * recorded at creation and lives on the row, so completing is the moment the
 * counter's climb can finally be checked — and it has to be checked here,
 * because completion is what makes the run visible to the export that
 * subtracts them.
 */
describe('POST /api/production-runs/:id/complete — energyEnd vs the run\'s energyStart', () => {
    it('rejects an energyEnd below the run\'s stored energyStart', async () => {
        await prisma.productionRun.update({ where: { id: runId }, data: { energyStart: 100 } })
        const materialBefore = await prisma.material.findUniqueOrThrow({ where: { id: baseline.material.id } })

        const res = await complete({ ...validPayload(), energyEnd: 50 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('energyEnd must be at or above energyStart')

        // The guard runs before the transaction, so nothing downstream of it
        // may have happened: no status flip, and no stock consumed.
        const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } })
        expect(run.status).toBe('in_progress')
        expect(run.energyEnd).toBeNull()
        const materialAfter = await prisma.material.findUniqueOrThrow({ where: { id: baseline.material.id } })
        expect(materialAfter.stockQty).toBe(materialBefore.stockQty)
    })

    it('accepts an energyEnd equal to the run\'s stored energyStart', async () => {
        await prisma.productionRun.update({ where: { id: runId }, data: { energyStart: 100 } })

        const res = await complete({ ...validPayload(), energyEnd: 100 })
        expect(res.status).toBe(200)
        expect(res.body.status).toBe('completed')
        expect(res.body.energyEnd).toBe(100)
    })
})

describe('POST /api/production-runs/:id/complete — recipe deactivated after the run started', () => {
    it('rejects completion once the run\'s recipe has been deactivated', async () => {
        // The run was created (via beforeEach, above) while the recipe was
        // still active — deactivating it now reproduces an admin retiring a
        // formula mid-run, which /complete must not silently accept.
        await prisma.recipe.update({ where: { id: baseline.recipe.id }, data: { active: false } })
        try {
            const res = await complete(validPayload())
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('Cannot complete a run whose recipe has been deactivated')
        } finally {
            // baseline.recipe is shared by every test file in this run (files
            // execute one at a time — see vitest.config.js — but leaving it
            // inactive would break every later test relying on it).
            await prisma.recipe.update({ where: { id: baseline.recipe.id }, data: { active: true } })
        }
    })
})

describe('POST /api/production-runs/:id/complete — quantityProduced', () => {
    // Every rejection also asserts the run is still in_progress: the quantity
    // check runs before the transaction, so a bad value must not consume the
    // run's one chance to be completed.
    it.each([
        ['omitted entirely', {}],
        ['explicitly null', { quantityProduced: null }],
        ['exactly 0', { quantityProduced: 0 }],
        ['negative', { quantityProduced: -5 }],
        ['a numeric string', { quantityProduced: '500' }],
        ['NaN', { quantityProduced: Number.NaN }]
    ])('rejects a quantityProduced that is %s', async (_label, override) => {
        const payload = { ...validPayload(), ...override }
        if (Object.keys(override).length === 0) delete payload.quantityProduced

        const res = await complete(payload)
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('quantityProduced must be a number greater than 0')
        const run = await prisma.productionRun.findUnique({ where: { id: runId } })
        expect(run.status).toBe('in_progress')
        expect(run.quantityProduced).toBeNull()
    })

    it('stores the quantity on the run itself and returns it', async () => {
        const res = await complete({ ...validPayload(), quantityProduced: 42.5 })
        expect(res.status).toBe(200)
        expect(res.body.quantityProduced).toBe(42.5)
        const run = await prisma.productionRun.findUnique({ where: { id: runId } })
        expect(run.quantityProduced).toBe(42.5)
    })
})

// The route check above is the friendly 400; this is the guarantee underneath
// it. Prisma cannot express a CHECK constraint, so without these two cases
// nothing in the suite would notice the constraint silently disappearing from
// the database (todo.md Group 8 #16 is the broader version of this worry).
describe('ProductionRun_quantityProduced_valid CHECK constraint', () => {
    it('refuses a completed run with no quantity, bypassing the route entirely', async () => {
        await expect(
            prisma.productionRun.update({
                where: { id: runId },
                data: { status: 'completed', endTime: new Date() }
            })
        ).rejects.toThrow(/ProductionRun_quantityProduced_valid/)

        const run = await prisma.productionRun.findUnique({ where: { id: runId } })
        expect(run.status).toBe('in_progress')
    })

    it('refuses a completed run whose quantity is 0', async () => {
        await expect(
            prisma.productionRun.update({
                where: { id: runId },
                data: { status: 'completed', endTime: new Date(), quantityProduced: 0 }
            })
        ).rejects.toThrow(/ProductionRun_quantityProduced_valid/)
    })

    it('allows an in_progress run to have no quantity at all', async () => {
        const run = await prisma.productionRun.findUnique({ where: { id: runId } })
        expect(run.status).toBe('in_progress')
        expect(run.quantityProduced).toBeNull()
    })
})
