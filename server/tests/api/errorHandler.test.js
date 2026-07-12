/**
 * @file errorHandler.test.js
 * @description Tests for the central error middleware (middleware/errorHandler.js) —
 * happy path + main failure case tier per CLAUDE.md, since this is cross-cutting
 * infra, not stock math. Exercises the Prisma error codes it maps (P2002 on two
 * different routes — proving the mapping isn't route-specific — P2003×2
 * directions, P2025) plus the malformed-JSON pass-through, through real routes
 * rather than unit-testing the middleware in isolation, since that's how it's
 * actually reached.
 *
 * Rows created here use the VT-ERR prefix; beforeAll/afterAll clean up leftovers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-ERR'

let baseline
let baselineMachineParameter

async function cleanup() {
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    baseline = await getBaseline()
    // getBaseline() doesn't expose the seed's MachineParameter link — read it
    // directly by the same machine/parameter markers helpers.js uses.
    baselineMachineParameter = await prisma.machineParameter.findFirst({
        where: { machineId: baseline.machine.id }
    })
    await cleanup()
})

afterAll(cleanup)

describe('central error middleware — Prisma error mapping', () => {
    it('maps P2002 (unique constraint) to 409', async () => {
        await request(app).post('/api/machines').send({ name: `${PREFIX} one`, code: `${PREFIX}-1` })
        const second = await request(app).post('/api/machines').send({ name: `${PREFIX} two`, code: `${PREFIX}-2` })
        expect(second.status).toBe(201)

        const res = await request(app).put(`/api/machines/${second.body.id}`).send({ code: `${PREFIX}-1` })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A record with this value already exists')
    })

    it('maps P2002 (unique constraint) to 409 on a second route (products), proving the mapping is not route-specific', async () => {
        await request(app).post('/api/products').send({ name: `${PREFIX} one`, code: `${PREFIX}-P1`, unit: 'kg' })
        const second = await request(app).post('/api/products').send({ name: `${PREFIX} two`, code: `${PREFIX}-P2`, unit: 'kg' })
        expect(second.status).toBe(201)

        const res = await request(app).put(`/api/products/${second.body.id}`).send({ code: `${PREFIX}-P1` })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A record with this value already exists')
    })

    it('maps P2025 (record not found) to 404', async () => {
        const res = await request(app)
            .put(`/api/operators/${crypto.randomUUID()}`)
            .send({ name: 'nobody' })
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('Record not found')
    })

    it('maps P2003 (bad foreign key) on a create to 400', async () => {
        const res = await request(app)
            .post('/api/machine-products')
            .send({ machineId: baseline.machine.id, productId: crypto.randomUUID() })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('One or more referenced records do not exist')
    })

    it('maps P2003 (referenced elsewhere) on a delete to 409', async () => {
        // The seed's templateRun recorded a value against this MachineParameter link,
        // so RunParameterValue's RESTRICT foreign key blocks this delete — the link
        // is never actually removed, so this is safe to run against the shared fixture.
        const res = await request(app).delete(`/api/machine-parameters/${baselineMachineParameter.id}`)
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('This record is still referenced elsewhere and cannot be removed')
    })

    it('maps a locally-handled P2002 (machine-products link) to 409 with the friendlier message', async () => {
        // machineProducts.js keeps its own catch for the nicer per-resource
        // message, but must still land on the same 409 as every other route.
        // The seed already links baseline.machine to baseline.product, so
        // repeating that exact pair is guaranteed to collide.
        const res = await request(app)
            .post('/api/machine-products')
            .send({ machineId: baseline.machine.id, productId: baseline.product.id })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('This product is already linked to this machine')
    })
})

describe('central error middleware — malformed request body', () => {
    it('maps an unparseable JSON body to 400 instead of 500', async () => {
        const res = await request(app)
            .post('/api/machines')
            .set('Content-Type', 'application/json')
            .send('{not valid json')
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Malformed request')
    })
})
