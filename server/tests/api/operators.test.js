/**
 * @file operators.test.js
 * @description Tests for /api/operators — "happy path + main failure case"
 * tier per CLAUDE.md. Covers the `name` string-type validation (a non-string
 * name used to reach Prisma and crash as an unclassifiable 500 instead of a
 * clean 400) and the whitespace normalization applied on write.
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

    it('rejects a numeric name with 400', async () => {
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

    // Operator.name has no unique index — deliberately, since soft-delete lets
    // a name be reused — so nothing downstream can catch "  Emina  " and
    // "Emina" being two people. Normalizing on write is the only guard there is.
    it('trims and collapses inner whitespace in name', async () => {
        const res = await request(app).post('/api/operators').send({ name: `  ${PREFIX}   spaced   name  ` })
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(`${PREFIX} spaced name`)
    })
})

describe('PUT /api/operators/:id — name validation', () => {
    it('rejects a numeric name with 400', async () => {
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

    it('rejects an empty-string name with 400 and leaves the row unchanged', async () => {
        const operator = await prisma.operator.create({ data: { name: `${PREFIX} blank target` } })
        const res = await request(app).put(`/api/operators/${operator.id}`).send({ name: '' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name cannot be blank')
        const after = await prisma.operator.findUnique({ where: { id: operator.id } })
        expect(after.name).toBe(operator.name)
    })

    it('rejects a whitespace-only name with 400 and leaves the row unchanged', async () => {
        const operator = await prisma.operator.create({ data: { name: `${PREFIX} whitespace target` } })
        const res = await request(app).put(`/api/operators/${operator.id}`).send({ name: '   ' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name cannot be blank')
        const after = await prisma.operator.findUnique({ where: { id: operator.id } })
        expect(after.name).toBe(operator.name)
    })

    // Pins the chosen semantics: the blank guard rejects blank, it does not
    // reject padding — padding is accepted and then normalized away. Padding
    // on the left is safe to send precisely because the route trims it: the
    // stored row still starts with PREFIX, so `afterAll`'s
    // `startsWith(PREFIX)` cleanup still finds it.
    it('accepts a padded name and stores it trimmed and collapsed', async () => {
        const operator = await prisma.operator.create({ data: { name: `${PREFIX} padded target` } })
        const res = await request(app).put(`/api/operators/${operator.id}`).send({ name: `  ${PREFIX}   padded   ` })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(`${PREFIX} padded`)
    })
})
