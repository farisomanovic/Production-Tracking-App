/**
 * @file recipes.create.test.js
 * @description Tests for POST /api/recipes — the item-list validation and the
 * percentage-total check, including the floating-point tolerance regression
 * fixed in PR #23 (33.1 + 33.2 + 33.7 sums to 100.00000000000001 in binary
 * floats and must still be accepted; note that many "obvious" triples like
 * 33.33 + 33.33 + 33.34 happen to sum EXACTLY to 100 in floats and would not
 * exercise the tolerance at all — verified before choosing this one).
 *
 * Fixtures: the baseline product/material from the seed, plus two extra
 * VT-REC materials created directly via prisma — RecipeItem has
 * @@unique([recipeId, materialId]), so the three-item tolerance test needs
 * three DISTINCT materials or it would die on the unique constraint before
 * ever reaching the tolerance logic.
 *
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-REC'

let baseline
let materialB
let materialC

async function cleanup() {
    // Children before parents: items and product links of VT-REC recipes,
    // the recipes, then the extra materials (never referenced by anything else).
    await prisma.recipeItem.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.material.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    materialB = await prisma.material.create({ data: { name: `${PREFIX} material B`, unit: 'kg' } })
    materialC = await prisma.material.create({ data: { name: `${PREFIX} material C`, unit: 'kg' } })
})

afterAll(cleanup)

// A correct minimal payload; failure tests override exactly one aspect.
function validPayload() {
    return {
        name: `${PREFIX} ${crypto.randomUUID().slice(0, 8)}`,
        productIds: [baseline.product.id],
        items: [
            { materialId: baseline.material.id, percentage: 60 },
            { materialId: materialB.id, percentage: 40 }
        ]
    }
}

const post = (payload) => request(app).post('/api/recipes').send(payload)

describe('POST /api/recipes — required fields', () => {
    it('rejects a missing name with 400', async () => {
        const res = await post({ ...validPayload(), name: undefined })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name and at least one productId are required')
    })

    it('rejects a missing productIds with 400', async () => {
        const res = await post({ ...validPayload(), productIds: undefined })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name and at least one productId are required')
    })

    it('rejects an empty productIds array with 400', async () => {
        const res = await post({ ...validPayload(), productIds: [] })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name and at least one productId are required')
    })

    it('rejects a productIds array with a duplicate id with 400', async () => {
        const res = await post({ ...validPayload(), productIds: [baseline.product.id, baseline.product.id] })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Each product can only be linked once')
    })
})

describe('POST /api/recipes — item list shape', () => {
    it('rejects absent items with 400', async () => {
        const res = await post({ ...validPayload(), items: undefined })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('At least one recipe item is required')
    })

    it('rejects an empty items array with 400', async () => {
        const res = await post({ ...validPayload(), items: [] })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('At least one recipe item is required')
    })

    it('rejects non-array items with 400', async () => {
        const res = await post({ ...validPayload(), items: 'not an array' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('At least one recipe item is required')
    })

    it('rejects a missing materialId with 400', async () => {
        const res = await post({
            ...validPayload(),
            items: [{ percentage: 100 }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Each recipe item needs a materialId')
    })

    it('rejects a materialId repeated within one payload with 400', async () => {
        const res = await post({
            ...validPayload(),
            items: [
                { materialId: baseline.material.id, percentage: 60 },
                { materialId: baseline.material.id, percentage: 40 }
            ]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Each material can only appear once in a recipe')
    })
})

describe('POST /api/recipes — percentage validation', () => {
    it('rejects a zero percentage with 400', async () => {
        const res = await post({
            ...validPayload(),
            items: [{ materialId: baseline.material.id, percentage: 0 }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Each recipe item needs a percentage greater than 0 and at most 100')
    })

    it('rejects a percentage above 100 with 400', async () => {
        const res = await post({
            ...validPayload(),
            items: [{ materialId: baseline.material.id, percentage: 101 }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Each recipe item needs a percentage greater than 0 and at most 100')
    })

    it('rejects a string percentage with 400', async () => {
        const res = await post({
            ...validPayload(),
            items: [{ materialId: baseline.material.id, percentage: '50' }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Each recipe item needs a percentage greater than 0 and at most 100')
    })

    it('rejects a total that is not 100 and names the actual total', async () => {
        const res = await post({
            ...validPayload(),
            items: [
                { materialId: baseline.material.id, percentage: 60 },
                { materialId: materialB.id, percentage: 30 }
            ]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toContain('90')
    })

    it('accepts 33.1 + 33.2 + 33.7 (PR #23 float-tolerance regression)', async () => {
        // This triple sums to 100.00000000000001 as binary floats — a strict
        // !== 100 check rejects it, the ±0.001 tolerance must accept it.
        const res = await post({
            ...validPayload(),
            items: [
                { materialId: baseline.material.id, percentage: 33.1 },
                { materialId: materialB.id, percentage: 33.2 },
                { materialId: materialC.id, percentage: 33.7 }
            ]
        })
        expect(res.status).toBe(201)
        expect(res.body.recipeItems).toHaveLength(3)
    })
})

describe('POST /api/recipes — plannedQtyKg validation', () => {
    it('rejects a string plannedQtyKg with 400', async () => {
        const res = await post({
            ...validPayload(),
            items: [{ materialId: baseline.material.id, percentage: 100, plannedQtyKg: '5' }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('plannedQtyKg must be a positive number when provided')
    })

    it('rejects a zero or negative plannedQtyKg with 400', async () => {
        const res = await post({
            ...validPayload(),
            items: [{ materialId: baseline.material.id, percentage: 100, plannedQtyKg: 0 }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('plannedQtyKg must be a positive number when provided')
    })

    it('accepts a positive plannedQtyKg and round-trips it', async () => {
        const res = await post({
            ...validPayload(),
            items: [{ materialId: baseline.material.id, percentage: 100, plannedQtyKg: 12.5 }]
        })
        expect(res.status).toBe(201)
        expect(res.body.recipeItems).toHaveLength(1)
        expect(res.body.recipeItems[0].plannedQtyKg).toBe(12.5)
    })
})

describe('POST /api/recipes — bad reference', () => {
    it('rejects an unknown materialId with 400 (P2003, central error middleware)', async () => {
        const res = await post({
            ...validPayload(),
            items: [{ materialId: crypto.randomUUID(), percentage: 100 }]
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('One or more referenced records do not exist')
    })
})

describe('POST /api/recipes — happy path', () => {
    it('creates the recipe with its items in one atomic write', async () => {
        const payload = validPayload()
        const res = await post(payload)
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(payload.name)
        expect(res.body.products).toHaveLength(1)
        expect(res.body.products[0].product.id).toBe(baseline.product.id)
        expect(res.body.recipeItems).toHaveLength(2)
        const percentages = res.body.recipeItems.map((item) => item.percentage).sort((a, b) => a - b)
        expect(percentages).toEqual([40, 60])
    })

    it('ignores a client-sent isDefault — new links always start false, set via PUT /recipe-products/:id instead', async () => {
        const res = await post({ ...validPayload(), isDefault: true })
        expect(res.status).toBe(201)
        expect(res.body.isDefault).toBeUndefined()
        expect(res.body.products[0].isDefault).toBe(false)
    })
})
