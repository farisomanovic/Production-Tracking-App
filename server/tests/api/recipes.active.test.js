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

async function cleanup() {
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    recipe = await prisma.recipe.create({
        data: { name: `${PREFIX} recipe`, products: { create: [{ productId: baseline.product.id }] } }
    })
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
