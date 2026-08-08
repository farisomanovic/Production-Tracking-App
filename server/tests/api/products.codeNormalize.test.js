/**
 * @file products.codeNormalize.test.js
 * @description Tests for POST and PUT /api/products trimming `code` and rejecting
 * a blank one. Product.code is required AND unique, so an untrimmed value gives
 * one physical product two distinct unique keys, and a literal "" is a
 * meaningless value occupying a real slot in that constraint. Parallel to
 * machines.codeNormalize.test.js, which covers the same helper on the optional
 * Machine.code — where blank normalizes to null instead of being rejected.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-PCODE'

async function cleanup() {
    await prisma.product.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

async function createProduct(overrides = {}) {
    const res = await request(app)
        .post('/api/products')
        .send({
            name: `${PREFIX} ${crypto.randomUUID().slice(0, 8)}`,
            code: `${PREFIX}-${crypto.randomUUID().slice(0, 8)}`,
            unit: 'kg',
            ...overrides
        })
    expect(res.status).toBe(201)
    return res.body
}

beforeAll(cleanup)
afterAll(cleanup)

describe('POST /api/products — code normalization', () => {
    it('trims a padded code', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} padded`, code: `  ${PREFIX}-A  `, unit: 'kg' })
        expect(res.status).toBe(201)
        expect(res.body.code).toBe(`${PREFIX}-A`)
    })

    it('rejects a padded code whose trimmed form is already taken', async () => {
        const bare = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} bare twin`, code: `${PREFIX}-B`, unit: 'kg' })
        expect(bare.status).toBe(201)

        const padded = await request(app)
            .post('/api/products')
            .send({ name: `${PREFIX} padded twin`, code: `  ${PREFIX}-B  `, unit: 'kg' })
        expect(padded.status).toBe(409)
    })
})

describe('PUT /api/products/:id — code normalization', () => {
    it('trims a padded code', async () => {
        const product = await createProduct()
        const res = await request(app)
            .put(`/api/products/${product.id}`)
            .send({ code: `  ${PREFIX}-C  ` })
        expect(res.status).toBe(200)
        expect(res.body.code).toBe(`${PREFIX}-C`)
    })

    it('rejects an empty-string code with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ code: '' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('code cannot be blank')
    })

    it('rejects a whitespace-only code with 400', async () => {
        const product = await createProduct()
        const res = await request(app).put(`/api/products/${product.id}`).send({ code: '   ' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('code cannot be blank')
    })

    it('leaves code untouched when omitted from the body', async () => {
        const product = await createProduct()
        const res = await request(app)
            .put(`/api/products/${product.id}`)
            .send({ name: `${PREFIX} renamed` })
        expect(res.status).toBe(200)
        expect(res.body.code).toBe(product.code)
    })
})
