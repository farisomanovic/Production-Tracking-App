/**
 * @file products.deactivate.test.js
 * @description Tests for PUT /api/products/:id's active:false path — the
 * soft-delete Product gained alongside Operator/Machine/Recipe. Product is a
 * DIRECT ProductionRun foreign key, so its guard is the same shape as
 * operators.deactivate.test.js's and is expected to be equally strict.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-PRODDEACT'

let baseline
let product
let isolatedMachine

async function cleanup() {
    await prisma.productionRun.deleteMany({ where: { product: { code: { startsWith: PREFIX } } } })
    await prisma.machineProduct.deleteMany({ where: { product: { code: { startsWith: PREFIX } } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    product = await prisma.product.create({
        data: { name: `${PREFIX} product`, code: `${PREFIX}-P1`, unit: 'kg' }
    })
    // A dedicated machine, not baseline.machine, so this file's in-progress run
    // doesn't collide with ProductionRun_one_in_progress_per_machine against
    // other test files that also occupy baseline.machine's single slot.
    isolatedMachine = await prisma.machine.create({
        data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1` }
    })
})

afterAll(cleanup)

describe('POST /api/products — active is not client-settable', () => {
    it('ignores active:false in the body and creates an active product', async () => {
        const res = await request(app).post('/api/products').send({
            name: `${PREFIX} sneaky`, code: `${PREFIX}-P2`, unit: 'kg', active: false
        })
        expect(res.status).toBe(201)
        expect(res.body.active).toBe(true)
    })
})

describe('PUT /api/products/:id — active type validation', () => {
    it('rejects a non-boolean active with 400 and leaves the row unchanged', async () => {
        const res = await request(app).put(`/api/products/${product.id}`).send({ active: 'no' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('active must be a boolean')
        const unchanged = await prisma.product.findUnique({ where: { id: product.id } })
        expect(unchanged.active).toBe(true)
    })
})

describe('PUT /api/products/:id — blocked while a run is in progress', () => {
    it('rejects active:false when an in-progress run references this product', async () => {
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                operatorId: baseline.operator.id,
                machineId: isolatedMachine.id,
                productId: product.id,
                recipeId: baseline.recipe.id
            }
        })
        try {
            const res = await request(app).put(`/api/products/${product.id}`).send({ active: false })
            expect(res.status).toBe(409)
            const stillActive = await prisma.product.findUnique({ where: { id: product.id } })
            expect(stillActive.active).toBe(true)
        } finally {
            await prisma.productionRun.delete({ where: { id: run.id } })
        }
    })

    it('allows active:false once no run is in progress', async () => {
        const res = await request(app).put(`/api/products/${product.id}`).send({ active: false })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(false)
    })

    it('reactivates a deactivated product', async () => {
        const res = await request(app).put(`/api/products/${product.id}`).send({ active: true })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(true)
    })

    // A COMPLETED run is history, not work in progress — the whole reason
    // `active` exists instead of a DELETE is that history keeps its foreign key.
    it('allows active:false when the only run referencing the product is completed', async () => {
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                endTime: new Date(Date.now() + 3600_000),
                status: 'completed',
                quantityProduced: 10,
                operatorId: baseline.operator.id,
                machineId: isolatedMachine.id,
                productId: product.id,
                recipeId: baseline.recipe.id
            }
        })
        try {
            const res = await request(app).put(`/api/products/${product.id}`).send({ active: false })
            expect(res.status).toBe(200)
            expect(res.body.active).toBe(false)
        } finally {
            await prisma.productionRun.delete({ where: { id: run.id } })
            await prisma.product.update({ where: { id: product.id }, data: { active: true } })
        }
    })
})
