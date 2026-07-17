/**
 * @file parameters.test.js
 * @description Tests for /api/parameters — "happy path + main failure case"
 * tier per CLAUDE.md (a plain API route, not stock math/completion/transactions).
 * GET routes are trivial reads and are skipped per CLAUDE.md's testing tiers.
 *
 * Every row this file creates is named with the VT-PARAM prefix; beforeAll
 * deletes leftovers from a previously crashed run, afterAll deletes this
 * run's rows. Parameters created here are never linked to a machine, so
 * they're safe to hard-delete.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-PARAM'

// Created through the API on purpose: the POST route is under test too.
async function createParameter() {
    const res = await request(app)
        .post('/api/parameters')
        .send({ name: `${PREFIX} ${crypto.randomUUID().slice(0, 8)}`, unit: '°C' })
    expect(res.status).toBe(201)
    return res.body
}

beforeAll(async () => {
    await prisma.parameter.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

afterAll(async () => {
    await prisma.parameter.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

describe('POST /api/parameters', () => {
    it('rejects a missing name with 400', async () => {
        const res = await request(app).post('/api/parameters').send({ unit: '°C' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name is required')
    })

    it('creates with unit and description', async () => {
        const res = await request(app)
            .post('/api/parameters')
            .send({ name: `${PREFIX} melt temp`, unit: '°C', description: 'Extruder melt temperature' })
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(`${PREFIX} melt temp`)
        expect(res.body.unit).toBe('°C')
        expect(res.body.description).toBe('Extruder melt temperature')
    })

    it('creates with unit/description omitted', async () => {
        const res = await request(app)
            .post('/api/parameters')
            .send({ name: `${PREFIX} no unit` })
        expect(res.status).toBe(201)
        expect(res.body.unit).toBeNull()
        expect(res.body.description).toBeNull()
    })

    it('rejects a duplicate name with 409', async () => {
        const existing = await createParameter()
        const res = await request(app)
            .post('/api/parameters')
            .send({ name: existing.name })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A parameter with this name already exists')
    })
})

describe('PUT /api/parameters/:id', () => {
    it('returns 404 for an unknown id', async () => {
        const res = await request(app)
            .put(`/api/parameters/${crypto.randomUUID()}`)
            .send({ unit: '°F' })
        expect(res.status).toBe(404)
    })

    it('renames a parameter', async () => {
        const parameter = await createParameter()
        const res = await request(app)
            .put(`/api/parameters/${parameter.id}`)
            .send({ name: `${PREFIX} renamed` })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(`${PREFIX} renamed`)
    })

    it('updates unit without touching name', async () => {
        const parameter = await createParameter()
        const res = await request(app)
            .put(`/api/parameters/${parameter.id}`)
            .send({ unit: '°F' })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(parameter.name)
        expect(res.body.unit).toBe('°F')
    })

    it('rejects renaming into an existing name with 409', async () => {
        const existing = await createParameter()
        const parameter = await createParameter()
        const res = await request(app)
            .put(`/api/parameters/${parameter.id}`)
            .send({ name: existing.name })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A parameter with this name already exists')
    })
})
