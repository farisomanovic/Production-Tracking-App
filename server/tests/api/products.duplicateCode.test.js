/**
 * @file products.duplicateCode.test.js
 * @description Tests that POST and PUT /api/products report a Product.code
 * collision with a message that names the resource and the field. Parallel to
 * machines.duplicateCode.test.js — see its header for why a case-only variant
 * is deliberately not tested and why cleanup filters on `name`.
 *
 * The gap this closes is worse for products than for machines: the product form
 * submits name, code and unit together and `name` is not unique, so the old
 * anonymous "A record with this value already exists" did not even narrow the
 * conflict down to one input.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-PDUP'

async function cleanup() {
    await prisma.product.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(cleanup)
afterAll(cleanup)

describe('POST /api/products — duplicate code', () => {
    it('rejects a code already taken by another product with 409 and a resource-specific message', async () => {
        const taken = `${PREFIX}-POST`
        const first = await request(app).post('/api/products').send({ name: `${PREFIX} first`, code: taken, unit: 'kg' })
        expect(first.status).toBe(201)

        const res = await request(app).post('/api/products').send({ name: `${PREFIX} second`, code: taken, unit: 'kg' })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A product with this code already exists')
    })
})

describe('PUT /api/products/:id — duplicate code', () => {
    it('rejects renaming a code into one already taken with 409 and a resource-specific message', async () => {
        const taken = `${PREFIX}-PUT-A`
        const first = await request(app).post('/api/products').send({ name: `${PREFIX} put first`, code: taken, unit: 'kg' })
        expect(first.status).toBe(201)
        const second = await request(app).post('/api/products').send({ name: `${PREFIX} put second`, code: `${PREFIX}-PUT-B`, unit: 'kg' })
        expect(second.status).toBe(201)

        const res = await request(app).put(`/api/products/${second.body.id}`).send({ code: taken })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A product with this code already exists')

        const after = await prisma.product.findUnique({ where: { id: second.body.id } })
        expect(after.code).toBe(`${PREFIX}-PUT-B`)
    })
})
