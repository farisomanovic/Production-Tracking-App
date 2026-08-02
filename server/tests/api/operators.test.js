/**
 * @file operators.test.js
 * @description Tests for /api/operators — "happy path + main failure case"
 * tier per CLAUDE.md. Covers the `name` string-type validation added by
 * todo.md Group 3 #18 (a non-string name used to reach Prisma and crash as
 * an unclassifiable 500 instead of a clean 400).
 *
 * Every row this file creates is named with the VT-OP prefix; beforeAll
 * deletes leftovers from a previously crashed run, afterAll deletes this
 * run's rows.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-OP'

beforeAll(async () => {
    await prisma.operator.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

afterAll(async () => {
    await prisma.operator.deleteMany({ where: { name: { startsWith: PREFIX } } })
})

describe('POST /api/operators — name validation', () => {
    it('rejects a missing name with 400', async () => {
        const res = await request(app).post('/api/operators').send({})
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name is required')
    })

    it('rejects a numeric name with 400 (Group 3 #18)', async () => {
        const res = await request(app).post('/api/operators').send({ name: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name is required')
    })

    it('creates with a valid name', async () => {
        const res = await request(app).post('/api/operators').send({ name: `${PREFIX} Emina` })
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(`${PREFIX} Emina`)
        expect(res.body.active).toBe(true)
    })
})

describe('PUT /api/operators/:id — name validation', () => {
    it('rejects a numeric name with 400 (Group 3 #18)', async () => {
        const operator = await prisma.operator.create({ data: { name: `${PREFIX} put target` } })
        const res = await request(app).put(`/api/operators/${operator.id}`).send({ name: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name must be a string')
    })

    it('renames with a valid string name', async () => {
        const operator = await prisma.operator.create({ data: { name: `${PREFIX} original` } })
        const res = await request(app).put(`/api/operators/${operator.id}`).send({ name: `${PREFIX} renamed` })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(`${PREFIX} renamed`)
    })
})
