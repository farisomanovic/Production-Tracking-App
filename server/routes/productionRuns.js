/**
 * @file productionRuns.js
 * @description Routes for the transactional heart of the app: production runs.
 * Covers the two-step lifecycle (create as in_progress → complete with
 * measurements/materials/quantity), filtered listing, detail reads, and deletion
 * with stock reversal. Master-data CRUD does NOT belong here.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
    AppError,
    RunNotFoundError,
    RunAlreadyCompletedError,
    UnknownMaterialError,
    InsufficientStockError
} from '../lib/errors.js'
import { hasDuplicates, allBelongTo, isFiniteNumber, isValidStatus, VALID_STATUSES } from '../lib/validation.js'

const router = Router()

// Requires an explicit `Z` or numeric offset (`+HH:MM`/`-HH:MM`) so a naive,
// timezone-less string is rejected loudly instead of being silently parsed
// as the server process's own local time — which is ambiguous the moment
// the server's timezone differs from the operator's.
// Every caller of parseDateOr400 sends real UTC (the client converts local
// wall-clock input via localToUTCISOString before it ever leaves the
// browser), so this is enforcement, not a new constraint on legitimate input.
const TZ_QUALIFIED_TIMESTAMP_RE = /(Z|[+-]\d{2}:\d{2})$/

// Shared by POST and PUT below: new Date() never throws on a garbage string, and
// silently succeeds (as the Unix epoch) on null or a number — both cases only
// surface once Prisma writes the result. This turns both into a 400 naming the
// offending field instead.
function parseDateOr400(res, value, fieldName) {
    if (typeof value !== 'string') {
        res.status(400).json({ error: `${fieldName} is not a valid timestamp` })
        return null
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ error: `${fieldName} is not a valid timestamp` })
        return null
    }
    // Checked after the NaN test, not before: a garbage string like "banana"
    // should read as "not a valid timestamp", not "missing a timezone" — this
    // only fires for strings that parse fine but are ambiguously naive.
    if (!TZ_QUALIFIED_TIMESTAMP_RE.test(value)) {
        res.status(400).json({ error: `${fieldName} must include a timezone (e.g. end in "Z")` })
        return null
    }
    return parsed
}

// dateFrom/dateTo are date-only (YYYY-MM-DD), unlike the full timestamps
// parseDateOr400 above validates — a narrower shape check instead of reuse.
function isValidDateOnlyString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
}

// GET /production-runs's list page and export both depend on this endpoint
// staying bounded as production history accumulates.
const DEFAULT_TAKE = 200
const MAX_TAKE = 1000

// ─── LIST & DETAIL ───────────────────────────────────────────────────────────

/**
 * Lists runs with optional filters, relations narrowed to the names the list
 * page actually renders.
 *
 * @param {import('express').Request} req - Optional query: `machineId`, `operatorId`, `productId`,
 * `status` ("in_progress" | "completed"), `dateFrom`/`dateTo` (YYYY-MM-DD), `limit` (positive int,
 * defaults to 200, clamped to a max of 1000).
 * @param {import('express').Response} res - 200 → ProductionRun[] newest-first (date, then startTime as a
 * tiebreaker); 400 on a malformed/array-shaped query param, a status outside the allow-list
 * (including ""), an invalid dateFrom/dateTo, or a non-positive-integer limit; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/production-runs?machineId=7cd0…&status=completed&limit=1
 * // → 200 [{ id: "ab12…", date: "2026-07-01T00:00:00.000Z", status: "completed",
 * //          machine: { name: "Extruder 1" }, operator: { name: "Amar" }, … }]
 */
router.get('/', async (req, res) => {
    const { machineId, operatorId, productId, dateFrom, dateTo, limit, status } = req.query

    // Express turns a repeated query key (?machineId=a&machineId=b) into an
    // array — reject that shape for every one of these before it reaches Prisma.
    for (const [name, value] of Object.entries({ machineId, operatorId, productId, status, dateFrom, dateTo, limit })) {
        if (value !== undefined && typeof value !== 'string') {
            return res.status(400).json({ error: `${name} must be a single value` })
        }
    }

    // Below the loop above, never above it: there, a repeated ?status= key would
    // reach isValidStatus as an array and be reported as a bad vocabulary value
    // rather than a bad shape. Rejects "" as well as a typo — an empty status is
    // a caller whose variable never got set, not a request for every run.
    if (status !== undefined && !isValidStatus(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    }

    if (dateFrom && !isValidDateOnlyString(dateFrom)) {
        return res.status(400).json({ error: 'dateFrom must be a valid YYYY-MM-DD date' })
    }
    if (dateTo && !isValidDateOnlyString(dateTo)) {
        return res.status(400).json({ error: 'dateTo must be a valid YYYY-MM-DD date' })
    }

    let take = DEFAULT_TAKE
    if (limit !== undefined) {
        const parsedLimit = Number(limit)
        if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
            return res.status(400).json({ error: 'limit must be a positive integer' })
        }
        take = Math.min(parsedLimit, MAX_TAKE)
    }

    const where = {}
    // One shared where object so any combination of filters can be expressed
    // by the same endpoint instead of one route per filter.
    if (machineId) where.machineId = machineId
    if (operatorId) where.operatorId = operatorId
    if (productId) where.productId = productId
    if (status) where.status = status
    if (dateFrom || dateTo) {
        // Explicit UTC boundaries because `date` is a DATE column: without the
        // T00:00/T23:59 suffixes, timezone conversion could shift the filter a day.
        where.date = {
            ...(dateFrom && { gte: new Date(`${dateFrom}T00:00:00.000Z`) }),
            ...(dateTo && { lte: new Date(`${dateTo}T23:59:59.999Z`) })
        }
    }
    const runs = await prisma.productionRun.findMany({
        where,
        // `date` alone is date-only and ties same-day runs; startTime breaks
        // the tie so "prefill from last run" (limit: 1) always gets the
        // actual most recent run, not an arbitrary one from the latest day.
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        take,
        select: {
            id: true,
            date: true,
            startTime: true,
            status: true,
            machineId: true,
            machine: { select: { name: true } },
            operator: { select: { name: true } },
            product: { select: { name: true } }
        }
    })
    res.json(runs)
})

