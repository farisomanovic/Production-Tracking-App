/**
 * @file productionRuns.deactivateRace.test.js
 * @description Tests for the deactivate-vs-create race
 * between POST /api/production-runs and the `active: false` path of
 * PUT /api/operators/:id, /api/machines/:id, /api/recipes/:id and
 * /api/products/:id — the four entities a ProductionRun references directly,
 * and therefore the four that POST takes a FOR SHARE lock on. Material and
 * Parameter are deliberately absent: run creation never touches those tables,
 * so their guards have no counterpart lock to race against (see the file header
 * of lib/deactivationGuards.js for why that residual race is accepted).
 *
 * Both sides used to be plain check-then-write against a table the other one
 * writes, so an interleaving let BOTH guards pass and produced a state neither
 * route allows on its own: an in_progress run referencing an inactive parent.
 * For a recipe that also stranded the run — /complete refuses to finish a run
 * whose recipe was deactivated (productionRuns.js), so the only exits were
 * reactivating the retired recipe or deleting the run.
 *
 * Two strengths of coverage, same structure recipeProducts.test.js uses for
 * the last-product-unlink race: the held-lock tests force the interleaving on every
 * run and are the actual regression proof; the Promise.all one is a smoke test
 * that may simply never interleave, so it can miss a regression but can never
 * report one that isn't there.
 *
 * Every test builds a fully isolated fixture set (own machine, operator,
 * product, recipe, and the MachineProduct link POST requires) under the
 * VT-DEACTRACE prefix. The own-machine part is load-bearing: an in_progress
 * run occupies ProductionRun_one_in_progress_per_machine's single slot, so
 * sharing the baseline machine would collide with the other test files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'

const PREFIX = 'VT-DEACTRACE'

let counter = 0

async function cleanup() {
    // Runs first — they reference every other fixture row.
    await prisma.productionRun.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.machineProduct.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.operator.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

beforeAll(cleanup)
afterAll(cleanup)

/**
 * One self-contained, fully wired set of parents a run can legally be created
 * against — so a 400 from POST can only mean the entity under test was
 * deactivated, never that the fixture was miswired.
 */
async function createFixture() {
    counter += 1
    const tag = `${PREFIX}-${counter}`
    const machine = await prisma.machine.create({ data: { name: tag, code: tag } })
    const operator = await prisma.operator.create({ data: { name: tag } })
    const product = await prisma.product.create({ data: { name: tag, code: tag, unit: 'kg' } })
    const recipe = await prisma.recipe.create({
        data: { name: tag, products: { create: [{ productId: product.id }] } }
    })
    await prisma.machineProduct.create({ data: { machineId: machine.id, productId: product.id } })
    return { machine, operator, product, recipe }
}

