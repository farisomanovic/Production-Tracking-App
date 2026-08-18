/**
 * @file parameters.deactivate.test.js
 * @description Tests for PUT /api/parameters/:id's active:false path.
 * Parameter is the most indirect of the six guarded entities: an in_progress
 * run does not reference it at all (RunParameterValue rows are only written at
 * /complete), so the guard asks whether a machine CONFIGURED to collect this
 * parameter has an open run — the same question machineParameters.js's DELETE
 * already refuses on.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-PARAMDEACT'

let baseline
let parameter
let isolatedMachine

async function cleanup() {
    await prisma.productionRun.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.machineParameter.deleteMany({ where: { parameter: { name: { startsWith: PREFIX } } } })
    await prisma.machineParameter.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.parameter.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    parameter = await prisma.parameter.create({ data: { name: `${PREFIX} melt temp`, unit: 'C' } })
    isolatedMachine = await prisma.machine.create({
        data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1` }
    })
    // The link is the JOIN this guard depends on — without it, an open run on
    // this machine says nothing about this parameter.
    await prisma.machineParameter.create({
        data: { machineId: isolatedMachine.id, parameterId: parameter.id, displayOrder: 0 }
    })
})

afterAll(cleanup)

describe('POST /api/parameters — active is not client-settable', () => {
    it('ignores active:false in the body and creates an active parameter', async () => {
        const res = await request(app).post('/api/parameters').send({
            name: `${PREFIX} sneaky`, active: false
        })
        expect(res.status).toBe(201)
        expect(res.body.active).toBe(true)
    })
})

describe('PUT /api/parameters/:id — active type validation', () => {
    it('rejects a non-boolean active with 400 and leaves the row unchanged', async () => {
        const res = await request(app).put(`/api/parameters/${parameter.id}`).send({ active: 'no' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('active must be a boolean')
        const unchanged = await prisma.parameter.findUnique({ where: { id: parameter.id } })
        expect(unchanged.active).toBe(true)
    })
})

describe('PUT /api/parameters/:id — blocked while its machine has an open run', () => {
    it('rejects active:false when a machine collecting it has a run in progress', async () => {
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                operatorId: baseline.operator.id,
                machineId: isolatedMachine.id,
                productId: baseline.product.id,
                recipeId: baseline.recipe.id
            }
        })
        try {
            const res = await request(app).put(`/api/parameters/${parameter.id}`).send({ active: false })
            expect(res.status).toBe(409)
            const stillActive = await prisma.parameter.findUnique({ where: { id: parameter.id } })
            expect(stillActive.active).toBe(true)
        } finally {
            await prisma.productionRun.delete({ where: { id: run.id } })
        }
    })

    // The guard must be scoped to machines that actually collect this parameter.
    // A busy machine with no link to it is none of this parameter's business.
    it('allows active:false when the open run is on a machine that does NOT collect it', async () => {
        const otherMachine = await prisma.machine.create({
            data: { name: `${PREFIX} other`, code: `${PREFIX}-M2` }
        })
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                operatorId: baseline.operator.id,
                machineId: otherMachine.id,
                productId: baseline.product.id,
                recipeId: baseline.recipe.id
            }
        })
        try {
            const res = await request(app).put(`/api/parameters/${parameter.id}`).send({ active: false })
            expect(res.status).toBe(200)
            expect(res.body.active).toBe(false)
        } finally {
            await prisma.productionRun.delete({ where: { id: run.id } })
            await prisma.machine.delete({ where: { id: otherMachine.id } })
            await prisma.parameter.update({ where: { id: parameter.id }, data: { active: true } })
        }
    })

    it('allows active:false once no run is in progress', async () => {
        const res = await request(app).put(`/api/parameters/${parameter.id}`).send({ active: false })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(false)
    })

    it('reactivates a deactivated parameter', async () => {
        const res = await request(app).put(`/api/parameters/${parameter.id}`).send({ active: true })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(true)
    })
})