/**
 * Fetches one run with every relation the detail page needs: recipe
 * composition, measured parameter values, and material usage.
 *
 * @param {import('express').Request} req - `params.id` is the run UUID.
 * @param {import('express').Response} res - 200 → full run aggregate; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/production-runs/ab12…
 * // → 200 { id: "ab12…", status: "completed", quantityProduced: 500,
 * //          product: { name: "PP traka 12mm" },
 * //          runParameterValues: [{ value: 210, machineParameter: { parameter: { name: "Melt temp" } } }],
 * //          materialUsages: [{ quantityUsed: 480, material: { name: "PP granulat" } }] }
 */
router.get('/:id', async (req, res) => {
    const run = await prisma.productionRun.findUnique({
        where: { id: req.params.id },
        include: {
            operator: true,
            machine: true,
            product: true,
            recipe: {
                include: {
                    recipeItems: {
                        include: { material: true }
                    }
                }
            },
            runParameterValues: {
                // Sorted by the machine's configured displayOrder so the detail
                // view lists values in the same order the operator entered them.
                orderBy: { machineParameter: { displayOrder: 'asc' } },
                include: {
                    machineParameter: {
                        include: { parameter: true }
                    }
                }
            },
            materialUsages: {
                include: { material: true }
            }
        }
    })
    if (!run) {
        throw new RunNotFoundError()
    }
    res.json(run)
})

// ─── CREATE & UPDATE ─────────────────────────────────────────────────────────

/**
 * Starts a run (status defaults to in_progress in the schema). This is the
 * write that happens after wizard Step 2 — measurements come later at /complete.
 *
 * @param {import('express').Request} req - Required body: `date`, `startTime`, `operatorId`, `machineId`,
 * `productId`, `recipeId`. Optional: `warmupStartTime`, `stableStartTime`, `energyStart`, `notes`, `potentialBuyer`.
 * @param {import('express').Response} res - 201 → created run with relations; 400 on validation failure;
 * 409 if the machine's in-progress slot was taken by a concurrent request; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/production-runs
 * // { "date": "2026-07-04T00:00:00.000Z", "startTime": "2026-07-04T08:30:00.000",
 * //   "operatorId": "b3f1…", "machineId": "7cd0…", "productId": "c771…", "recipeId": "d1e2…" }
 * // → 201 { id: "ab12…", status: "in_progress", … }
 */
