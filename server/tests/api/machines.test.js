/**
 * @file machines.test.js
 * @description Tests for /api/machines — "happy path + main failure case"
 * tier per CLAUDE.md. Covers the `name` string-type validation (a non-string
 * name used to reach Prisma and crash as an unclassifiable 500 instead of a
 * clean 400) and the whitespace normalization applied on write. `code`
 * normalization has its own dedicated file, machines.codeNormalize.test.js.
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

    // `code` has been trimmed since PR #65 (machines.codeNormalize.test.js);
    // `name` was left raw, so one machine could carry a clean code and a
    // padded name. This pins the two identifiers to the same rule.
    it('trims and collapses inner whitespace in name', async () => {
        const res = await request(app).post('/api/machines').send({ name: `  ${PREFIX}   spaced   name  ` })
        expect(res.status).toBe(201)
        expect(res.body.name).toBe(`${PREFIX} spaced name`)
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

    it('rejects an empty-string name with 400 and leaves the row unchanged', async () => {
        const machine = await prisma.machine.create({ data: { name: `${PREFIX} blank target` } })
        const res = await request(app).put(`/api/machines/${machine.id}`).send({ name: '' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name cannot be blank')
        const after = await prisma.machine.findUnique({ where: { id: machine.id } })
        expect(after.name).toBe(machine.name)
    })

    it('rejects a whitespace-only name with 400 and leaves the row unchanged', async () => {
        const machine = await prisma.machine.create({ data: { name: `${PREFIX} whitespace target` } })
        const res = await request(app).put(`/api/machines/${machine.id}`).send({ name: '   ' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('name cannot be blank')
        const after = await prisma.machine.findUnique({ where: { id: machine.id } })
        expect(after.name).toBe(machine.name)
    })

    it('trims and collapses inner whitespace in a renamed name', async () => {
        const machine = await prisma.machine.create({ data: { name: `${PREFIX} rename target` } })
        const res = await request(app).put(`/api/machines/${machine.id}`).send({ name: `  ${PREFIX}   renamed   spaced  ` })
        expect(res.status).toBe(200)
        expect(res.body.name).toBe(`${PREFIX} renamed spaced`)
    })
})
