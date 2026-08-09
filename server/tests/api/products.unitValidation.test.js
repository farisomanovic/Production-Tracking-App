/**
 * @file products.unitValidation.test.js
 * @description Tests for the unit allow-list on POST/PUT /api/products
 * — unit is a correctly-typed string but must also be
 * one of a closed vocabulary; parallel to products.stringValidation.test.js,
 * which covers the type-only guard on the same routes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { VALID_UNITS } from '../../lib/validation.js'

const PREFIX = 'VT-PRODUNIT'

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

describe('POST /api/products — unit allow-list validation', () => {
    it.each(VALID_UNITS)('accepts unit %s with 201', async (unit) => {
        const product = await createProduct({ unit })
        expect(product.unit).toBe(unit)
    })

    it('rejects a unit outside the allow-list with 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} bad unit`, code: `${PREFIX}-B`, unit: 'banana' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe(`unit must be one of: ${VALID_UNITS.join(', ')}`)
    })
})

describe('PUT /api/products/:id — unit allow-list validation', () => {
    it('rejects a unit outside the allow-list with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ unit: 'banana' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe(`unit must be one of: ${VALID_UNITS.join(', ')}`)
    })

    it('leaves unit unchanged when omitted from the body', async () => {
        const product = await createProduct({ unit: 'roll' })
        const res = await request(app).put(`/api/products/${product.id}`).send({ description: 'no unit here' })
        expect(res.status).toBe(200)
        expect(res.body.unit).toBe('roll')
    })
})

/**
 * The unit is a physical property of the product, and ProductionRun stores no
 * unit of its own — quantityProduced is a bare number read through
 * product.unit — so a unit that moves silently reinterprets every past run of
 * that product. These pin the column as write-once.
 */
describe('PUT /api/products/:id — unit is write-once', () => {
    it('rejects a change to a different valid unit with 409', async () => {
        const product = await createProduct({ unit: 'kg' })
        const res = await request(app).put(`/api/products/${product.id}`).send({ unit: 'roll' })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('unit cannot be changed after a product is created')
    })

    it('accepts a PUT that resends the current unit unchanged', async () => {
        const product = await createProduct({ unit: 'roll' })
        const res = await request(app)
            .put(`/api/products/${product.id}`)
            .send({ unit: 'roll', description: 'unchanged unit is not a change' })
        expect(res.status).toBe(200)
        expect(res.body.unit).toBe('roll')
        expect(res.body.description).toBe('unchanged unit is not a change')
    })

    it('returns 404 rather than 409 when the id is unknown', async () => {
        const res = await request(app)
            .put(`/api/products/${crypto.randomUUID()}`)
            .send({ unit: 'roll' })
        expect(res.status).toBe(404)
    })
})
