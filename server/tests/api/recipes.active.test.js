/**
 * @file recipes.active.test.js
 * @description Tests for the Recipe soft-delete flag: PUT /api/recipes/:id's
 * `active` toggle, GET /api/recipes/by-product/:productId's active-only
 * filter (the wizard Step 2's source), and GET /api/recipes (admin list),
 * which must keep showing inactive recipes so they can be reactivated.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-RECACTIVE'

let baseline
let recipe
let isolatedMachine

async function cleanup() {
    await prisma.productionRun.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    recipe = await prisma.recipe.create({
        data: { name: `${PREFIX} recipe`, products: { create: [{ productId: baseline.product.id }] } }
    })
    // A dedicated machine, not baseline.machine, so the in-progress run created
    // below doesn't collide with ProductionRun_one_in_progress_per_machine
    // against other test files that also occupy baseline.machine's slot.
    isolatedMachine = await prisma.machine.create({ data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1` } })
})

afterAll(cleanup)

describe('PUT /api/recipes/:id — active toggle', () => {
    it('deactivates a recipe', async () => {
        const res = await request(app).put(`/api/recipes/${recipe.id}`).send({ active: false })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(false)
    })

    it('reactivates a recipe', async () => {
        const res = await request(app).put(`/api/recipes/${recipe.id}`).send({ active: true })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(true)
    })

    it('ignores a client-sent isDefault — it lives on RecipeProduct, not Recipe, and is set via PUT /recipe-products/:id', async () => {
        const res = await request(app).put(`/api/recipes/${recipe.id}`).send({ isDefault: true })
        expect(res.status).toBe(200)
        expect(res.body.isDefault).toBeUndefined()
    })
})

describe('PUT /api/recipes/:id — blocked while a run is in progress', () => {
    it('rejects active:false when an in-progress run references this recipe', async () => {
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
            const res = await request(app).put(`/api/recipes/${recipe.id}`).send({ active: false })
            expect(res.status).toBe(409)
            const stillActive = await prisma.recipe.findUnique({ where: { id: recipe.id } })
            expect(stillActive.active).toBe(true)
        } finally {
            await prisma.productionRun.delete({ where: { id: run.id } })
        }
    })

    it('allows active:false once no run is in progress', async () => {
        const res = await request(app).put(`/api/recipes/${recipe.id}`).send({ active: false })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(false)
        await prisma.recipe.update({ where: { id: recipe.id }, data: { active: true } })
    })
})

describe('GET /api/recipes/by-product/:productId — active-only filter', () => {
    it('excludes an inactive recipe', async () => {
        await prisma.recipe.update({ where: { id: recipe.id }, data: { active: false } })
        const res = await request(app).get(`/api/recipes/by-product/${baseline.product.id}`)
        expect(res.status).toBe(200)
        expect(res.body.map(r => r.id)).not.toContain(recipe.id)
    })

    it('includes an active recipe', async () => {
        await prisma.recipe.update({ where: { id: recipe.id }, data: { active: true } })
        const res = await request(app).get(`/api/recipes/by-product/${baseline.product.id}`)
        expect(res.status).toBe(200)
        expect(res.body.map(r => r.id)).toContain(recipe.id)
    })
})

describe('GET /api/recipes — admin list stays unfiltered', () => {
    it('still includes an inactive recipe', async () => {
        await prisma.recipe.update({ where: { id: recipe.id }, data: { active: false } })
        try {
            const res = await request(app).get('/api/recipes')
            expect(res.status).toBe(200)
            expect(res.body.map(r => r.id)).toContain(recipe.id)
        } finally {
            await prisma.recipe.update({ where: { id: recipe.id }, data: { active: true } })
        }
    })
})
