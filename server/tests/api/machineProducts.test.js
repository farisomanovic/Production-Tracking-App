/**
 * @file machineProducts.test.js
 * @description Tests for POST /api/machine-products and DELETE
 * /api/machine-products/:id — happy path + main failure case tier per
 * CLAUDE.md. POST's covered failure is a non-string link id, which used to pass
 * the route's truthiness-only guard and die inside Prisma as an unclassifiable
 * 500; its 409 (duplicate) and 400 (bad foreign key) paths live in
 * errorHandler.test.js and are not duplicated here. POST's 201 has no test
 * anywhere — a pre-existing gap, filed as todo.md Group 8 #43 rather than
 * fixed here. DELETE's main failure case is the
 * guard blocking an unlink while the machine has an in_progress run — before
 * this guard, unlinking a product mid-run would leave the run referencing a
 * product its machine is no longer configured to make — with no RESTRICT
 * foreign key anywhere to stop it, unlike MachineParameter. (Before Group 5
 * #11 the same unlink could also get a legitimate output rejected by
 * /complete's relational validation; that check is gone now that the produced
 * product is simply the run's own, validated once at creation.)
 *
 * Fixtures created directly via prisma with the VT-MACHINEPRODUCTS prefix: a
 * throwaway Product linked to the baseline machine, with no run history of
 * its own, so it's actually deletable once no run is in progress.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-MACHINEPRODUCTS'

let baseline
let counter = 0

async function cleanup(machineId) {
    await prisma.productionRun.deleteMany({ where: { machineId, status: 'in_progress' } })
    await prisma.machineProduct.deleteMany({ where: { product: { code: { startsWith: PREFIX } } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    baseline = await getBaseline()
    await cleanup(baseline.machine.id)
})

afterAll(async () => {
    await cleanup(baseline.machine.id)
})

async function createLink() {
    counter += 1
    const product = await prisma.product.create({
        data: { name: `${PREFIX} ${counter}`, code: `${PREFIX}-${counter}`, unit: 'kg' }
    })
    return prisma.machineProduct.create({
        data: { machineId: baseline.machine.id, productId: product.id }
    })
}

describe('POST /api/machine-products — machineId/productId type validation', () => {
    // Both cases send a valid id on the other side of the pair, so the only
    // thing under test is the type of the field named in the title. Neither
    // creates a fixture: the guard rejects before Prisma is reached, so there
    // is nothing to clean up.
    it('rejects a non-string machineId with 400', async () => {
        const res = await request(app).post('/api/machine-products').send({
            machineId: 12345, productId: baseline.product.id
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('machineId and productId are required')
    })

    it('rejects a non-string productId with 400', async () => {
        const res = await request(app).post('/api/machine-products').send({
            machineId: baseline.machine.id, productId: 12345
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('machineId and productId are required')
    })
})

describe('DELETE /api/machine-products/:id', () => {
    it('rejects the unlink with 409 while the machine has a run in progress', async () => {
        const link = await createLink()
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(), startTime: new Date(),
                operatorId: baseline.operator.id, machineId: baseline.machine.id,
                productId: baseline.product.id, recipeId: baseline.recipe.id
            }
        })

        const res = await request(app).delete(`/api/machine-products/${link.id}`)
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('Cannot unlink this product while the machine has a run in progress')

        const stillThere = await prisma.machineProduct.findUnique({ where: { id: link.id } })
        expect(stillThere).not.toBeNull()

        await prisma.productionRun.delete({ where: { id: run.id } })
    })

    it('unlinks normally with 200 when no run is in progress', async () => {
        const link = await createLink()

        const res = await request(app).delete(`/api/machine-products/${link.id}`)
        expect(res.status).toBe(200)
        expect(res.body.message).toBe('Product unlinked from machine successfully')

        const gone = await prisma.machineProduct.findUnique({ where: { id: link.id } })
        expect(gone).toBeNull()
    })

    it('returns 404 for an unknown link id', async () => {
        const res = await request(app).delete(`/api/machine-products/${crypto.randomUUID()}`)
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('Record not found')
    })
})
