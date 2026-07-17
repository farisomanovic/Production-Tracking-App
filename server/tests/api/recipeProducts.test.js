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

// Two DIFFERENT recipes linked to the SAME product — the shape needed to
// exercise "setting one recipe as default clears the other" (default is
// scoped per product, not per recipe, so this only happens when two recipes
// share a product).
async function createTwoRecipesLinkedToSameProduct() {
    const product = await createProduct()
    async function makeRecipe() {
        counter += 1
        return prisma.recipe.create({
            data: {
                name: `${PREFIX} ${counter}`,
                products: { create: [{ productId: product.id }] },
                recipeItems: { create: [{ materialId: baseline.material.id, percentage: 100 }] }
            },
            include: { products: true }
        })
    }
    const recipeX = await makeRecipe()
    const recipeY = await makeRecipe()
    const linkX = recipeX.products[0]
    const linkY = recipeY.products[0]
    return { product, recipeX, recipeY, linkX, linkY }
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

describe('GET /api/recipe-products/product/:productId', () => {
    it('returns a product\'s recipe links', async () => {
        const { recipe, productA } = await createRecipeLinkedToTwoProducts()

        const res = await request(app).get(`/api/recipe-products/product/${productA.id}`)
        expect(res.status).toBe(200)
        expect(res.body.map(l => l.recipeId)).toContain(recipe.id)
    })

    it('returns an empty array for a product with no linked recipes', async () => {
        const product = await createProduct()

        const res = await request(app).get(`/api/recipe-products/product/${product.id}`)
        expect(res.status).toBe(200)
        expect(res.body).toEqual([])
    })
})

describe('PUT /api/recipe-products/:id — default flag', () => {
    it('sets isDefault:true on a link', async () => {
        const { linkX } = await createTwoRecipesLinkedToSameProduct()

        const res = await request(app).put(`/api/recipe-products/${linkX.id}`).send({ isDefault: true })
        expect(res.status).toBe(200)
        expect(res.body.isDefault).toBe(true)
    })

    it('clears the other recipe\'s default for the same product when a new one is set', async () => {
        const { linkX, linkY } = await createTwoRecipesLinkedToSameProduct()

        await request(app).put(`/api/recipe-products/${linkX.id}`).send({ isDefault: true })
        const res = await request(app).put(`/api/recipe-products/${linkY.id}`).send({ isDefault: true })
        expect(res.status).toBe(200)
        expect(res.body.isDefault).toBe(true)

        const nowX = await prisma.recipeProduct.findUnique({ where: { id: linkX.id } })
        expect(nowX.isDefault).toBe(false)
    })

    it('clears isDefault directly, without touching other links', async () => {
        const { linkX, linkY } = await createTwoRecipesLinkedToSameProduct()
        await request(app).put(`/api/recipe-products/${linkX.id}`).send({ isDefault: true })

        const res = await request(app).put(`/api/recipe-products/${linkX.id}`).send({ isDefault: false })
        expect(res.status).toBe(200)
        expect(res.body.isDefault).toBe(false)

        const stillY = await prisma.recipeProduct.findUnique({ where: { id: linkY.id } })
        expect(stillY.isDefault).toBe(false)
    })

    it('rejects a missing isDefault with 400', async () => {
        const { linkX } = await createTwoRecipesLinkedToSameProduct()
        const res = await request(app).put(`/api/recipe-products/${linkX.id}`).send({})
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('isDefault must be a boolean')
    })

    it('rejects a non-boolean isDefault with 400', async () => {
        const { linkX } = await createTwoRecipesLinkedToSameProduct()
        const res = await request(app).put(`/api/recipe-products/${linkX.id}`).send({ isDefault: 'true' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('isDefault must be a boolean')
    })

    it('returns 404 for an unknown link id', async () => {
        const res = await request(app).put(`/api/recipe-products/${crypto.randomUUID()}`).send({ isDefault: true })
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('Link not found')
    })

    it('rejects isDefault:true when the recipe is inactive', async () => {
        const { recipeX, linkX } = await createTwoRecipesLinkedToSameProduct()
        await prisma.recipe.update({ where: { id: recipeX.id }, data: { active: false } })

        const res = await request(app).put(`/api/recipe-products/${linkX.id}`).send({ isDefault: true })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Cannot set an inactive recipe as the default')
    })

    it('handles two concurrent "set as default" requests for the same product without a false 409', async () => {
        const { linkX, linkY } = await createTwoRecipesLinkedToSameProduct()

        const [resX, resY] = await Promise.all([
            request(app).put(`/api/recipe-products/${linkX.id}`).send({ isDefault: true }),
            request(app).put(`/api/recipe-products/${linkY.id}`).send({ isDefault: true })
        ])
        // Last-write-wins, not reject-the-loser: both succeed.
        expect(resX.status).toBe(200)
        expect(resY.status).toBe(200)

        const [nowX, nowY] = await Promise.all([
            prisma.recipeProduct.findUnique({ where: { id: linkX.id } }),
            prisma.recipeProduct.findUnique({ where: { id: linkY.id } })
        ])
        // Exactly one of the two ends up as the default — the partial unique
        // index guarantees this even though both HTTP calls returned 200.
        expect([nowX.isDefault, nowY.isDefault].filter(Boolean)).toHaveLength(1)
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

    it('flattens isDefault as scoped to the queried product, not global to the recipe', async () => {
        const { recipe, productA, productB } = await createRecipeLinkedToTwoProducts()
        const linkA = await prisma.recipeProduct.findFirst({ where: { recipeId: recipe.id, productId: productA.id } })
        await request(app).put(`/api/recipe-products/${linkA.id}`).send({ isDefault: true })

        const resA = await request(app).get(`/api/recipes/by-product/${productA.id}`)
        const resB = await request(app).get(`/api/recipes/by-product/${productB.id}`)

        expect(resA.body.find(r => r.id === recipe.id).isDefault).toBe(true)
        expect(resB.body.find(r => r.id === recipe.id).isDefault).toBe(false)
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
