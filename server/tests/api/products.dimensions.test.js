/**
 * @file products.dimensions.test.js
 * @description Tests for widthMm/thicknessMm/lengthM type validation on
 * POST/PUT /api/products (todo.md Group 3 #12) — a product dimension of
 * exactly 0 is physically impossible, so unlike some optional numeric fields
 * elsewhere in the app, 0 is rejected here alongside negatives/strings.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-PRODDIM'

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

describe('POST /api/products — dimension type validation', () => {
    it('rejects a string widthMm with 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} string width`, code: `${PREFIX}-SW`, unit: 'kg', widthMm: 'wide' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('widthMm must be a number greater than 0 when provided')
    })

    it('rejects a negative thicknessMm with 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} negative thickness`, code: `${PREFIX}-NT`, unit: 'kg', thicknessMm: -1 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('thicknessMm must be a number greater than 0 when provided')
    })

    it('rejects a lengthM of exactly 0 with 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} zero length`, code: `${PREFIX}-ZL`, unit: 'kg', lengthM: 0 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('lengthM must be a number greater than 0 when provided')
    })

    it('creates with valid dimensions', async () => {
        const product = await createProduct({ widthMm: 12, thicknessMm: 0.05, lengthM: 500 })
        expect(product.widthMm).toBe(12)
        expect(product.thicknessMm).toBe(0.05)
        expect(product.lengthM).toBe(500)
    })
})

describe('PUT /api/products/:id — dimension type validation', () => {
    it('rejects a string widthMm with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ widthMm: 'wide' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('widthMm must be a number greater than 0 when provided')
    })

    it('rejects a negative lengthM with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ lengthM: -5 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('lengthM must be a number greater than 0 when provided')
    })

    it('rejects a thicknessMm of exactly 0 with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ thicknessMm: 0 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('thicknessMm must be a number greater than 0 when provided')
    })

    it('updates with a valid dimension', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ thicknessMm: 0.55 })
        expect(res.status).toBe(200)
        expect(res.body.thicknessMm).toBe(0.55)
    })
})
