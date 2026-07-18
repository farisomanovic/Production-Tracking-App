/**
 * @file machines.codeNormalize.test.js
 * @description Tests for PUT /api/machines/:id normalizing blank/whitespace
 * `code` to null instead of writing literal "" (todo.md Group 3 #11) — an
 * unguarded "" would occupy the Machine.code unique constraint's single
 * empty-string slot and P2002 the next machine saved the same way.
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
})
