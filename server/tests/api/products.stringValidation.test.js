/**
 * @file products.stringValidation.test.js
 * @description Tests for name/unit/code/description string-type validation
 * on POST/PUT /api/products, plus the whitespace normalization applied to
 * `name` on write — parallel to products.dimensions.test.js, which covers the
 * numeric fields on the same routes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-PRODSTR'

async function createProduct(overrides = {}) {
    const res = await request(app)
        .post('/api/products')
        .send({ name: `${PREFIX} ${crypto.randomUUID().slice(0, 8)}`, code: `${PREFIX}-${crypto.randomUUID().slice(0, 8)}`, unit: 'kg', ...overrides })
    expect(res.status).toBe(201)
    return res.body
}

beforeAll(async () => {
    await prisma.product.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

afterAll(async () => {
    await prisma.product.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

describe('POST /api/products — string field type validation', () => {
    it('rejects a numeric name with 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: 123, code: `${PREFIX}-N`, unit: 'kg' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name, unit and code are required')
    })

    it('rejects a numeric unit with 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} numeric unit`, code: `${PREFIX}-U`, unit: 42 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name, unit and code are required')
    })

    it('rejects a numeric code with 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} numeric code`, code: 42, unit: 'kg' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name, unit and code are required')
    })

    it('rejects a numeric description with 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} numeric description`, code: `${PREFIX}-D`, unit: 'kg', description: 42 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('description must be a string')
    })

    // `code` has been normalized since PR #65 (products.codeNormalize.test.js)
    // while `name` was not, so one row could hold a trimmed code and a padded
    // name — two identifiers for the same product disagreeing with each other.
    it('trims and collapses inner whitespace in name', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `  ${PREFIX}   spaced   name  `, code: `${PREFIX}-SPACED`, unit: 'kg' })
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(`${PREFIX} spaced name`)
    })
})

describe('PUT /api/products/:id — string field type validation', () => {
    it('rejects a numeric name with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ name: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name must be a string')
    })

    it('rejects a numeric code with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ code: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('code must be a string')
    })

    it('rejects a numeric unit with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ unit: 42 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('unit must be a string')
    })

    it('rejects a numeric description with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ description: 42 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('description must be a string')
    })
})

// The `code` twin of these lives in products.codeNormalize.test.js. Both
// fields now normalize on write; they differ only in what a blank means —
// a blank code becomes null there, while a blank name is rejected outright,
// because Product.name is NOT NULL and has no null to fall back on.
describe('PUT /api/products/:id — name blank guard and normalization', () => {
    it('rejects an empty-string name with 400 and leaves the row unchanged', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ name: '' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name cannot be blank')
        const after = await prisma.product.findUnique({ where: { id: product.id } })
        expect(after.name).toBe(product.name)
    })

    it('rejects a whitespace-only name with 400 and leaves the row unchanged', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ name: '   ' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name cannot be blank')
        const after = await prisma.product.findUnique({ where: { id: product.id } })
        expect(after.name).toBe(product.name)
    })

    it('trims and collapses inner whitespace in a renamed name', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ name: `  ${PREFIX}   renamed   spaced  ` })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(`${PREFIX} renamed spaced`)
    })
})
