/**
 * @file errorHandler.test.js
 * @description Tests for the central error middleware (middleware/errorHandler.js) —
 * happy path + main failure case tier per CLAUDE.md, since this is cross-cutting
 * infra, not stock math. Exercises the Prisma error codes it maps (P2002 on two
 * different routes — proving the mapping isn't route-specific — P2003×2
 * directions, one locally overridden, P2025) plus the malformed-JSON pass-through,
 * through real routes rather than unit-testing the middleware in isolation, since
 * that's how it's actually reached.
 *
 * The anonymous `clientMessage` fallback is the one branch that CANNOT be reached
 * through a real route any more: every unique constraint in the app is now either
 * tagged by its route or pre-checked into a 400 before Prisma sees it. It gets a
 * synthetic fixture below rather than being left uncovered.
 *
 * Rows created here use the VT-ERR prefix; beforeAll/afterAll clean up leftovers.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'
import errorHandler from '../../middleware/errorHandler.js'

// A minimal throwaway app for the "genuinely unrecognized error" case below —
// still a real HTTP request through the real middleware (supertest), just not
// through a production route, so this test stops depending on whichever real
// bug happens to be unfixed at the moment (this fixture has already had to be
// re-pointed once: ?limit=abc, since fixed, then machineParameters.js's
// numeric machineId, also since fixed).
const throwingApp = express()
throwingApp.get('/boom', () => {
    throw new Error('deliberately unrecognized error for test coverage')
})
throwingApp.use(errorHandler)

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
    it('maps P2002 (unique constraint) to 409, carrying the route\'s own message through a $transaction', async () => {
        await request(app).post('/api/machines').send({ name: `${PREFIX} one`, code: `${PREFIX}-1` })
        const second = await request(app).post('/api/machines').send({ name: `${PREFIX} two`, code: `${PREFIX}-2` })
        expect(second.status).toBe(201)

        // machines.js's PUT raises this from inside prisma.$transaction — the
        // only tagged P2002 in the app that has to survive one — so this is
        // also the proof that the error identity is not rewritten on the way out.
        const res = await request(app).put(`/api/machines/${second.body.id}`).send({ code: `${PREFIX}-1` })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A machine with this code already exists')
    })

    it('maps P2002 (unique constraint) to 409 on a second route (products), proving the mapping is not route-specific', async () => {
        await request(app).post('/api/products').send({ name: `${PREFIX} one`, code: `${PREFIX}-P1`, unit: 'kg' })
        const second = await request(app).post('/api/products').send({ name: `${PREFIX} two`, code: `${PREFIX}-P2`, unit: 'kg' })
        expect(second.status).toBe(201)

        const res = await request(app).put(`/api/products/${second.body.id}`).send({ code: `${PREFIX}-P1` })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('A product with this code already exists')
    })

    it('falls back to the anonymous message when a P2002 carries no clientMessage', async () => {
        // No real route reaches this branch any more, so it uses the same
        // throwaway-app fixture as the unrecognized-error case above, for the
        // same stated reason: a coverage test should not depend on which route
        // happens to be missing its tag this month. Synthetic error, but the
        // branch it guards is a literal `err.code === 'P2002'` string compare —
        // the four route tests above keep the real-Prisma-shape half proven.
        const untaggedApp = express()
        untaggedApp.get('/dup', () => {
            throw Object.assign(new Error('untagged unique violation'), { code: 'P2002' })
        })
        untaggedApp.use(errorHandler)

        const res = await request(untaggedApp).get('/dup')
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

    it('maps a locally-handled P2003 (machine-parameter unlink) to 409 with the friendlier message', async () => {
        // The seed's templateRun recorded a value against this MachineParameter link,
        // so RunParameterValue's RESTRICT foreign key blocks this delete — the link
        // is never actually removed, so this is safe to run against the shared fixture.
        const res = await request(app).delete(`/api/machine-parameters/${baselineMachineParameter.id}`)
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('This parameter has recorded run values and cannot be removed')
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

describe('central error middleware — logging', () => {
    it('does not console.error a routine, already-classified conflict', async () => {
        // Pre-refactor, every route only console.error'd errors nothing else
        // recognized — an expected 409 (duplicate link) was never logged.
        // Locks that behavior in so a future change can't silently regress it.
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const res = await request(app)
            .post('/api/machine-products')
            .send({ machineId: baseline.machine.id, productId: baseline.product.id })
        expect(res.status).toBe(409)
        expect(errorSpy).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('does console.error a genuinely unrecognized error (falls through to 500)', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const res = await request(throwingApp).get('/boom')
        expect(res.status).toBe(500)
        expect(errorSpy).toHaveBeenCalledTimes(1)
        errorSpy.mockRestore()
    })
})

describe('central error middleware — malformed request body', () => {
    it('maps an unparseable JSON body to 400 with the real parse-error message, not a generic string', async () => {
        const res = await request(app)
            .post('/api/machines')
            .set('Content-Type', 'application/json')
            .send('{not valid json')
        expect(res.status).toBe(400)
        // Exact wording is V8-version-dependent (it has already changed once
        // across Node versions) — assert it's the real, JSON-specific message
        // and not the old hardcoded fallback string.
        expect(res.body.error).toMatch(/JSON/)
        expect(res.body.error).not.toBe('Malformed request')
    })

    it('maps an oversized payload to 413 with the real body-parser message', async () => {
        // The real app's express.json() has no configured limit, so this uses
        // a minimal throwaway app (same pattern as `throwingApp` above) with a
        // tiny limit to trigger body-parser's 413 deterministically.
        const tinyLimitApp = express()
        tinyLimitApp.use(express.json({ limit: '10b' }))
        tinyLimitApp.post('/x', (req, res) => res.json({ ok: true }))
        tinyLimitApp.use(errorHandler)

        const res = await request(tinyLimitApp)
            .post('/x')
            .set('Content-Type', 'application/json')
            .send({ notes: 'this body is longer than ten bytes' })
        expect(res.status).toBe(413)
        expect(res.body.error).toMatch(/entity too large/i)
        expect(res.body.error).not.toBe('Malformed request')
    })
})