router.post('/', async (req, res, next) => {
    const {
        date,
        startTime,
        operatorId,
        machineId,
        productId,
        recipeId,
        warmupStartTime,
        stableStartTime,
        energyStart,
        notes,
        potentialBuyer
    } = req.body

    if (!date || !startTime || !operatorId || !machineId || !productId || !recipeId) {
        return res.status(400).json({ error: 'date, startTime, operatorId, machineId, productId and recipeId are required' })
    }
    // 0 is a legal reading: a freshly installed or replaced kWh totalizer
    // starts there. Only negatives are impossible on a counter that climbs,
    // which puts energy on the same footing as the completion route's weights.
    if (energyStart !== undefined && (!isFiniteNumber(energyStart) || energyStart < 0)) {
        return res.status(400).json({ error: 'energyStart must be a number of at least 0 when provided' })
    }
    if (notes !== undefined && typeof notes !== 'string') {
        return res.status(400).json({ error: 'notes must be a string' })
    }
    if (potentialBuyer !== undefined && typeof potentialBuyer !== 'string') {
        return res.status(400).json({ error: 'potentialBuyer must be a string' })
    }

    const parsedDate = parseDateOr400(res, date, 'date')
    if (!parsedDate) return
    const parsedStartTime = parseDateOr400(res, startTime, 'startTime')
    if (!parsedStartTime) return
    let parsedWarmupStartTime
    if (warmupStartTime !== undefined) {
        parsedWarmupStartTime = parseDateOr400(res, warmupStartTime, 'warmupStartTime')
        if (!parsedWarmupStartTime) return
    }
    let parsedStableStartTime
    if (stableStartTime !== undefined) {
        parsedStableStartTime = parseDateOr400(res, stableStartTime, 'stableStartTime')
        if (!parsedStableStartTime) return
    }
    // Physical invariant: warmup ≤ start ≤ stable. Non-strict — warmup finishing
    // exactly as production starts, or stable beginning exactly at start, are
    // both plausible; unlike endTime this isn't a duration, so equality isn't
    // rejected the way a zero-length run is.
    if (parsedWarmupStartTime !== undefined && parsedWarmupStartTime > parsedStartTime) {
        return res.status(400).json({ error: 'warmupStartTime must be at or before startTime' })
    }
    if (parsedStableStartTime !== undefined && parsedStableStartTime < parsedStartTime) {
        return res.status(400).json({ error: 'stableStartTime must be at or after startTime' })
    }

    // Fast path for the normal case: these reads take no locks, so every check
    // below can go stale between here and the create. The authoritative re-read
    // of the three `active` flags happens under lock inside the transaction —
    // this block exists to reject the overwhelmingly common bad request with
    // one cheap round trip instead of opening a transaction for it, and to
    // produce the 400s for cases the lock can't cover (unknown ids, a product
    // not assigned to the machine).
    const [operator, machine, machineProductLink, recipe, activeRunOnMachine] = await Promise.all([
        prisma.operator.findUnique({ where: { id: operatorId } }),
        prisma.machine.findUnique({ where: { id: machineId } }),
        // Existence of this link proves both that productId is real and that
        // the machine is configured to make it — the wizard's dropdowns already
        // enforce this, this is the backstop for direct API calls.
        prisma.machineProduct.findFirst({ where: { machineId, productId } }),
        prisma.recipe.findUnique({ where: { id: recipeId }, include: { products: true } }),
        prisma.productionRun.findFirst({ where: { machineId, status: 'in_progress' } })
    ])

    // Runs record real shop-floor events, so future dates are operator error.
    // setUTCHours(23,59,59) makes "today anywhere on Earth" pass regardless of
    // the server's timezone — a deliberate loose bound.
    const today = new Date()
    today.setUTCHours(23, 59, 59, 999)
    if (parsedDate > today) {
        return res.status(400).json({ error: 'Production run date cannot be in the future' })
    }

    // Inactive operators keep their history but must not appear on new runs —
    // this is the server-side backstop for the client's dropdown filter.
    if (!operator || !operator.active) {
        return res.status(400).json({ error: 'Operator is inactive or does not exist' })
    }

    // Same backstop for machines: a deactivated machine must not accept new runs,
    // and a nonexistent one must not fall through to Prisma's P2003 → 500.
    if (!machine || !machine.active) {
        return res.status(400).json({ error: 'Machine is inactive or does not exist' })
    }

    if (!machineProductLink) {
        return res.status(400).json({ error: 'This product is not assigned to the selected machine' })
    }

    if (!recipe) {
        return res.status(400).json({ error: 'Recipe does not exist' })
    }
    // Same backstop pattern as operator/machine above: Step 2 only ever offers
    // active recipes, this guards direct API calls.
    if (!recipe.active) {
        return res.status(400).json({ error: 'Recipe is inactive' })
    }
    if (!recipe.products.some(link => link.productId === productId)) {
        return res.status(400).json({ error: 'Recipe does not belong to the selected product' })
    }

    if (activeRunOnMachine) {
        return res.status(409).json({ error: 'Machine already has a run in progress' })
    }

    try {
        const run = await prisma.$transaction(async (tx) => {
            // Lock the three parents BEFORE re-reading their `active` flags
            //. Without this the flags read above and the
            // create below are a check-then-write straddling the deactivate
            // routes' own check-then-write, and both guards can pass: the run
            // lands referencing a just-deactivated entity, which for a recipe
            // then makes /complete refuse it forever.
            //
            // FOR SHARE, not FOR UPDATE, and it has to be explicit. Postgres
            // already takes an automatic FOR KEY SHARE lock on a parent row
            // when a child row referencing it is inserted, but that is not
            // enough here: `UPDATE ... SET active = false` touches no key
            // column, so it takes FOR NO KEY UPDATE, which does NOT conflict
            // with FOR KEY SHARE. FOR SHARE does conflict with it, so it blocks
            // the deactivate — while still not conflicting with another
            // FOR SHARE, so two concurrent run creations never queue behind
            // each other the way FOR UPDATE would make them.
            //
            // Fixed order (Machine → Operator → Recipe): a deactivate only ever
            // holds one row lock and requests no second one, so no cycle is
            // constructible today — this pins the order against future edits,
            // same reasoning as recipeProducts.js's ORDER BY on its own lock.
            await tx.$queryRaw`SELECT "id" FROM "Machine" WHERE "id" = ${machineId} FOR SHARE`
            await tx.$queryRaw`SELECT "id" FROM "Operator" WHERE "id" = ${operatorId} FOR SHARE`
            await tx.$queryRaw`SELECT "id" FROM "Recipe" WHERE "id" = ${recipeId} FOR SHARE`

            // Now authoritative: under READ COMMITTED each statement takes a
            // fresh snapshot, so a read issued after the lock is granted sees
            // whatever the blocking transaction committed. Sequential awaits,
            // not Promise.all — an interactive transaction holds a single DB
            // connection, so parallel awaits gain nothing. Messages are
            // deliberately identical to the fast path's: which of the two
            // checks rejected the request is an implementation detail.
            const lockedMachine = await tx.machine.findUnique({ where: { id: machineId }, select: { active: true } })
            if (!lockedMachine || !lockedMachine.active) {
                throw new AppError(400, 'Machine is inactive or does not exist')
            }
            const lockedOperator = await tx.operator.findUnique({ where: { id: operatorId }, select: { active: true } })
            if (!lockedOperator || !lockedOperator.active) {
                throw new AppError(400, 'Operator is inactive or does not exist')
            }
            const lockedRecipe = await tx.recipe.findUnique({ where: { id: recipeId }, select: { active: true } })
            if (!lockedRecipe) {
                throw new AppError(400, 'Recipe does not exist')
            }
            if (!lockedRecipe.active) {
                throw new AppError(400, 'Recipe is inactive')
            }

            // Deliberately NOT re-checked under lock: the machineProduct link
            // (its unlink race is a separately documented, accepted one — see
            // machineProducts.js) and the busy-machine check, which already has
            // a real database backstop in the P2002 handler below.
            return tx.productionRun.create({
                data: {
                    date: parsedDate,
                    startTime: parsedStartTime,
                    operatorId,
                    machineId,
                    productId,
                    recipeId,
                    ...(parsedWarmupStartTime !== undefined && { warmupStartTime: parsedWarmupStartTime }),
                    ...(parsedStableStartTime !== undefined && { stableStartTime: parsedStableStartTime }),
                    ...(energyStart !== undefined && { energyStart }),
                    ...(notes !== undefined && { notes }),
                    ...(potentialBuyer !== undefined && { potentialBuyer })
                },
                include: {
                    operator: true,
                    machine: true,
                    product: true,
                    recipe: true
                }
            })
        })
        res.status(201).json(run)
    } catch (error) {
        // The activeRunOnMachine check above is a fast path for the normal
        // case only — it isn't atomic with this create, so two near-simultaneous
        // POSTs for the same machine can both pass it. The DB-level backstop is
        // the partial unique index ProductionRun_one_in_progress_per_machine
        // (migration 20260714120000_production_run_one_in_progress_per_machine):
        // the race loser's create hits it and Prisma reports P2002 here. Same
        // clientMessage as the fast-path check, same pattern as
        // machineParameters.js's POST handler.
        if (error.code === 'P2002') {
            error.clientMessage = 'Machine already has a run in progress'
        }
        next(error)
    }
})

