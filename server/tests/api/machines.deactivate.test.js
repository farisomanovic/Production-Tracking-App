/**
 * @file machines.deactivate.test.js
 * @description Tests for the in-progress-run guard on PUT /api/machines/:id's
 * active:false path (todo.md Group 3 #5), backed by the existing
 * machineHasRunInProgress helper (lib/machineGuards.js) already used by the
 * MachineParameter/MachineProduct unlink routes for the identical check.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-MDEACT'

let baseline
let machine

async function cleanup() {
    await prisma.productionRun.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    // Dedicated machine so this run doesn't collide with
    // ProductionRun_one_in_progress_per_machine against baseline.machine,
    // which other test files also occupy.
    machine = await prisma.machine.create({ data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1` } })
})

afterAll(cleanup)

describe('PUT /api/machines/:id — blocked while a run is in progress', () => {
    it('rejects active:false when an in-progress run references this machine', async () => {
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                operatorId: baseline.operator.id,
                machineId: machine.id,
                productId: baseline.product.id,
                recipeId: baseline.recipe.id
            }
        })
        try {
            const res = await request(app).put(`/api/machines/${machine.id}`).send({ active: false })
            expect(res.status).toBe(409)
            const stillActive = await prisma.machine.findUnique({ where: { id: machine.id } })
            expect(stillActive.active).toBe(true)
        } finally {
            await prisma.productionRun.delete({ where: { id: run.id } })
        }
    })

    it('allows active:false once no run is in progress', async () => {
        const res = await request(app).put(`/api/machines/${machine.id}`).send({ active: false })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(false)
    })
})
