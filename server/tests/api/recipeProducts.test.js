/**
 * @file recipeProducts.test.js
 * @description Tests for the Recipe<->Product many-to-many link (todo.md
 * Group 5 #10). Happy path + main failure case tier per CLAUDE.md for the
 * link/unlink routes themselves; plus the two spots elsewhere that had to
 * change their query shape when Recipe.productId became a join table:
 * GET /recipes/by-product/:productId and POST /production-runs' recipe/product
 * pairing check.
 *
 * Fixtures created directly via prisma with the VT-RECIPEPRODUCTS prefix: a
 * throwaway recipe linked to two throwaway products, so unlink-while-multiple
 * and unlink-the-last-one can both be exercised without touching the seed's
 * baseline recipe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-RECIPEPRODUCTS'

let baseline
let counter = 0

async function cleanup() {
    await prisma.recipeItem.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    baseline = await getBaseline()
    await cleanup()
})

afterAll(cleanup)

async function createProduct() {
    counter += 1
    return prisma.product.create({
        data: { name: `${PREFIX} ${counter}`, code: `${PREFIX}-${counter}`, unit: 'kg' }
    })
}

// A recipe linked to two fresh products — the shared shape most of these
// tests start from.
async function createRecipeLinkedToTwoProducts() {
    const productA = await createProduct()
    const productB = await createProduct()
    const recipe = await prisma.recipe.create({
        data: {
            name: `${PREFIX} ${counter}`,
            products: { create: [{ productId: productA.id }, { productId: productB.id }] },
            recipeItems: { create: [{ materialId: baseline.material.id, percentage: 100 }] }
        },
        include: { products: true }
    })
    return { recipe, productA, productB }
}

describe('POST /api/recipe-products', () => {
    it('links a product to a recipe', async () => {
        const { recipe } = await createRecipeLinkedToTwoProducts()
        const productC = await createProduct()

        const res = await request(app).post('/api/recipe-products').send({ recipeId: recipe.id, productId: productC.id })
        expect(res.status).toBe(201)
        expect(res.body.recipeId).toBe(recipe.id)
        expect(res.body.productId).toBe(productC.id)
    })

    it('rejects a duplicate link with 409', async () => {
        const { recipe, productA } = await createRecipeLinkedToTwoProducts()

        const res = await request(app).post('/api/recipe-products').send({ recipeId: recipe.id, productId: productA.id })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('This product is already linked to this recipe')
    })

    it('rejects a missing productId with 400', async () => {
        const { recipe } = await createRecipeLinkedToTwoProducts()

        const res = await request(app).post('/api/recipe-products').send({ recipeId: recipe.id })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('recipeId and productId are required')
    })
})

describe('DELETE /api/recipe-products/:id', () => {
    it('unlinks normally with 200 when the recipe still has another linked product', async () => {
        const { recipe, productA } = await createRecipeLinkedToTwoProducts()
        const link = await prisma.recipeProduct.findFirst({ where: { recipeId: recipe.id, productId: productA.id } })

        const res = await request(app).delete(`/api/recipe-products/${link.id}`)
        expect(res.status).toBe(200)
        expect(res.body.message).toBe('Product unlinked from recipe successfully')

        const gone = await prisma.recipeProduct.findUnique({ where: { id: link.id } })
        expect(gone).toBeNull()
    })

    it('rejects the unlink with 409 when it is the recipe\'s last linked product', async () => {
        const { recipe, productA, productB } = await createRecipeLinkedToTwoProducts()
        const linkA = await prisma.recipeProduct.findFirst({ where: { recipeId: recipe.id, productId: productA.id } })
        const linkB = await prisma.recipeProduct.findFirst({ where: { recipeId: recipe.id, productId: productB.id } })

        // Remove the first of the two links — allowed, one remains.
        await request(app).delete(`/api/recipe-products/${linkA.id}`)

        // Removing the second (and last) link must be blocked.
        const res = await request(app).delete(`/api/recipe-products/${linkB.id}`)
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A recipe must have at least one linked product')

        const stillThere = await prisma.recipeProduct.findUnique({ where: { id: linkB.id } })
        expect(stillThere).not.toBeNull()
    })

    it('returns 404 for an unknown link id', async () => {
        const res = await request(app).delete(`/api/recipe-products/${crypto.randomUUID()}`)
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('Link not found')
    })
})

describe('GET /api/recipes/by-product/:productId', () => {
    it('returns a recipe linked to multiple products when queried by any one of them', async () => {
        const { recipe, productA, productB } = await createRecipeLinkedToTwoProducts()

        const resA = await request(app).get(`/api/recipes/by-product/${productA.id}`)
        const resB = await request(app).get(`/api/recipes/by-product/${productB.id}`)

        expect(resA.body.map(r => r.id)).toContain(recipe.id)
        expect(resB.body.map(r => r.id)).toContain(recipe.id)
    })
})

describe('POST /api/production-runs — recipe/product pairing via the join table', () => {
    it('accepts a product that is linked to the recipe but is not the "first" one created', async () => {
        const { recipe, productB } = await createRecipeLinkedToTwoProducts()
        // productB was linked second — the old equality check (recipe.productId
        // !== productId) would only ever have matched a single, fixed product.
        await prisma.machineProduct.create({ data: { machineId: baseline.machine.id, productId: productB.id } })

        const res = await request(app).post('/api/production-runs').send({
            date: new Date().toISOString(),
            startTime: new Date().toISOString(),
            operatorId: baseline.operator.id,
            machineId: baseline.machine.id,
            productId: productB.id,
            recipeId: recipe.id
        })
        expect(res.status).toBe(201)

        await prisma.productionRun.delete({ where: { id: res.body.id } })
        await prisma.machineProduct.deleteMany({ where: { machineId: baseline.machine.id, productId: productB.id } })
    })

    it('still rejects a product that is not linked to the recipe at all', async () => {
        const { recipe } = await createRecipeLinkedToTwoProducts()
        const unrelatedProduct = await createProduct()
        await prisma.machineProduct.create({ data: { machineId: baseline.machine.id, productId: unrelatedProduct.id } })

        const res = await request(app).post('/api/production-runs').send({
            date: new Date().toISOString(),
            startTime: new Date().toISOString(),
            operatorId: baseline.operator.id,
            machineId: baseline.machine.id,
            productId: unrelatedProduct.id,
            recipeId: recipe.id
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Recipe does not belong to the selected product')

        await prisma.machineProduct.deleteMany({ where: { machineId: baseline.machine.id, productId: unrelatedProduct.id } })
    })
})
