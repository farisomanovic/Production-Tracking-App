/**
 * @file machines.test.js
 * @description Tests for /api/machines — "happy path + main failure case"
 * tier per CLAUDE.md. Covers the `name` string-type validation (a non-string
 * name used to reach Prisma and crash as an unclassifiable 500 instead of a
 * clean 400). `code` normalization has
 * its own dedicated file, machines.codeNormalize.test.js.
 *
 * Every row this file creates is named with the VT-MACH prefix; beforeAll
 * deletes leftovers from a previously crashed run, afterAll deletes this
 * run's rows.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-MACH'

beforeAll(async () => {
    await prisma.machine.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

afterAll(async () => {
    await prisma.machine.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

describe('POST /api/machines — name validation', () => {
    it('rejects a missing name with 400', async () => {
        const res = await request(app).post('/api/machines').send({})
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name is required')
    })

    it('rejects a numeric name with 400', async () => {
        const res = await request(app).post('/api/machines').send({ name: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name is required')
    })

    it('creates with a valid name', async () => {
        const res = await request(app).post('/api/machines').send({ name: `${PREFIX} Extruder` })
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(`${PREFIX} Extruder`)
    })
})

describe('PUT /api/machines/:id — name validation', () => {
    it('rejects a numeric name with 400', async () => {
        const machine = await prisma.machine.create({ data: { name: `${PREFIX} put target` } })
        const res = await request(app).put(`/api/machines/${machine.id}`).send({ name: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name must be a string')
    })

    it('renames with a valid string name', async () => {
        const machine = await prisma.machine.create({ data: { name: `${PREFIX} original` } })
        const res = await request(app).put(`/api/machines/${machine.id}`).send({ name: `${PREFIX} renamed` })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(`${PREFIX} renamed`)
    })
})
