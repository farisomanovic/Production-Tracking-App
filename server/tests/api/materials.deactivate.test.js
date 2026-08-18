/**
 * @file materials.deactivate.test.js
 * @description Tests for PUT /api/materials/:id's active:false path. Material
 * is NOT a ProductionRun foreign key — the guard reaches it indirectly through
 * Recipe → RecipeItem, so these tests exercise that join specifically.
 *
 * They also cover the interaction that makes this route different from the
 * other two: materials.js PUT writes through updateMany (for the atomic stock
 * floor), and the guard had to be wrapped around that rather than replace it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-MATDEACT'

let baseline
let material
let recipe
let isolatedMachine

async function cleanup() {
    await prisma.productionRun.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipeItem.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.materialUsage.deleteMany({ where: { material: { name: { startsWith: PREFIX } } } })
    await prisma.material.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    material = await prisma.material.create({
        data: { name: `${PREFIX} granulat`, unit: 'kg', stockQty: 500 }
    })
    // The recipe is the JOIN this guard depends on: a run points at a recipe,
    // and only the recipe's items name the material.
    recipe = await prisma.recipe.create({
        data: {
            name: `${PREFIX} recipe`,
            recipeItems: { create: [{ materialId: material.id, percentage: 100 }] },
            products: { create: [{ productId: baseline.product.id }] }
        }
    })
    isolatedMachine = await prisma.machine.create({
        data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1` }
    })
})

afterAll(cleanup)

describe('POST /api/materials — active is not client-settable', () => {
    it('ignores active:false in the body and creates an active material', async () => {
        const res = await request(app).post('/api/materials').send({
            name: `${PREFIX} sneaky`, unit: 'kg', active: false
        })
        expect(res.status).toBe(201)
        expect(res.body.active).toBe(true)
    })
})

describe('PUT /api/materials/:id — active type validation', () => {
    it('rejects a non-boolean active with 400 and leaves the row unchanged', async () => {
        const res = await request(app).put(`/api/materials/${material.id}`).send({ active: 'no' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('active must be a boolean')
        const unchanged = await prisma.material.findUnique({ where: { id: material.id } })
        expect(unchanged.active).toBe(true)
    })
})

describe('PUT /api/materials/:id — blocked while a run using it is in progress', () => {
    it('rejects active:false when an in-progress run\'s recipe uses this material', async () => {
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(),
                startTime: new Date(),
                operatorId: baseline.operator.id,
                machineId: isolatedMachine.id,
                productId: baseline.product.id,
                recipeId: recipe.id
            }
        })
        try {
            const res = await request(app).put(`/api/materials/${material.id}`).send({ active: false })
            expect(res.status).toBe(409)
            const stillActive = await prisma.material.findUnique({ where: { id: material.id } })
            expect(stillActive.active).toBe(true)
        } finally {
            await prisma.productionRun.delete({ where: { id: run.id } })
        }
    })

    it('allows active:false once no run is in progress', async () => {
        const res = await request(app).put(`/api/materials/${material.id}`).send({ active: false })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(false)
    })

    it('reactivates a deactivated material', async () => {
        const res = await request(app).put(`/api/materials/${material.id}`).send({ active: true })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(true)
    })
})

describe('PUT /api/materials/:id — active does not disturb stock', () => {
    // materials.js PUT builds ONE `data` object shared by the stock branch and
    // the lifecycle branch, and writes it through updateMany. A deactivation
    // must therefore leave stockQty exactly where it was.
    it('leaves stockQty untouched when only active changes', async () => {
        const before = await prisma.material.findUnique({ where: { id: material.id } })
        const res = await request(app).put(`/api/materials/${material.id}`).send({ active: false })
        expect(res.status).toBe(200)
        expect(res.body.stockQty).toBe(before.stockQty)
        await prisma.material.update({ where: { id: material.id }, data: { active: true } })
    })

    it('applies a stockDelta and active in the same request', async () => {
        const before = await prisma.material.findUnique({ where: { id: material.id } })
        const res = await request(app).put(`/api/materials/${material.id}`)
            .send({ active: false, stockDelta: 25 })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(false)
        expect(res.body.stockQty).toBe(before.stockQty + 25)
        await prisma.material.update({
            where: { id: material.id },
            data: { active: true, stockQty: before.stockQty }
        })
    })
})
