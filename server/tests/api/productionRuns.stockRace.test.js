/**
 * @file productionRuns.stockRace.test.js
 * @description Concurrency and stock-lifecycle tests for the two transactional
 * endpoints: POST /api/production-runs/:id/complete and DELETE /:id. Covers the
 * double-completion race, the material stock floor (including the exact gte
 * boundary), the endTime guards, cascade deletion with stock restoration, the
 * Material_stockQty_nonnegative CHECK constraint, and the delete-vs-complete
 * race.
 *
 * Ported from the plain-node completion.e2e.test.js, which needed a live server
 * on a second terminal and so was almost never run. Checks that the Vitest suite
 * already made elsewhere were dropped rather than duplicated: the materials PUT
 * stock guards live in materials.test.js, and quantityProduced validation plus
 * the machine/recipe membership rules live in productionRuns.complete.test.js.
 *
 * Fixtures are a self-contained graph under the VT-STOCKRACE prefix — its own
 * machine, parameter, product, material and recipe — not the shared baseline.
 * Two reasons: these tests assert exact stock arithmetic, and owning the machine
 * means owning its ProductionRun_one_in_progress_per_machine slot, so a crash
 * here cannot leave the baseline material's stock wrong for later files.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-STOCKRACE'
const OPENING_STOCK = 1000

let operator
let machine
let machineParameter
let product
let material
let recipe

async function cleanupFixtures() {
    // Children before parents. Deleting the runs takes their RunParameterValue
    // and MaterialUsage rows with them (ON DELETE CASCADE), which is what frees
    // the machine parameter and the material to be deleted below.
    await prisma.productionRun.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.recipeItem.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.machineProduct.deleteMany({ where: { product: { code: { startsWith: PREFIX } } } })
    await prisma.machineParameter.deleteMany({ where: { parameter: { name: { startsWith: PREFIX } } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.parameter.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.material.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    // Only the operator is borrowed from the baseline: nothing here mutates it.
    operator = (await getBaseline()).operator
    await cleanupFixtures()

    machine = await prisma.machine.create({ data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1` } })
    const parameter = await prisma.parameter.create({ data: { name: `${PREFIX} parameter`, unit: 'C' } })
    machineParameter = await prisma.machineParameter.create({
        data: { machineId: machine.id, parameterId: parameter.id, displayOrder: 0 }
    })
    product = await prisma.product.create({
        data: { name: `${PREFIX} product`, code: `${PREFIX}-P1`, unit: 'kg' }
    })
    // Without this link POST /production-runs rejects the pair outright, and
    // /complete rejects any materialId outside the run's recipe — so the
    // RecipeItem below is load-bearing, not decoration.
    await prisma.machineProduct.create({ data: { machineId: machine.id, productId: product.id } })
    material = await prisma.material.create({
        data: { name: `${PREFIX} material`, unit: 'kg', stockQty: OPENING_STOCK }
    })
    recipe = await prisma.recipe.create({
        data: {
            name: `${PREFIX} recipe`,
            products: { create: [{ productId: product.id, isDefault: true }] },
            recipeItems: { create: [{ materialId: material.id, percentage: 100 }] }
        }
    })
})

afterEach(async () => {
    // Through the real route, so a completed run's stock is restored exactly the
    // way any other deletion restores it. This also frees the machine's single
    // in-progress slot, which the next test needs to create its own run.
    const leftovers = await prisma.productionRun.findMany({
        where: { machineId: machine.id },
        select: { id: true }
    })
    for (const run of leftovers) {
        await request(app).delete(`/api/production-runs/${run.id}`)
    }
})

afterAll(async () => {
    await cleanupFixtures()
})

function createRun() {
    return prisma.productionRun.create({
        data: {
            date: new Date(),
            startTime: new Date(),
            operatorId: operator.id,
            machineId: machine.id,
            productId: product.id,
            recipeId: recipe.id
        }
    })
}

// endTime is always derived from the run's OWN startTime, never a fresh
// new Date(): /complete rejects an endTime at or before startTime, and two
// wall-clock reads separated by a single INSERT often land in the same
// millisecond. productionRuns.complete.test.js hit that as ~5% flake.
function payloadFor(run, overrides = {}) {
    return {
        endTime: new Date(run.startTime.getTime() + 60_000).toISOString(),
        parameterValues: [{ machineParameterId: machineParameter.id, value: 210 }],
        materialUsages: [{ materialId: material.id, quantityUsed: 1 }],
        quantityProduced: 1,
        netWeightPerUnit: 1.5,
        grossWeightPerUnit: 1.6,
        scrapKg: 2,
        ...overrides
    }
}

const complete = (id, payload) =>
    request(app).post(`/api/production-runs/${id}/complete`).send(payload)

const remove = (id) => request(app).delete(`/api/production-runs/${id}`)

const stockNow = async () =>
    (await prisma.material.findUnique({ where: { id: material.id } })).stockQty

const childRowsOf = async (runId) =>
    (await prisma.runParameterValue.count({ where: { productionRunId: runId } })) +
    (await prisma.materialUsage.count({ where: { productionRunId: runId } }))

describe('POST /:id/complete — two completions racing on the same run', () => {
    it('lets exactly one win: one 200 and one 409', async () => {
        const run = await createRun()
        const payload = payloadFor(run)

        const [first, second] = await Promise.all([
            complete(run.id, payload),
            complete(run.id, payload)
        ])

        expect([first.status, second.status].sort()).toEqual([200, 409])
        const loser = first.status === 409 ? first : second
        expect(loser.body.error).toBe('Production run is already completed')
    })

    it('decrements stock once and writes exactly one set of child rows', async () => {
        const run = await createRun()
        const before = await stockNow()
        const payload = payloadFor(run)

        await Promise.all([complete(run.id, payload), complete(run.id, payload)])

        expect(await stockNow()).toBe(before - 1)
        const stored = await prisma.productionRun.findUnique({
            where: { id: run.id },
            include: { runParameterValues: true, materialUsages: true }
        })
        expect(stored.runParameterValues).toHaveLength(1)
        expect(stored.materialUsages).toHaveLength(1)
        // The loser must not add its quantity on top of the winner's: now that
        // the quantity is a column on the run rather than a row per output, a
        // double write shows up here as 2.
        expect(stored.quantityProduced).toBe(1)
    })

    it('rejects a sequential second completion with 409', async () => {
        const run = await createRun()
        const payload = payloadFor(run)
        expect((await complete(run.id, payload)).status).toBe(200)

        const second = await complete(run.id, payload)

        expect(second.status).toBe(409)
        expect(second.body.error).toBe('Production run is already completed')
    })
})

describe('DELETE /:id — cascade and stock restoration', () => {
    it('gives back exactly the stock the completed run consumed', async () => {
        const run = await createRun()
        const before = await stockNow()
        const completed = await complete(run.id, payloadFor(run, {
            materialUsages: [{ materialId: material.id, quantityUsed: 7 }]
        }))
        expect(completed.status).toBe(200)
        expect(await stockNow()).toBe(before - 7)

        const deleted = await remove(run.id)

        expect(deleted.status).toBe(200)
        expect(await stockNow()).toBe(before)
    })

    it('removes the run and every child row with it', async () => {
        const run = await createRun()
        await complete(run.id, payloadFor(run))

        await remove(run.id)

        expect(await prisma.productionRun.findUnique({ where: { id: run.id } })).toBeNull()
        expect(await childRowsOf(run.id)).toBe(0)
    })
})

describe('POST /:id/complete — the material stock floor', () => {
    it('refuses to consume more than is on the shelf, naming the material', async () => {
        const run = await createRun()
        const before = await stockNow()

        const res = await complete(run.id, payloadFor(run, {
            materialUsages: [{ materialId: material.id, quantityUsed: before + 1 }]
        }))

        expect(res.status).toBe(409)
        expect(res.body.error).toContain(material.name)
    })

    it('leaves the run in_progress with no partial writes when stock runs out', async () => {
        const run = await createRun()
        const before = await stockNow()

        await complete(run.id, payloadFor(run, {
            materialUsages: [{ materialId: material.id, quantityUsed: before + 1 }]
        }))

        const stored = await prisma.productionRun.findUnique({
            where: { id: run.id },
            include: { runParameterValues: true, materialUsages: true }
        })
        expect(stored.status).toBe('in_progress')
        expect(stored.runParameterValues).toHaveLength(0)
        expect(stored.materialUsages).toHaveLength(0)
        expect(await stockNow()).toBe(before)
    })

    // The compare-and-swap is `gte`, so consuming the last kilogram exactly is
    // legal. This is the case that separates gte from gt.
    it('allows a consumption that lands exactly on zero', async () => {
        const run = await createRun()
        const before = await stockNow()

        const res = await complete(run.id, payloadFor(run, {
            materialUsages: [{ materialId: material.id, quantityUsed: before }]
        }))

        expect(res.status).toBe(200)
        expect(await stockNow()).toBe(0)
    })
})

describe('POST /:id/complete — numeric payload validation', () => {
    // Each case asserts the exact message as well as the status: a 400 alone
    // would also be produced by several unrelated guards further up the handler.
    it.each([
        [
            'a negative quantityUsed',
            () => ({ materialUsages: [{ materialId: material.id, quantityUsed: -5 }] }),
            'Each material usage needs a materialId and a quantityUsed greater than 0'
        ],
        [
            'a string quantityUsed',
            () => ({ materialUsages: [{ materialId: material.id, quantityUsed: '5' }] }),
            'Each material usage needs a materialId and a quantityUsed greater than 0'
        ],
        [
            'a non-numeric parameter value',
            () => ({ parameterValues: [{ machineParameterId: machineParameter.id, value: 'hot' }] }),
            'Each parameter value needs a machineParameterId and a numeric value'
        ],
        [
            'a negative scrapKg',
            () => ({ scrapKg: -1 }),
            'scrapKg must be a number of at least 0 when provided'
        ],
        [
            'a negative netWeightPerUnit',
            () => ({ netWeightPerUnit: -0.5 }),
            'netWeightPerUnit must be a number of at least 0 when provided'
        ],
        [
            'a string grossWeightPerUnit',
            () => ({ grossWeightPerUnit: 'heavy' }),
            'grossWeightPerUnit must be a number of at least 0 when provided'
        ]
    ])('rejects %s with 400, touching neither the run nor the stock', async (_label, buildOverride, expectedError) => {
        const run = await createRun()
        const before = await stockNow()

        const res = await complete(run.id, payloadFor(run, buildOverride()))

        expect(res.status).toBe(400)
        expect(res.body.error).toBe(expectedError)
        const stored = await prisma.productionRun.findUnique({ where: { id: run.id } })
        expect(stored.status).toBe('in_progress')
        expect(await stockNow()).toBe(before)
    })
})

// The route guards above are the friendly 400s; this is the guarantee
// underneath them. Prisma cannot express a CHECK constraint, so without this
// nothing in the suite would notice it disappearing from the database.
describe('Material_stockQty_nonnegative CHECK constraint', () => {
    it('refuses a negative stock written straight to Postgres, bypassing the app', async () => {
        const before = await stockNow()

        await expect(
            prisma.$executeRawUnsafe('UPDATE "Material" SET "stockQty" = -1 WHERE id = $1', material.id)
        ).rejects.toThrow(/stockQty_nonnegative|check constraint/i)

        expect(await stockNow()).toBe(before)
    })
})

describe('POST /:id/complete — endTime guards', () => {
    it('rejects an endTime before the run started', async () => {
        const run = await createRun()

        const res = await complete(run.id, payloadFor(run, {
            endTime: new Date(run.startTime.getTime() - 3_600_000).toISOString()
        }))

        expect(res.status).toBe(400)
        expect(res.body.error).toBe('endTime must be after the run start time')
    })

    // Echoes the stored startTime back verbatim: proves the rule is <=, not <.
    it('rejects an endTime exactly equal to the run start time', async () => {
        const run = await createRun()

        const res = await complete(run.id, payloadFor(run, {
            endTime: run.startTime.toISOString()
        }))

        expect(res.status).toBe(400)
        expect(res.body.error).toBe('endTime must be after the run start time')
    })

    it('rejects an unparseable endTime and leaves the run in_progress', async () => {
        const run = await createRun()

        const res = await complete(run.id, payloadFor(run, { endTime: 'banana' }))

        expect(res.status).toBe(400)
        expect(res.body.error).toBe('endTime is not a valid timestamp')
        const stored = await prisma.productionRun.findUnique({ where: { id: run.id } })
        expect(stored.status).toBe('in_progress')
    })

    it('persists the run-level weights and quantity once a valid endTime completes it', async () => {
        const run = await createRun()

        const res = await complete(run.id, payloadFor(run))

        expect(res.status).toBe(200)
        expect(res.body.netWeightPerUnit).toBe(1.5)
        expect(res.body.grossWeightPerUnit).toBe(1.6)
        expect(res.body.scrapKg).toBe(2)
        expect(res.body.quantityProduced).toBe(1)
    })
})

// Which side wins the row lock is genuinely up to Postgres, and only one of the
// two orderings can expose a missing lock. A single pass caught a removed
// FOR UPDATE roughly one run in three — so each test repeats the race and
// asserts the invariant every time, which is what turns it into a real guard.
const RACE_ATTEMPTS = 12

describe('POST /:id/complete racing DELETE /:id on the same run', () => {
    it('always deletes, and completes with 200 or 404 but never 409 or 500', async () => {
        for (let attempt = 0; attempt < RACE_ATTEMPTS; attempt++) {
            const run = await createRun()

            const [completed, deleted] = await Promise.all([
                complete(run.id, payloadFor(run)),
                remove(run.id)
            ])

            // DELETE either wins the row lock and removes the still-in_progress
            // run, or loses it, re-reads the just-completed run, restores its
            // stock and removes that. Both are a 200.
            expect(deleted.status).toBe(200)
            // 200 means /complete won the lock; 404 means DELETE removed the row
            // first, so the compare-and-swap matched nothing. A 409 would mean
            // it mistook a DELETE for another /complete, and a 500 that the two
            // transactions collided.
            expect([200, 404]).toContain(completed.status)
        }
    })

    it('leaves no run, no orphans, and the stock where it started', async () => {
        for (let attempt = 0; attempt < RACE_ATTEMPTS; attempt++) {
            const run = await createRun()
            const before = await stockNow()

            await Promise.all([complete(run.id, payloadFor(run)), remove(run.id)])

            expect(await prisma.productionRun.findUnique({ where: { id: run.id } })).toBeNull()
            expect(await childRowsOf(run.id)).toBe(0)
            // The interleaving decides whether stock was ever decremented, but
            // never whether it ends up back where it started.
            expect(await stockNow()).toBe(before)
        }
    })
})