/**
 * Updates a run's mutable fields. The four foreign keys are deliberately NOT
 * accepted — swapping the machine or recipe after creation would detach the
 * run from the context its measurements were recorded under.
 *
 * @param {import('express').Request} req - `params.id` UUID; any subset of `notes`, `potentialBuyer`,
 * `warmupStartTime`, `stableStartTime`, `energyStart`, `energyEnd`, `endTime`.
 * @param {import('express').Response} res - 200 → updated run with relations; 400 an unparseable
 * warmupStartTime/stableStartTime/endTime, an endTime at/before startTime, a warmupStartTime
 * after startTime, a stableStartTime before startTime, or a resulting energyEnd below the
 * resulting energyStart; 404 unknown id;
 * 409 run is already completed (immutable once completed).
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/production-runs/ab12…  { "potentialBuyer": "Bingo d.o.o." }
 * // → 200 { id: "ab12…", potentialBuyer: "Bingo d.o.o.", … }
 */
router.put('/:id', async (req, res) => {
    const {
        notes,
        potentialBuyer,
        warmupStartTime,
        stableStartTime,
        energyStart,
        energyEnd,
        endTime
    } = req.body

    // Same "0 is a legal meter reading, negatives aren't" rule as POST / —
    // see the comment there.
    if (energyStart !== undefined && (!isFiniteNumber(energyStart) || energyStart < 0)) {
        return res.status(400).json({ error: 'energyStart must be a number of at least 0 when provided' })
    }
    if (energyEnd !== undefined && (!isFiniteNumber(energyEnd) || energyEnd < 0)) {
        return res.status(400).json({ error: 'energyEnd must be a number of at least 0 when provided' })
    }
    if (notes !== undefined && typeof notes !== 'string') {
        return res.status(400).json({ error: 'notes must be a string' })
    }
    if (potentialBuyer !== undefined && typeof potentialBuyer !== 'string') {
        return res.status(400).json({ error: 'potentialBuyer must be a string' })
    }

    let parsedWarmupStartTime
    if (warmupStartTime !== undefined) {
        parsedWarmupStartTime = parseDateOr400(res, warmupStartTime, 'warmupStartTime')
        if (!parsedWarmupStartTime) return
    }
    let parsedStableStartTime
    if (stableStartTime !== undefined) {
        parsedStableStartTime = parseDateOr400(res, stableStartTime, 'stableStartTime')
        if (!parsedStableStartTime) return
    }
    let parsedEndTime
    if (endTime !== undefined) {
        parsedEndTime = parseDateOr400(res, endTime, 'endTime')
        if (!parsedEndTime) return
    }

    // Reads startTime for the three ordering checks below — it is immutable
    // (POST sets it once, this route never accepts it), so it cannot go stale.
    // The stored energy readings come along for the pair check: either field can
    // be updated in isolation here, so the rule has to be evaluated against the
    // pair the row would END UP with, not just against what the body carries.
    // The status check here is only a fast path that skips pointless work on an
    // already-completed run; the guarantee that a completed run is an immutable
    // log of what happened on the floor is enforced by the compare-and-swap
    // further down, not by this read.
    const existing = await prisma.productionRun.findUnique({
        where: { id: req.params.id },
        select: { startTime: true, status: true, energyStart: true, energyEnd: true }
    })
    if (!existing) {
        throw new RunNotFoundError()
    }
    if (existing.status === 'completed') {
        throw new RunAlreadyCompletedError()
    }
    if (parsedEndTime !== undefined && parsedEndTime <= existing.startTime) {
        return res.status(400).json({ error: 'endTime must be after the run start time' })
    }
    // Same warmup ≤ start ≤ stable invariant as POST, anchored to the existing
    // (immutable) startTime since either field can be updated in isolation here.
    if (parsedWarmupStartTime !== undefined && parsedWarmupStartTime > existing.startTime) {
        return res.status(400).json({ error: 'warmupStartTime must be at or before the run start time' })
    }
    if (parsedStableStartTime !== undefined && parsedStableStartTime < existing.startTime) {
        return res.status(400).json({ error: 'stableStartTime must be at or after the run start time' })
    }
    // A kWh totalizer only climbs, so an end reading below the start one
    // describes something that did not happen on the floor — and the only
    // consumer of the pair is the subtraction behind the export's "Energy
    // Consumed" column, which would carry the wrong SIGN, not merely the wrong
    // size. Compared on the effective pair because either field can arrive
    // alone: a body setting only energyEnd still has to clear the stored
    // energyStart, and vice versa.
    const effectiveEnergyStart = energyStart !== undefined ? energyStart : existing.energyStart
    const effectiveEnergyEnd = energyEnd !== undefined ? energyEnd : existing.energyEnd
    // Both halves of the null check are load-bearing. Skipping either lets the
    // absent side coerce to 0, which would reject a perfectly ordinary
    // { energyStart: 100 } on a run whose end reading has not been taken yet.
    if (effectiveEnergyStart != null && effectiveEnergyEnd != null && effectiveEnergyEnd < effectiveEnergyStart) {
        return res.status(400).json({ error: 'energyEnd must be at or above energyStart' })
    }

    // TODO: no UI calls this endpoint yet (the client's updateRun helper is
    // unused) — run headers are uneditable after creation. Either build the
    // edit screen or drop the route. todo.md Group 8 #2.
    const data = {
        ...(notes !== undefined && { notes }),
        ...(potentialBuyer !== undefined && { potentialBuyer }),
        ...(parsedWarmupStartTime !== undefined && { warmupStartTime: parsedWarmupStartTime }),
        ...(parsedStableStartTime !== undefined && { stableStartTime: parsedStableStartTime }),
        ...(energyStart !== undefined && { energyStart }),
        ...(energyEnd !== undefined && { energyEnd }),
        ...(parsedEndTime !== undefined && { endTime: parsedEndTime })
    }

    // A body carrying none of the mutable fields writes nothing, so there is no
    // race to guard — and it must skip the compare-and-swap, because Prisma
    // reports count: 0 for an empty `data` even when the row matched, which
    // would turn this long-standing no-op into a bogus 409.
    if (Object.keys(data).length > 0) {
        // Compare-and-swap, same pattern and same reasoning as /complete's
        // status flip below: the status check and the write are ONE atomic
        // UPDATE ... WHERE status = 'in_progress'. A concurrent /complete either
        // commits first — in which case this WHERE matches 0 rows and the edit
        // is refused — or is still holding the row, in which case this statement
        // blocks and then re-evaluates against the committed result. The
        // separate read above cannot enforce this: a /complete committing
        // between it and this write would otherwise be overwritten.
        const { count } = await prisma.productionRun.updateMany({
            where: { id: req.params.id, status: 'in_progress' },
            data
        })
        if (count === 0) {
            // 0 rows means "no run in_progress with this id" — look the id up to
            // tell "deleted underneath us" (404) from "completed" (409).
            const stillExists = await prisma.productionRun.findUnique({
                where: { id: req.params.id },
                select: { id: true }
            })
            if (!stillExists) throw new RunNotFoundError()
            throw new RunAlreadyCompletedError()
        }
    }

    // updateMany cannot return relations, so the response shape comes from a
    // separate read. Deliberately NOT wrapped in a transaction with the write
    // above: a /complete committing in between would make this report
    // status: 'completed' alongside the fields this request wrote, which is a
    // truthful view of committed state — the edit did land while the run was
    // still in progress. Only the "response equals exactly what this request
    // left behind" property is given up, and not for a single-row update.
    const run = await prisma.productionRun.findUnique({
        where: { id: req.params.id },
        include: {
            operator: true,
            machine: true,
            product: true,
            recipe: true
        }
    })
    if (!run) {
        throw new RunNotFoundError()
    }
    res.json(run)
})

