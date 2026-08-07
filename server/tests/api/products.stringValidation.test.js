/**
 * @file products.stringValidation.test.js
 * @description Tests for name/unit/code/description string-type validation
 * on POST/PUT /api/products — parallel to
 * products.dimensions.test.js, which covers the numeric fields on the same
 * routes.
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
