/**
 * @file machines.codeNormalize.test.js
 * @description Tests for POST and PUT /api/machines normalizing blank/whitespace
 * `code` to null instead of writing literal "", on both POST and PUT and for an
 * explicit null — an unguarded "" would occupy the
 * Machine.code unique constraint's single empty-string slot and P2002 the next
 * machine saved the same way, and an unguarded null would throw on `.trim()`.
 *
 * Also covers `code`'s type validation, which guards the same `.trim()` call
 * from the other direction: a non-string, non-null value used to reach
 * normalizeCode and throw a raw TypeError — an error class errorHandler.js can
 * never classify, so it surfaced as a 500 with a stack trace instead of a 400.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-MCODE'

let machineA
let machineB

async function cleanup() {
    await prisma.machine.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    machineA = await prisma.machine.create({ data: { name: `${PREFIX} A`, code: `${PREFIX}-A` } })
    machineB = await prisma.machine.create({ data: { name: `${PREFIX} B`, code: `${PREFIX}-B` } })
})

afterAll(cleanup)

describe('PUT /api/machines/:id — code normalization', () => {
    it('normalizes an empty string to null', async () => {
        const res = await request(app).put(`/api/machines/${machineA.id}`).send({ code: '' })
        expect(res.status).toBe(200)
        expect(res.body.code).toBeNull()
    })

    it('normalizes a whitespace-only string to null', async () => {
        const res = await request(app).put(`/api/machines/${machineB.id}`).send({ code: '   ' })
        expect(res.status).toBe(200)
        expect(res.body.code).toBeNull()
    })

    it('trims a non-blank code', async () => {
        const res = await request(app).put(`/api/machines/${machineA.id}`).send({ code: `  ${PREFIX}-A2  ` })
        expect(res.status).toBe(200)
        expect(res.body.code).toBe(`${PREFIX}-A2`)
    })

    it('allows two different machines to both be saved with code: "" without colliding', async () => {
        const resA = await request(app).put(`/api/machines/${machineA.id}`).send({ code: '' })
        const resB = await request(app).put(`/api/machines/${machineB.id}`).send({ code: '' })
        expect(resA.status).toBe(200)
        expect(resB.status).toBe(200)
        expect(resA.body.code).toBeNull()
        expect(resB.body.code).toBeNull()
    })

    it('leaves code untouched when omitted from the body', async () => {
        const before = await prisma.machine.findUnique({ where: { id: machineA.id } })
        const res = await request(app).put(`/api/machines/${machineA.id}`).send({ name: `${PREFIX} A renamed` })
        expect(res.status).toBe(200)
        expect(res.body.code).toBe(before.code)
    })

    it('accepts an explicit null without crashing', async () => {
        const res = await request(app).put(`/api/machines/${machineA.id}`).send({ code: null })
        expect(res.status).toBe(200)
        expect(res.body.code).toBeNull()
    })
})

describe('PUT /api/machines/:id — code type validation', () => {
    // Its own target row, not machineA/machineB: the normalization block above
    // rewrites both of their codes, so asserting "unchanged" against either
    // would depend on test order rather than on the guard.
    it('rejects a numeric code with 400 and leaves the row unchanged', async () => {
        const machine = await prisma.machine.create({
            data: { name: `${PREFIX} typecheck target`, code: `${PREFIX}-TC` }
        })
        const res = await request(app).put(`/api/machines/${machine.id}`).send({ code: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('code must be a string')
        // Proves the guard runs before the $transaction opens, not inside it.
        const after = await prisma.machine.findUnique({ where: { id: machine.id } })
        expect(after.code).toBe(machine.code)
    })

    // Separate from the numeric case: pins the guard to `typeof !== 'string'`
    // rather than a number-specific check.
    it('rejects a boolean code with 400', async () => {
        const res = await request(app).put(`/api/machines/${machineA.id}`).send({ code: true })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('code must be a string')
    })
})

describe('POST /api/machines — code normalization', () => {
    it('normalizes an empty string to null', async () => {
        const res = await request(app).post('/api/machines').send({ name: `${PREFIX} C`, code: '' })
        expect(res.status).toBe(201)
        expect(res.body.code).toBeNull()
    })

    it('normalizes a whitespace-only string to null', async () => {
        const res = await request(app).post('/api/machines').send({ name: `${PREFIX} D`, code: '   ' })
        expect(res.status).toBe(201)
        expect(res.body.code).toBeNull()
    })

    it('trims a non-blank code', async () => {
        const res = await request(app).post('/api/machines').send({ name: `${PREFIX} E`, code: `  ${PREFIX}-E  ` })
        expect(res.status).toBe(201)
        expect(res.body.code).toBe(`${PREFIX}-E`)
    })

    it('allows two different machines to both be created with code: "" without colliding', async () => {
        const resA = await request(app).post('/api/machines').send({ name: `${PREFIX} F`, code: '' })
        const resB = await request(app).post('/api/machines').send({ name: `${PREFIX} G`, code: '' })
        expect(resA.status).toBe(201)
        expect(resB.status).toBe(201)
        expect(resA.body.code).toBeNull()
        expect(resB.body.code).toBeNull()
    })
})

describe('POST /api/machines — code type validation', () => {
    it('rejects a numeric code with 400', async () => {
        const res = await request(app).post('/api/machines').send({ name: `${PREFIX} H`, code: 123 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('code must be a string')
    })

    // The type guard has to let null through: the column is nullable and null
    // is how a caller says "no code". PUT has covered this since PR #65; POST
    // never did, which left the null branch of the guard unpinned.
    it('accepts an explicit null without crashing', async () => {
        const res = await request(app).post('/api/machines').send({ name: `${PREFIX} I`, code: null })
        expect(res.status).toBe(201)
        expect(res.body.code).toBeNull()
    })
})