// ─── COMPLETE (transactional) ────────────────────────────────────────────────

/**
 * Completes a run: flips status, stores measured parameters, material usage and
 * the produced quantity, and decrements material stock — all in ONE transaction
 * so a run can never be "completed" with only half its production data saved.
 *
 * What was produced needs no productId: the run already carries one, validated
 * against the machine's product whitelist at creation and immutable afterwards
 * (PUT accepts none of the four foreign keys).
 *
 * @param {import('express').Request} req - `params.id` UUID. Body: `endTime` (required),
 * `quantityProduced` (required, number > 0), `parameterValues[]` ({ machineParameterId, value };
 * min 1 unless the run's machine has zero linked parameters, in which case an empty array is
 * required), `materialUsages[]` optional, `energyEnd`/`notes` optional, run-level weights
 * `netWeightPerUnit`/`grossWeightPerUnit`/`scrapKg` optional (numbers ≥ 0).
 * @param {import('express').Response} res - 200 → completed run aggregate; 400 invalid payload
 * (including an unparseable endTime, one at/before the run's startTime, a missing or
 * non-positive quantityProduced, an energyEnd below the run's stored energyStart, a duplicate id
 * within `parameterValues`/`materialUsages`, any id that doesn't belong to this run's
 * machine/recipe, or the run's recipe having been deactivated since the run started);
 * 404 unknown run; 409 already completed or insufficient stock; 500 on transaction failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/production-runs/ab12…/complete
 * // { "endTime": "2026-07-04T14:30:00.000Z",
 * //   "quantityProduced": 500,
 * //   "parameterValues": [{ "machineParameterId": "31f0…", "value": 210 }],
 * //   "materialUsages": [{ "materialId": "a9d2…", "quantityUsed": 480 }],
 * //   "netWeightPerUnit": 1.5, "grossWeightPerUnit": 1.6, "scrapKg": 10 }
 * // → 200 { id: "ab12…", status: "completed", quantityProduced: 500, … }
 */
