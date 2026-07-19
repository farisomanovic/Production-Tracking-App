/**
 * @file productionRuns.list.test.js
 * @description Tests for GET /api/production-runs — todo.md Group 4 #6 and #2:
 * dateFrom/dateTo and array-shaped query params (repeated keys, e.g.
 * ?machineId=a&machineId=b) reached Prisma unvalidated and threw a 500, and
 * so did a non-numeric limit. Fixtures follow productionRuns.update.test.js's
 * conventions.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-LIST'

let baseline
let runId

beforeAll(async () => {
    baseline = await getBaseline()
    const run = await prisma.productionRun.create({
        data: {
            date: new Date('2026-06-15T00:00:00.000Z'),
            startTime: new Date('2026-06-15T08:00:00.000Z'),
            operatorId: baseline.operator.id,
            machineId: baseline.machine.id,
            productId: baseline.product.id,
            recipeId: baseline.recipe.id,
            notes: `${PREFIX} fixture`
        }
    })
    runId = run.id
})

afterAll(async () => {
    await prisma.productionRun.deleteMany({ where: { id: runId } })
})

const get = (query) => request(app).get('/api/production-runs').query(query)

describe('GET /api/production-runs', () => {
    it('filters by dateFrom/dateTo and returns the matching run', async () => {
        const res = await get({ dateFrom: '2026-06-15', dateTo: '2026-06-15' })
        expect(res.status).toBe(200)
        expect(res.body.some((run) => run.id === runId)).toBe(true)
    })

    it('caps the result count with a valid limit', async () => {
        const res = await get({ limit: 1 })
        expect(res.status).toBe(200)
        expect(res.body.length).toBeLessThanOrEqual(1)
    })

    it('rejects a malformed dateFrom with 400 (Group 4 #6)', async () => {
        const res = await get({ dateFrom: 'banana' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('dateFrom must be a valid YYYY-MM-DD date')
    })

    it('rejects an array-shaped query param with 400 (Group 4 #6)', async () => {
        const res = await request(app).get('/api/production-runs?machineId=a&machineId=b')
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('machineId must be a single value')
    })

    it('rejects a non-integer limit with 400 (Group 4 #2)', async () => {
        const res = await get({ limit: 'abc' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('limit must be a positive integer')
    })

    it('clamps an oversized limit instead of erroring (Group 4 #4)', async () => {
        const res = await get({ limit: 5000 })
        expect(res.status).toBe(200)
    })
})

describe('GET /api/production-runs — stable order & select shape (Group 4 #4)', () => {
    let earlyRunId, lateRunId

    beforeAll(async () => {
        // status: 'completed' — a partial unique index allows only one
        // in_progress run per machine at a time (todo.md Group 8 #16), and
        // this file's own top-level beforeAll already holds that slot.
        const early = await prisma.productionRun.create({
            data: {
                date: new Date('2026-06-16T00:00:00.000Z'),
                startTime: new Date('2026-06-16T08:00:00.000Z'),
                status: 'completed',
                operatorId: baseline.operator.id,
                machineId: baseline.machine.id,
                productId: baseline.product.id,
                recipeId: baseline.recipe.id,
                notes: `${PREFIX} tiebreak early`
            }
        })
        earlyRunId = early.id

        const late = await prisma.productionRun.create({
            data: {
                date: new Date('2026-06-16T00:00:00.000Z'),
                startTime: new Date('2026-06-16T14:00:00.000Z'),
                status: 'completed',
                operatorId: baseline.operator.id,
                machineId: baseline.machine.id,
                productId: baseline.product.id,
                recipeId: baseline.recipe.id,
                notes: `${PREFIX} tiebreak late`
            }
        })
        lateRunId = late.id
    })

    afterAll(async () => {
        await prisma.productionRun.deleteMany({ where: { id: { in: [earlyRunId, lateRunId] } } })
    })

    it('orders same-day runs by startTime descending as a tiebreaker', async () => {
        const res = await get({ dateFrom: '2026-06-16', dateTo: '2026-06-16' })
        expect(res.status).toBe(200)
        const ids = res.body.map((run) => run.id)
        expect(ids.indexOf(lateRunId)).toBeLessThan(ids.indexOf(earlyRunId))
    })

    it('selects only name off machine/operator/product and omits recipe entirely', async () => {
        const res = await get({ dateFrom: '2026-06-16', dateTo: '2026-06-16' })
        expect(res.status).toBe(200)
        const run = res.body.find((r) => r.id === lateRunId)
        expect(run).toMatchObject({
            machine: { name: baseline.machine.name },
            operator: { name: baseline.operator.name },
            product: { name: baseline.product.name }
        })
        expect(run.recipe).toBeUndefined()
        expect(run.machine.code).toBeUndefined()
    })
})
