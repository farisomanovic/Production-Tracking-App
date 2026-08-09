/**
 * @file recipes.nameNormalize.test.js
 * @description Tests that POST /api/recipes and PUT /api/recipes/:id trim and
 * collapse whitespace in `name`. Recipe.name has no unique index — deliberately,
 * because soft-delete via `active` lets a name be reused after the old recipe is
 * retired (see schema.prisma) — so nothing downstream can catch two rows that
 * differ only in padding. Normalizing on write is the only guard there is.
 *
 * Kept out of recipes.create.test.js, which owns the formula/percentage
 * validation, so that a failure here points at the name rule and nothing else.
 *
 * Every recipe this file creates is named with the VT-RECNAME prefix, which
 * survives normalization because the route trims the padding off the front.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-RECNAME'

let baseline

// Children before parents: a Recipe cannot be deleted while its items or
// product links still reference it.
async function cleanup() {
    await prisma.recipeItem.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
})

afterAll(cleanup)

// A minimal valid body — the formula is only here to get past POST's
// percentage validation, which recipes.create.test.js owns.
function validPayload(name) {
    return {
        name,
        productIds: [baseline.product.id],
        items: [{ materialId: baseline.material.id, percentage: 100 }]
    }
}

describe('POST /api/recipes — name normalization', () => {
    it('trims and collapses inner whitespace in name', async () => {
        const res = await request(app)
            .post('/api/recipes')
            .send(validPayload(`  ${PREFIX}   spaced   name  `))
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(`${PREFIX} spaced name`)
    })
})

describe('PUT /api/recipes/:id — name normalization', () => {
    it('trims and collapses inner whitespace in a renamed name', async () => {
        const created = await request(app)
            .post('/api/recipes')
            .send(validPayload(`${PREFIX} rename target`))
        expect(created.status).toBe(201)

        const res = await request(app)
            .put(`/api/recipes/${created.body.id}`)
            .send({ name: `  ${PREFIX}   renamed   spaced  ` })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(`${PREFIX} renamed spaced`)
    })
})