router.post('/:id/complete', async (req, res) => {
    const { endTime, energyEnd, notes, parameterValues, materialUsages, quantityProduced,
        netWeightPerUnit, grossWeightPerUnit, scrapKg } = req.body

    if (!endTime) {
        return res.status(400).json({ error: 'endTime is required to complete a run' })
    }
    // Same helper PUT /:id uses for its own endTime field (see its comment
    // above the function definition) — type-checks before parsing so a
    // number can't sail past as a silently-valid epoch timestamp.
    const end = parseDateOr400(res, endTime, 'endTime')
    if (!end) return
    // A run cannot end at or before the moment it started. The client rolls
    // overnight end times to the next day; this is the backstop for direct
    // API calls and client bugs. startTime is immutable after creation
    // (PUT never accepts it), so this pre-transaction read cannot go stale.
    // Also pulls the run's machine/recipe context (its parameter list and the
    // recipe's items) in the same round trip — narrowed to just the id fields
    // the relational checks below actually read, since these collections scale
    // with how much a machine/recipe has configured.
    const existing = await prisma.productionRun.findUnique({
        where: { id: req.params.id },
        select: {
            startTime: true,
            // The start reading was recorded at creation; this route only ever
            // receives the end one, so the pair check below has no other source
            // for its left-hand side.
            energyStart: true,
            machine: {
                select: {
                    machineParameters: { select: { id: true } }
                }
            },
            recipe: {
                select: {
                    active: true,
                    recipeItems: { select: { materialId: true } }
                }
            }
        }
    })
    if (!existing) {
        throw new RunNotFoundError()
    }
    // A recipe can be deactivated after a run already started on it — block
    // completion rather than silently recording output/material usage against
    // a formula the business has retired. The run itself is not stranded: it
    // can still be deleted (no stock was decremented yet) or the recipe can be
    // reactivated to let this run finish.
    if (!existing.recipe.active) {
        return res.status(400).json({ error: 'Cannot complete a run whose recipe has been deactivated' })
    }
    if (end <= existing.startTime) {
        return res.status(400).json({ error: 'endTime must be after the run start time' })
    }
    if (!parameterValues || !Array.isArray(parameterValues)) {
        return res.status(400).json({ error: 'parameterValues must be an array' })
    }
    // A machine with zero linked parameters has nothing to report — the
    // wizard/detail-page completion forms already know this (Step3_Parameters.jsx's
    // "No parameters linked" empty-state lets the operator continue) and submit
    // an empty array. Only demand a non-empty array when the machine actually
    // has parameters to fill in.
    if (parameterValues.length === 0 && existing.machine.machineParameters.length > 0) {
        return res.status(400).json({ error: 'At least one parameter value is required' })
    }
    // The run's whole point is that something came off the machine, so this is
    // required rather than optional-with-a-default. The DB backs it up with a
    // CHECK (ProductionRun_quantityProduced_valid) that refuses a completed row
    // without a positive quantity, no matter which code path writes it.
    if (!isFiniteNumber(quantityProduced) || quantityProduced <= 0) {
        return res.status(400).json({ error: 'quantityProduced must be a number greater than 0' })
    }

    // Numeric validation BEFORE the transaction: a negative quantityUsed
    // would silently INCREMENT stock (decrement of a negative), and Prisma
    // stores NaN/strings as garbage or throws a raw 500. Parameter values
    // only need to be real numbers — a measured reading of 0 is legitimate.
    // energyEnd follows the same rule as the weight fields further down: 0 is
    // a real reading (a meter replaced mid-run starts there), negatives aren't.
    if (energyEnd !== undefined && (!isFiniteNumber(energyEnd) || energyEnd < 0)) {
        return res.status(400).json({ error: 'energyEnd must be a number of at least 0 when provided' })
    }
    // The counter climbs, so the end reading cannot sit below the start one —
    // same rule PUT /:id enforces, see the longer note there. A run with no
    // start reading has nothing to compare against and is left alone.
    if (energyEnd !== undefined && existing.energyStart != null && energyEnd < existing.energyStart) {
        return res.status(400).json({ error: 'energyEnd must be at or above energyStart' })
    }
    if (notes !== undefined && typeof notes !== 'string') {
        return res.status(400).json({ error: 'notes must be a string' })
    }
    for (const p of parameterValues) {
        if (!p.machineParameterId || !isFiniteNumber(p.value)) {
            return res.status(400).json({ error: 'Each parameter value needs a machineParameterId and a numeric value' })
        }
    }
    if (materialUsages !== undefined && !Array.isArray(materialUsages)) {
        return res.status(400).json({ error: 'materialUsages must be an array' })
    }
    for (const m of materialUsages || []) {
        if (!m.materialId || !isFiniteNumber(m.quantityUsed) || m.quantityUsed <= 0) {
            return res.status(400).json({ error: 'Each material usage needs a materialId and a quantityUsed greater than 0' })
        }
    }
    // Run-level weights are optional (old clients / rework runs may omit
    // them), but when present they must be real numbers — 0 is legitimate
    // (a run can genuinely produce zero scrap).
    for (const [name, value] of [
        ['netWeightPerUnit', netWeightPerUnit],
        ['grossWeightPerUnit', grossWeightPerUnit],
        ['scrapKg', scrapKg]
    ]) {
        if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
            return res.status(400).json({ error: `${name} must be a number of at least 0 when provided` })
        }
    }

    // Duplicate ids within one payload hit RunParameterValue's/MaterialUsage's
    // @@unique constraint mid-transaction — check before the transaction so
    // the client gets a clean, specific 400 instead of a generic P2002 409.
    const machineParameterIds = parameterValues.map(p => p.machineParameterId)
    if (hasDuplicates(machineParameterIds)) {
        return res.status(400).json({ error: 'parameterValues contains a duplicate machineParameterId' })
    }
    const materialIds = (materialUsages || []).map(m => m.materialId)
    if (hasDuplicates(materialIds)) {
        return res.status(400).json({ error: 'materialUsages contains a duplicate materialId' })
    }

    // Each id must belong to THIS run's machine/recipe, not just exist
    // somewhere in the database — otherwise a parameter reading could be filed
    // under another machine's config, or a material outside the run's recipe
    // could silently decrement unrelated stock. The produced product needs no
    // such check: it is the run's own productId, whitelisted at creation.
    const validMachineParameterIds = new Set(existing.machine.machineParameters.map(mp => mp.id))
    if (!allBelongTo(machineParameterIds, validMachineParameterIds)) {
        return res.status(400).json({ error: "One or more parameterValues reference a machine parameter that does not belong to this run's machine" })
    }
    const validMaterialIds = new Set(existing.recipe.recipeItems.map(ri => ri.materialId))
    if (!allBelongTo(materialIds, validMaterialIds)) {
        return res.status(400).json({ error: "One or more materialUsages reference a material that is not part of this run's recipe" })
    }

    const run = await prisma.$transaction(async (tx) => {
        // Compare-and-swap: the status check and the flip are ONE atomic
        // UPDATE ... WHERE status = 'in_progress'. Concurrent completions
        // serialize on the row lock — the loser re-evaluates the WHERE
        // against the winner's committed row, matches 0 rows, and aborts.
        const { count } = await tx.productionRun.updateMany({
            where: { id: req.params.id, status: 'in_progress' },
            data: {
                status: 'completed',
                endTime: end,
                // Set in the SAME statement as the status flip, not after it:
                // the DB's CHECK is evaluated per statement, so a flip to
                // 'completed' without the quantity would be rejected outright.
                quantityProduced,
                ...(energyEnd !== undefined && { energyEnd }),
                ...(notes !== undefined && { notes }),
                ...(netWeightPerUnit !== undefined && { netWeightPerUnit }),
                ...(grossWeightPerUnit !== undefined && { grossWeightPerUnit }),
                ...(scrapKg !== undefined && { scrapKg })
            }
        })
        if (count === 0) {
            // 0 rows means "no run in_progress with this id" — look the id up
            // to tell "never existed" (404) apart from "already completed" (409).
            const exists = await tx.productionRun.findUnique({
                where: { id: req.params.id },
                select: { id: true }
            })
            if (!exists) throw new RunNotFoundError()
            throw new RunAlreadyCompletedError()
        }

        await tx.runParameterValue.createMany({
            data: parameterValues.map(p => ({
                productionRunId: req.params.id,
                machineParameterId: p.machineParameterId,
                value: p.value
            }))
        })

        // Usage is optional: some runs legitimately record only parameters and
        // output (e.g. rework passes that consume no fresh material).
        // Stock is decremented in the SAME transaction as the usage rows so
        // inventory can never disagree with recorded consumption — and BEFORE
        // inserting them, so an unknown materialId surfaces as a clean 400
        // here instead of a foreign-key P2003 on the insert.
        // Sequential loop, not Promise.all: an interactive transaction holds a
        // single DB connection, so parallel awaits gain nothing here.
        if (materialUsages && materialUsages.length > 0) {
            for (const m of materialUsages) {
                // Same compare-and-swap as the status flip: "subtract this
                // amount only if at least that much is on the shelf" is one
                // atomic statement, so concurrent runs consuming the same
                // material can never drive stock below zero. The DB-level
                // CHECK (stockQty >= 0) backs this up for every other path.
                const decremented = await tx.material.updateMany({
                    where: { id: m.materialId, stockQty: { gte: m.quantityUsed } },
                    data: {
                        stockQty: {
                            decrement: m.quantityUsed
                        }
                    }
                })
                if (decremented.count === 0) {
                    const material = await tx.material.findUnique({
                        where: { id: m.materialId }
                    })
                    if (!material) throw new UnknownMaterialError()
                    throw new InsufficientStockError(
                        `Insufficient stock for ${material.name}: ${material.stockQty} ${material.unit} available, ${m.quantityUsed} needed`
                    )
                }
            }

            await tx.materialUsage.createMany({
                data: materialUsages.map(m => ({
                    productionRunId: req.params.id,
                    materialId: m.materialId,
                    quantityUsed: m.quantityUsed
                }))
            })
        }

        // Re-fetch inside the transaction so the response reflects exactly the
        // state that was committed, in the shape the detail view expects.
        return tx.productionRun.findUnique({
            where: { id: req.params.id },
            include: {
                operator: true,
                machine: true,
                product: true,
                recipe: true,
                runParameterValues: {
                    orderBy: { machineParameter: { displayOrder: 'asc' } },
                    include: {
                        machineParameter: {
                            include: { parameter: true }
                        }
                    }
                },
                materialUsages: {
                    include: { material: true }
                }
            }
        })
    })

    res.json(run)
})

