/**
 * @file machines.duplicateCode.test.js
 * @description Tests that POST and PUT /api/machines report a Machine.code
 * collision with a message that names the resource and the field, rather than
 * letting it fall through to errorHandler.js's anonymous default. The status
 * (409) was always right; only the sentence was missing, and
 * client/src/lib/errorMessage.js shows that sentence to the operator verbatim.
 *
 * Deliberately NOT covered here: a case-only variant. Machine_code_key has no
 * lower() index — unlike Material_name_lower_key / Parameter_name_lower_key —
 * so "EXT-01" and "ext-01" are two legitimately distinct codes, and asserting a
 * 409 for one would pin a behavior the database does not have. The
 * whitespace-variant collision belongs to machines.codeNormalize.test.js.
 *
 * Cleanup filters on `name`, not `code`: these tests rewrite `code` and never
 * touch `name`, so a name filter cannot leak a renamed row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-MDUP'

async function cleanup() {
    await prisma.machine.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(cleanup)
afterAll(cleanup)

describe('POST /api/machines — duplicate code', () => {
    it('rejects a code already taken by another machine with 409 and a resource-specific message', async () => {
        const taken = `${PREFIX}-POST`
        const first = await request(app).post('/api/machines').send({ name: `${PREFIX} first`, code: taken })
        expect(first.status).toBe(201)

        const res = await request(app).post('/api/machines').send({ name: `${PREFIX} second`, code: taken })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A machine with this code already exists')
    })
})

describe('PUT /api/machines/:id — duplicate code', () => {
    it('rejects renaming a code into one already taken with 409 and a resource-specific message', async () => {
        const taken = `${PREFIX}-PUT-A`
        const first = await request(app).post('/api/machines').send({ name: `${PREFIX} put first`, code: taken })
        expect(first.status).toBe(201)
        const second = await request(app).post('/api/machines').send({ name: `${PREFIX} put second`, code: `${PREFIX}-PUT-B` })
        expect(second.status).toBe(201)

        const res = await request(app).put(`/api/machines/${second.body.id}`).send({ code: taken })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A machine with this code already exists')

        // The tag is applied around a $transaction, so prove the rejected write
        // rolled back rather than half-applying.
        const after = await prisma.machine.findUnique({ where: { id: second.body.id } })
        expect(after.code).toBe(`${PREFIX}-PUT-B`)
    })
})
