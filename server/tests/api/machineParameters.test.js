/**
 * @file machineParameters.test.js
 * @description Tests for DELETE /api/machine-parameters/:id — happy path +
 * main failure case tier per CLAUDE.md. The main failure case is the new
 * guard blocking an unlink while the machine has an in_progress run (a link
 * unlinked mid-run would let /complete's relational validation wrongly
 * reject, or in a tighter race silently miss, an operator's honest output).
 * P2003 (still referenced by run history) is already covered by
 * errorHandler.test.js — not duplicated here.
 *
 * Fixtures created directly via prisma with the VT-MACHINEPARAMS prefix: a
 * throwaway Parameter linked to the baseline machine, with no run history of
 * its own, so it's actually deletable once no run is in progress.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-MACHINEPARAMS'

let baseline
let counter = 0

async function cleanup(machineId) {
    await prisma.productionRun.deleteMany({ where: { machineId, status: 'in_progress' } })
    await prisma.machineParameter.deleteMany({ where: { parameter: { name: { startsWith: PREFIX } } } })
    await prisma.parameter.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    baseline = await getBaseline()
    await cleanup(baseline.machine.id)
})

afterAll(async () => {
    await cleanup(baseline.machine.id)
})

async function createLink(name) {
    counter += 1
    const parameter = await prisma.parameter.create({ data: { name: `${PREFIX} ${name}`, unit: 'C' } })
    // displayOrder defaults to 0, which the seed's own baseline link already
    // occupies (@@unique([machineId, displayOrder])) — use a distinct value
    // per created link so this collides with neither the seed nor itself.
    return prisma.machineParameter.create({
        data: { machineId: baseline.machine.id, parameterId: parameter.id, displayOrder: 100 + counter }
    })
}

describe('POST /api/machine-parameters — displayOrder type validation (Group 3 #12)', () => {
    it('rejects a non-integer displayOrder with 400', async () => {
        counter += 1
        const parameter = await prisma.parameter.create({ data: { name: `${PREFIX} post noninteger`, unit: 'C' } })
        const res = await request(app).post('/api/machine-parameters').send({
            machineId: baseline.machine.id, parameterId: parameter.id, displayOrder: 1.5
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('displayOrder must be a non-negative integer when provided')
    })

    it('rejects a negative displayOrder with 400', async () => {
        counter += 1
        const parameter = await prisma.parameter.create({ data: { name: `${PREFIX} post negative`, unit: 'C' } })
        const res = await request(app).post('/api/machine-parameters').send({
            machineId: baseline.machine.id, parameterId: parameter.id, displayOrder: -1
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('displayOrder must be a non-negative integer when provided')
    })

    it('accepts a valid explicit displayOrder', async () => {
        counter += 1
        const parameter = await prisma.parameter.create({ data: { name: `${PREFIX} post valid`, unit: 'C' } })
        const res = await request(app).post('/api/machine-parameters').send({
            machineId: baseline.machine.id, parameterId: parameter.id, displayOrder: 100 + counter
        })
        expect(res.status).toBe(201)
        expect(res.body.displayOrder).toBe(100 + counter)
        await prisma.machineParameter.delete({ where: { id: res.body.id } })
    })
})

describe('PUT /api/machine-parameters/:id — displayOrder type validation (Group 3 #12)', () => {
    it('rejects a non-integer displayOrder with 400', async () => {
        const link = await createLink('put noninteger')
        const res = await request(app).put(`/api/machine-parameters/${link.id}`).send({ displayOrder: 1.5 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('displayOrder must be a non-negative integer')
        await prisma.machineParameter.delete({ where: { id: link.id } })
    })

    it('rejects a negative displayOrder with 400', async () => {
        const link = await createLink('put negative')
        const res = await request(app).put(`/api/machine-parameters/${link.id}`).send({ displayOrder: -1 })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('displayOrder must be a non-negative integer')
        await prisma.machineParameter.delete({ where: { id: link.id } })
    })

    it('accepts a valid displayOrder', async () => {
        const link = await createLink('put valid')
        counter += 1
        const res = await request(app).put(`/api/machine-parameters/${link.id}`).send({ displayOrder: 200 + counter })
        expect(res.status).toBe(200)
        expect(res.body.displayOrder).toBe(200 + counter)
        await prisma.machineParameter.delete({ where: { id: link.id } })
    })
})

describe('DELETE /api/machine-parameters/:id', () => {
    it('rejects the unlink with 409 while the machine has a run in progress', async () => {
        const link = await createLink('blocked')
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(), startTime: new Date(),
                operatorId: baseline.operator.id, machineId: baseline.machine.id,
                productId: baseline.product.id, recipeId: baseline.recipe.id
            }
        })

        const res = await request(app).delete(`/api/machine-parameters/${link.id}`)
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('Cannot unlink this parameter while the machine has a run in progress')

        const stillThere = await prisma.machineParameter.findUnique({ where: { id: link.id } })
        expect(stillThere).not.toBeNull()

        await prisma.productionRun.delete({ where: { id: run.id } })
    })

    it('unlinks normally with 200 when no run is in progress', async () => {
        const link = await createLink('happy path')

        const res = await request(app).delete(`/api/machine-parameters/${link.id}`)
        expect(res.status).toBe(200)
        expect(res.body.message).toBe('Parameter unlinked from machine successfully')

        const gone = await prisma.machineParameter.findUnique({ where: { id: link.id } })
        expect(gone).toBeNull()
    })

    it('returns 404 for an unknown link id', async () => {
        const res = await request(app).delete(`/api/machine-parameters/${crypto.randomUUID()}`)
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('Record not found')
    })
})