// ─── DELETE (transactional, reverses stock) ──────────────────────────────────

/**
 * Deletes a run and its child rows atomically, restoring material stock for
 * completed runs so the inventory movement recorded at completion is reversed.
 *
 * @param {import('express').Request} req - `params.id` is the run UUID.
 * @param {import('express').Response} res - 200 → confirmation; 404 unknown run; 500 on transaction failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // DELETE /api/production-runs/ab12…
 * // → 200 { message: "Production run deleted successfully" }
 */
router.delete('/:id', async (req, res) => {
    await prisma.$transaction(async (tx) => {
        // Lock the row before reading: SELECT ... FOR UPDATE blocks until any
        // concurrent transaction holding this row (e.g. /complete's updateMany
        // CAS) commits or rolls back, so this read always sees committed state,
        // never a stale pre-commit snapshot. Symmetrically: if THIS delete wins
        // the lock first, /complete's updateMany (WHERE status = 'in_progress')
        // blocks until this transaction's delete commits, then its WHERE
        // matches 0 rows against the now-vanished run and cleanly 404s.
        const locked = await tx.$queryRaw`
            SELECT "id" FROM "ProductionRun" WHERE "id" = ${req.params.id} FOR UPDATE
        `
        if (locked.length === 0) {
            throw new RunNotFoundError()
        }

        const run = await tx.productionRun.findUnique({
            where: { id: req.params.id },
            include: {
                materialUsages: true
            }
        })

        // Only completed runs ever decremented stock, so only they get it back.
        // Sequential loop for the same single-connection reason as /complete.
        if (run.status === 'completed' && run.materialUsages.length > 0) {
            for (const m of run.materialUsages) {
                await tx.material.update({
                    where: { id: m.materialId },
                    data: {
                        stockQty: {
                            increment: m.quantityUsed
                        }
                    }
                })
            }
        }

        // Child rows (parameter values, material usages) are removed by the
        // DB itself: their foreign keys are ON DELETE CASCADE.
        await tx.productionRun.delete({ where: { id: req.params.id } })
    })

    res.json({ message: 'Production run deleted successfully' })
})

export default router
