/**
 * @file materials.test.js
 * @description Tests for /api/materials — stock (stockQty) math is "thorough"
 * tier per CLAUDE.md: every arithmetic path, both stock-adjustment modes
 * (stockDelta vs stockQty), the atomic below-zero guard, and the documented
 * delta-wins contract when both are sent.
 *
 * Every row this file creates is named with the VT-MAT prefix; beforeAll
 * deletes leftovers from a previously crashed run, afterAll deletes this
 * run's rows. Materials are safe to hard-delete: these throwaway rows are
 * never referenced by recipe items or material usages.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-MAT'

// Each test gets its own material so no test depends on another's leftovers —
// created through the API on purpose: the POST route is under test too.
async function createMaterial(stockQty = 100) {
    const res = await request(app)
        .post('/api/materials')
        .send({ name: `${PREFIX} ${crypto.randomUUID().slice(0, 8)}`, unit: 'kg', stockQty })
    expect(res.status).toBe(201)
    return res.body
}

beforeAll(async () => {
    await prisma.material.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

afterAll(async () => {
    await prisma.material.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

describe('POST /api/materials', () => {
    it('rejects a missing name with 400', async () => {
        const res = await request(app).post('/api/materials').send({ unit: 'kg' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name and unit are required')
    })

    it('rejects a missing unit with 400', async () => {
        const res = await request(app).post('/api/materials').send({ name: `${PREFIX} no unit` })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name and unit are required')
    })

    it('rejects a string stockQty with 400', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `${PREFIX} string stock`, unit: 'kg', stockQty: '50' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stockQty must be a number of at least 0')
    })

    it('rejects a negative stockQty with 400', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `${PREFIX} negative stock`, unit: 'kg', stockQty: -5 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stockQty must be a number of at least 0')
    })

    it('creates with stock defaulting to 0 when stockQty is omitted', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `${PREFIX} default stock`, unit: 'kg' })
        expect(res.status).toBe(201)
        expect(res.body.stockQty).toBe(0)
    })

    it('creates with the given opening stock', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `${PREFIX} opening stock`, unit: 'kg', stockQty: 500 })
        expect(res.status).toBe(201)
        expect(res.body.stockQty).toBe(500)
    })
})

describe('PUT /api/materials/:id — stockDelta (relative adjust)', () => {
    it('adds a positive delta (delivery)', async () => {
        const material = await createMaterial(100)
        const res = await request(app).put(`/api/materials/${material.id}`).send({ stockDelta: 50 })
        expect(res.status).toBe(200)
        expect(res.body.stockQty).toBe(150)
    })

    it('subtracts a negative delta (correction)', async () => {
        const material = await createMaterial(100)
        const res = await request(app).put(`/api/materials/${material.id}`).send({ stockDelta: -30 })
        expect(res.status).toBe(200)
        expect(res.body.stockQty).toBe(70)
    })

    it('allows a delta that lands exactly on zero (gte boundary)', async () => {
        const material = await createMaterial(100)
        const res = await request(app).put(`/api/materials/${material.id}`).send({ stockDelta: -100 })
        expect(res.status).toBe(200)
        expect(res.body.stockQty).toBe(0)
    })

    it('rejects an overdraw with 409 and leaves stock untouched', async () => {
        const material = await createMaterial(100)
        const res = await request(app).put(`/api/materials/${material.id}`).send({ stockDelta: -101 })
        expect(res.status).toBe(409)
        expect(res.body.error).toMatch(/cannot go below zero/i)
        // The atomic updateMany guard must have prevented ANY write.
        const after = await request(app).get(`/api/materials/${material.id}`)
        expect(after.body.stockQty).toBe(100)
    })

    it('rejects a non-numeric stockDelta with 400', async () => {
        const material = await createMaterial(100)
        const res = await request(app).put(`/api/materials/${material.id}`).send({ stockDelta: '10' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stockDelta must be a number')
    })
})

describe('PUT /api/materials/:id — stockQty (absolute set)', () => {
    it('sets stock outright', async () => {
        const material = await createMaterial(100)
        const res = await request(app).put(`/api/materials/${material.id}`).send({ stockQty: 42 })
        expect(res.status).toBe(200)
        expect(res.body.stockQty).toBe(42)
    })

    it('rejects a negative stockQty with 400', async () => {
        const material = await createMaterial(100)
        const res = await request(app).put(`/api/materials/${material.id}`).send({ stockQty: -1 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stockQty must be a number of at least 0')
    })

    it('rejects a string stockQty with 400', async () => {
        const material = await createMaterial(100)
        const res = await request(app).put(`/api/materials/${material.id}`).send({ stockQty: '42' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('stockQty must be a number of at least 0')
    })

    it('lets stockDelta win when both are sent (documented contract)', async () => {
        const material = await createMaterial(100)
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ stockDelta: 10, stockQty: 999 })
        expect(res.status).toBe(200)
        expect(res.body.stockQty).toBe(110)
    })
})

describe('PUT /api/materials/:id — non-stock paths', () => {
    it('returns 404 for an unknown id', async () => {
        const res = await request(app)
            .put(`/api/materials/${crypto.randomUUID()}`)
            .send({ stockDelta: 10 })
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('Material not found')
    })

    it('renames without touching stock', async () => {
        const material = await createMaterial(100)
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ name: `${PREFIX} renamed` })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(`${PREFIX} renamed`)
        expect(res.body.stockQty).toBe(100)
    })
})