function payloadFor(fixture) {
    return {
        date: new Date().toISOString(),
        startTime: new Date().toISOString(),
        operatorId: fixture.operator.id,
        machineId: fixture.machine.id,
        productId: fixture.product.id,
        recipeId: fixture.recipe.id
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Table names are hardcoded per entity rather than interpolated: $queryRaw
// parameterizes VALUES, not identifiers, so a dynamic table name would have to
// go through raw string concatenation.
const lockForUpdate = {
    operator: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Operator" WHERE "id" = ${id} FOR UPDATE`,
    machine: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Machine" WHERE "id" = ${id} FOR UPDATE`,
    recipe: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Recipe" WHERE "id" = ${id} FOR UPDATE`,
    product: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`
}
const lockForShare = {
    operator: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Operator" WHERE "id" = ${id} FOR SHARE`,
    machine: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Machine" WHERE "id" = ${id} FOR SHARE`,
    recipe: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Recipe" WHERE "id" = ${id} FOR SHARE`,
    product: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR SHARE`
}

const ENTITIES = [
    {
        key: 'operator',
        route: 'operators',
        postError: 'Operator is inactive or does not exist',
        putError: 'Cannot deactivate this operator while a run is in progress'
    },
    {
        key: 'machine',
        route: 'machines',
        postError: 'Machine is inactive or does not exist',
        putError: 'Cannot deactivate this machine while a run is in progress'
    },
    {
        key: 'recipe',
        route: 'recipes',
        postError: 'Recipe is inactive',
        putError: 'Cannot deactivate this recipe while a run is in progress'
    },
    {
        key: 'product',
        route: 'products',
        postError: 'Product is inactive',
        putError: 'Cannot deactivate this product while a run is in progress'
    }
]

/**
 * Takes `lock` on a row, holds it until `release()` is called, and only THEN
 * runs `mutate` before committing. That ordering is what makes each route's
 * check-then-write window reproducible instead of a coin flip: the racing
 * request is guaranteed to be parked on this lock before the mutation it must
 * react to even exists. Await `lockAcquired` before starting the racer.
 */
function holdRowLocked(lock, mutate) {
    let release
    let markAcquired
    const held = new Promise(resolve => { release = resolve })
    const lockAcquired = new Promise(resolve => { markAcquired = resolve })
    const settled = prisma.$transaction(async (tx) => {
        await lock(tx)
        markAcquired()
        await held
        await mutate(tx)
    })
    return { lockAcquired, release: () => release(), settled }
}

/**
 * The invariant this whole change exists to hold: no in_progress run may
 * reference an inactive parent. Scoped to one fixture's machine, not to the
 * whole PREFIX — a file-wide query would make every test fail as soon as any
 * one of them left a stranded run behind, which hides which case broke.
 */
async function strandedRuns(fixture) {
    return prisma.productionRun.findMany({
        where: {
            status: 'in_progress',
            machineId: fixture.machine.id,
            OR: [
                { operator: { active: false } },
                { machine: { active: false } },
                { recipe: { active: false } },
                { product: { active: false } }
            ]
        },
        select: { id: true }
    })
}

describe('POST /api/production-runs vs deactivation — deactivate wins the lock', () => {
    for (const entity of ENTITIES) {
        it(`rejects the run with 400 when its ${entity.key} is deactivated while the request is in flight`, async () => {
            const fixture = await createFixture()
            const id = fixture[entity.key].id

            // Hold the parent row locked, then deactivate it only after the
            // racing POST has had time to reach its own FOR SHARE and park.
            const adversary = holdRowLocked(
                tx => lockForUpdate[entity.key](tx, id),
                tx => tx[entity.key].update({ where: { id }, data: { active: false } })
            )
            await adversary.lockAcquired

            // .then() is what actually issues a supertest request — without it
            // the Test object sits idle until awaited and nothing would race.
            const pending = request(app).post('/api/production-runs').send(payloadFor(fixture)).then(res => res)
            await sleep(150)
            adversary.release()
            await adversary.settled

            // The POST re-reads `active` after its lock is granted, so it sees
            // committed state: the parent is inactive and the run must be
            // refused. Against the pre-fix route this returned 201.
            const res = await pending
            expect(res.status).toBe(400)
            expect(res.body.error).toBe(entity.postError)

            const runs = await prisma.productionRun.findMany({ where: { machineId: fixture.machine.id } })
            expect(runs).toHaveLength(0)
        })
    }
})

describe('POST /api/production-runs vs deactivation — the run wins the lock', () => {
    for (const entity of ENTITIES) {
        it(`rejects deactivating the ${entity.key} with 409 when a run is created while the request is in flight`, async () => {
            const fixture = await createFixture()
            const id = fixture[entity.key].id

            // The mirror direction: the adversary plays the run-creating side,
            // taking the same FOR SHARE lock POST takes and creating the run
            // only once the racing PUT has parked on it.
            const adversary = holdRowLocked(
                tx => lockForShare[entity.key](tx, id),
                tx => tx.productionRun.create({
                    data: {
                        date: new Date(),
                        startTime: new Date(),
                        operatorId: fixture.operator.id,
                        machineId: fixture.machine.id,
                        productId: fixture.product.id,
                        recipeId: fixture.recipe.id
                    }
                })
            )
            await adversary.lockAcquired

            const pending = request(app).put(`/api/${entity.route}/${id}`).send({ active: false }).then(res => res)
            await sleep(150)
            adversary.release()
            await adversary.settled

            // The PUT checks for an in-progress run only after its FOR UPDATE
            // is granted, so it now sees the committed run. Against the pre-fix
            // route the check ran before the lock and this returned 200.
            const res = await pending
            expect(res.status).toBe(409)
            expect(res.body.error).toBe(entity.putError)

            const stillActive = await prisma[entity.key].findUnique({ where: { id } })
            expect(stillActive.active).toBe(true)
            expect(await strandedRuns(fixture)).toHaveLength(0)
        })
    }
})

describe('POST /api/production-runs vs deactivation — simultaneous requests', () => {
    for (const entity of ENTITIES) {
        it(`never lets both a run creation and a ${entity.key} deactivation succeed`, async () => {
            const fixture = await createFixture()
            const id = fixture[entity.key].id

            const [created, deactivated] = await Promise.all([
                request(app).post('/api/production-runs').send(payloadFor(fixture)),
                request(app).put(`/api/${entity.route}/${id}`).send({ active: false })
            ])

            // Either outcome is legitimate — whichever transaction won the lock
            // — but not both, and the run must never outlive the guard.
            expect([created.status, deactivated.status]).not.toEqual([201, 200])
            expect(await strandedRuns(fixture)).toHaveLength(0)
        })
    }
})
