/**
 * @file operators.deactivate.test.js
 * @description Tests for the in-progress-run guard on PUT /api/operators/:id's
 * active:false path (todo.md Group 3 #5) — deactivation must be blocked while
 * an open run still references the operator.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-OPDEACT'

let baseline
let operator
let isolatedMachine

async function cleanup() {
    await prisma.productionRun.deleteMany({ where: { operator: { name: { startsWith: PREFIX } } } })
    await prisma.operator.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    operator = await prisma.operator.create({ data: { name: `${PREFIX} operator` } })
    // A dedicated machine, not baseline.machine, so this run doesn't collide
    // with ProductionRun_one_in_progress_per_machine against other test files
    // that also occupy baseline.machine's single in-progress slot.
    isolatedMachine = await prisma.machine.create({ data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1` } })
})

afterAll(cleanup)

describe('PUT /api/operators/:id — blocked while a run is in progress', () => {
    it('rejects active:false when an in-progress run references this operator', async () => {
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                operatorId: operator.id,
                machineId: isolatedMachine.id,
                productId: baseline.product.id,
                recipeId: baseline.recipe.id
            }
        })
        try {
            const res = await request(app).put(`/api/operators/${operator.id}`).send({ active: false })
            expect(res.status).toBe(409)
            const stillActive = await prisma.operator.findUnique({ where: { id: operator.id } })
            expect(stillActive.active).toBe(true)
        } finally {
            await prisma.productionRun.delete({ where: { id: run.id } })
        }
    })

    it('allows active:false once no run is in progress', async () => {
        const res = await request(app).put(`/api/operators/${operator.id}`).send({ active: false })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(false)
    })
})
