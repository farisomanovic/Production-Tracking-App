/**
 * @file productionRuns.complete.test.js
 * @description Tests for POST /api/production-runs/:id/complete — the
 * relational validation added for todo.md Group 3 #6: parameterValues,
 * materialUsages, and outputs ids must belong to the run's own
 * machine/recipe, not just exist somewhere in the database. Duplicate ids
 * within one payload are also rejected before they can hit a @@unique
 * constraint mid-transaction. The rest of /complete's behavior (races, stock
 * floor, cascade delete, endTime guards) is covered by completion.e2e.test.js,
 * not here.
 *
 * Fixtures created directly via prisma with the VT-COMPLETE prefix: a second
 * machine + parameter (for a machineParameterId foreign to the baseline
 * machine), a material outside the baseline recipe, and a product not linked
 * to the baseline machine. A fresh in_progress run is created before each
 * test and cleaned up through the DELETE route after, so a rejected
 * /complete (which leaves the run in_progress) never leaks into the next test.
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
let unlinkedProduct
let runId

async function cleanupFixtures(machineId) {
    await prisma.productionRun.deleteMany({ where: { machineId, status: 'in_progress' } })
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
    unlinkedProduct = await prisma.product.create({ data: { name: `${PREFIX} unlinked product`, code: `${PREFIX}-P2`, unit: 'kg' } })
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
})

afterEach(async () => {
    // Goes through the real route so a completed run's stock is restored the
    // same way any other /complete + DELETE pair would restore it.
    await request(app).delete(`/api/production-runs/${runId}`)
})

function validPayload() {
    return {
        endTime: new Date().toISOString(),
        parameterValues: [{ machineParameterId: machineParameter.id, value: 1 }],
        materialUsages: [{ materialId: baseline.material.id, quantityUsed: 1 }],
        outputs: [{ productId: baseline.product.id, quantityProduced: 1 }]
    }
}

const complete = (payload) => request(app).post(`/api/production-runs/${runId}/complete`).send(payload)

describe('POST /api/production-runs/:id/complete — relational validation (Group 3 #6)', () => {
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

    it("rejects a productId not linked to the run's machine", async () => {
        const res = await complete({
            ...validPayload(),
            outputs: [{ productId: unlinkedProduct.id, quantityProduced: 1 }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe("One or more outputs reference a product not assigned to this run's machine")
    })

    it('leaves the run in_progress with no partial child rows after a rejection', async () => {
        await complete({ ...validPayload(), outputs: [{ productId: unlinkedProduct.id, quantityProduced: 1 }] })
        const run = await prisma.productionRun.findUnique({
            where: { id: runId },
            include: { runParameterValues: true, materialUsages: true, runOutputs: true }
        })
        expect(run.status).toBe('in_progress')
        expect(run.runParameterValues).toHaveLength(0)
        expect(run.materialUsages).toHaveLength(0)
        expect(run.runOutputs).toHaveLength(0)
    })

    it("accepts a payload where every id genuinely belongs to the run's machine/recipe", async () => {
        const res = await complete(validPayload())
        expect(res.status).toBe(200)
        expect(res.body.status).toBe('completed')
    })
})
