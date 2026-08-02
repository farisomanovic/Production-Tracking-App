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
import { VALID_UNITS } from '../../lib/validation.js'

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

    it('rejects a numeric name with 400 (Group 3 #18)', async () => {
        const res = await request(app).post('/api/materials').send({ name: 123, unit: 'kg' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name and unit are required')
    })

    it('rejects a numeric unit with 400 (Group 3 #18)', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `${PREFIX} numeric unit`, unit: 42 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name and unit are required')
    })

    it('rejects a numeric supplier with 400 (Group 3 #18)', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `${PREFIX} numeric supplier`, unit: 'kg', supplier: 42 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('supplier must be a string')
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

    it('rejects a duplicate name with 409', async () => {
        const existing = await createMaterial()
        const res = await request(app)
            .post('/api/materials')
            .send({ name: existing.name, unit: 'kg' })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A material with this name already exists')
    })

    it('trims and collapses inner whitespace in name', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `  ${PREFIX}   spaced   name  `, unit: 'kg' })
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(`${PREFIX} spaced name`)
    })

    it('rejects a whitespace-only name with 400', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: '   ', unit: 'kg' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name and unit are required')
    })

    it('rejects a case-only variant of an existing name with 409', async () => {
        const existing = await createMaterial()
        const res = await request(app)
            .post('/api/materials')
            .send({ name: existing.name.toUpperCase(), unit: 'kg' })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A material with this name already exists')
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

    it('rejects a numeric name with 400 (Group 3 #18)', async () => {
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ name: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name must be a string')
    })

    it('rejects a numeric unit with 400 (Group 3 #18)', async () => {
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ unit: 42 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('unit must be a string')
    })

    it('rejects a numeric supplier with 400 (Group 3 #18)', async () => {
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ supplier: 42 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('supplier must be a string')
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

    it('rejects renaming into an existing name with 409', async () => {
        const existing = await createMaterial()
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ name: existing.name })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A material with this name already exists')
    })

    it('rejects renaming into a whitespace-variant of an existing name with 409', async () => {
        const existing = await createMaterial()
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ name: `  ${existing.name}  ` })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A material with this name already exists')
    })

    it('rejects renaming into a case-only variant of an existing name with 409', async () => {
        const existing = await createMaterial()
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ name: existing.name.toUpperCase() })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A material with this name already exists')
    })

    it('rejects a whitespace-only name with 400 and leaves the row unchanged', async () => {
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ name: '   ' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name cannot be blank')
        const after = await prisma.material.findUnique({ where: { id: material.id } })
        expect(after.name).toBe(material.name)
    })
})

describe('unit allow-list validation (Group 3 #14)', () => {
    it.each(VALID_UNITS)('POST accepts unit %s with 201', async (unit) => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `${PREFIX} ${crypto.randomUUID().slice(0, 8)}`, unit })
        expect(res.status).toBe(201)
        expect(res.body.unit).toBe(unit)
    })

    it('POST rejects a unit outside the allow-list with 400', async () => {
        const res = await request(app)
            .post('/api/materials')
            .send({ name: `${PREFIX} bad unit`, unit: 'banana' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe(`unit must be one of: ${VALID_UNITS.join(', ')}`)
    })

    it('PUT rejects a unit outside the allow-list with 400', async () => {
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ unit: 'banana' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe(`unit must be one of: ${VALID_UNITS.join(', ')}`)
    })

    it('PUT leaves unit unchanged when omitted from the body', async () => {
        const material = await createMaterial()
        const res = await request(app)
            .put(`/api/materials/${material.id}`)
            .send({ stockDelta: 1 })
        expect(res.status).toBe(200)
        expect(res.body.unit).toBe('kg')
    })
})
