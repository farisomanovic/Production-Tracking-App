/**
 * @file productionRuns.list.test.js
 * @description Tests for GET /api/production-runs query-param validation:
 * dateFrom/dateTo and array-shaped query params (repeated keys, e.g.
 * ?machineId=a&machineId=b) reached Prisma unvalidated and threw a 500, and
 * so did a non-numeric limit. The third describe covers `status`, which
 * was the one filter passed straight to Prisma, so a typo answered 200 [] and
 * the caller could not tell it apart from "nothing matched". Fixtures follow
 * productionRuns.update.test.js's conventions.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { VALID_STATUSES } from '../../lib/validation.js'
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

    it('rejects a malformed dateFrom with 400', async () => {
        const res = await get({ dateFrom: 'banana' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('dateFrom must be a valid YYYY-MM-DD date')
    })

    it('rejects an array-shaped query param with 400', async () => {
        const res = await request(app).get('/api/production-runs?machineId=a&machineId=b')
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('machineId must be a single value')
    })

    it('rejects a non-integer limit with 400', async () => {
        const res = await get({ limit: 'abc' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('limit must be a positive integer')
    })

    it('clamps an oversized limit instead of erroring', async () => {
        const res = await get({ limit: 5000 })
        expect(res.status).toBe(200)
    })
})

describe('GET /api/production-runs — stable order & select shape', () => {
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
                // Required by ProductionRun_quantityProduced_valid.
                quantityProduced: 1,
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
                quantityProduced: 1,
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

describe('GET /api/production-runs — status filter validation', () => {
    let completedRunId

    beforeAll(async () => {
        // The file's top-level beforeAll already created the in_progress run and
        // holds the one-in-progress-per-machine slot, so this block only needs to
        // supply the other half of the vocabulary.
        const completed = await prisma.productionRun.create({
            data: {
                date: new Date('2026-06-17T00:00:00.000Z'),
                startTime: new Date('2026-06-17T08:00:00.000Z'),
                status: 'completed',
                // Required by ProductionRun_quantityProduced_valid.
                quantityProduced: 1,
                operatorId: baseline.operator.id,
                machineId: baseline.machine.id,
                productId: baseline.product.id,
                recipeId: baseline.recipe.id,
                notes: `${PREFIX} status fixture`
            }
        })
        completedRunId = completed.id
    })

    afterAll(async () => {
        await prisma.productionRun.deleteMany({ where: { id: completedRunId } })
    })

    // Pins the vocabulary, because the it.each below is driven off it: dropping a
    // value from VALID_STATUSES does not fail that test, it *deletes* the case and
    // the run still comes back green with one test fewer. The two literals are not
    // arbitrary either — the partial unique index (WHERE status = 'in_progress')
    // and the quantityProduced CHECK (status <> 'completed') hardcode them, so
    // changing this array without a migration puts the API and the DB into
    // disagreement.
    it('is exactly the vocabulary the database constraints hardcode', () => {
        expect(VALID_STATUSES).toEqual(['in_progress', 'completed'])
    })

    // Driven off the exported constant, like the unit allow-list tests: adding a
    // status to the vocabulary expands this suite instead of leaving a gap.
    it.each(VALID_STATUSES)('accepts status %s and returns only runs with that status', async (status) => {
        const res = await get({ status })
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
        expect(res.body.every((run) => run.status === status)).toBe(true)
    })

    it('rejects an unknown status with 400', async () => {
        const res = await get({ status: 'complete' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe(`status must be one of: ${VALID_STATUSES.join(', ')}`)
    })

    // The vocabulary is case-sensitive everywhere else it is compared (the
    // partial unique index and the quantityProduced CHECK both match the exact
    // literal), so coercing here would let the API accept a value the column
    // can never hold.
    it('rejects a case-mismatched status with 400', async () => {
        const res = await get({ status: 'In_Progress' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe(`status must be one of: ${VALID_STATUSES.join(', ')}`)
    })

    // ?status= is a wiring bug (a state variable that never got set), not a
    // request for every run — unlike dateFrom/dateTo, which ignore an empty value.
    it('rejects an empty status with 400', async () => {
        const res = await get({ status: '' })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe(`status must be one of: ${VALID_STATUSES.join(', ')}`)
    })

    // Guards position, not behaviour: the allow-list check has to sit BELOW the
    // array-shape loop. Above it, a repeated key would reach includes() as an
    // array and be reported as a bad vocabulary value — a message describing the
    // wrong defect. Nothing in the guard's own body says where it belongs.
    it('reports a repeated status key as a shape error, not a vocabulary error', async () => {
        const res = await request(app).get('/api/production-runs?status=a&status=b')
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('status must be a single value')
    })
})
