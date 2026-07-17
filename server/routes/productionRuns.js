/**
 * @file productionRuns.js
 * @description Routes for the transactional heart of the app: production runs.
 * Covers the two-step lifecycle (create as in_progress → complete with
 * measurements/materials/outputs), filtered listing, detail reads, and deletion
 * with stock reversal. Master-data CRUD does NOT belong here.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
    RunNotFoundError,
    RunAlreadyCompletedError,
    UnknownMaterialError,
    InsufficientStockError
} from '../lib/errors.js'
import { hasDuplicates, allBelongTo } from '../lib/validation.js'

const router = Router()

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
    return parsed
}

// ─── LIST & DETAIL ───────────────────────────────────────────────────────────

/**
 * Lists runs with optional filters, relations included so the list page can
 * render names without follow-up requests.
 *
 * @param {import('express').Request} req - Optional query: `machineId`, `operatorId`, `productId`,
 * `status` ("in_progress" | "completed"), `dateFrom`/`dateTo` (YYYY-MM-DD), `limit` (positive int).
 * @param {import('express').Response} res - 200 → ProductionRun[] newest-first; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/production-runs?machineId=7cd0…&status=completed&limit=1
 * // → 200 [{ id: "ab12…", date: "2026-07-01T00:00:00.000Z", status: "completed",
 * //          machine: { name: "Extruder 1" }, operator: { name: "Amar" }, … }]
 */
router.get('/', async (req, res) => {
    const { machineId, operatorId, productId, dateFrom, dateTo, limit, status } = req.query
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
        // TODO: the client builds "today" in UTC too — between midnight and
        // ~02:00 local (Sarajevo is UTC+1/+2) that's still yesterday. Group 6.
        where.date = {
            ...(dateFrom && { gte: new Date(`${dateFrom}T00:00:00.000Z`) }),
            ...(dateTo && { lte: new Date(`${dateTo}T23:59:59.999Z`) })
        }
    }
    const runs = await prisma.productionRun.findMany({
        where,
        // TODO: `date` is date-only, so all same-day runs TIE and Postgres may
        // return them in any order — the "prefill from last run" feature
        // (limit: 1) can get any run from the latest day, not the latest run.
        // Add a startTime tiebreaker: orderBy: [{date:'desc'},{startTime:'desc'}].
        // todo.md Group 4 #4.
        orderBy: { date: 'desc' },
        // TODO: Number("abc") is NaN and makes Prisma throw a 500 — parse and
        // validate limit first. Also: no default cap, the list grows unbounded.
        // todo.md Group 4 #2 and #4.
        ...(limit && { take: Number(limit) }),
        include: {
            operator: true,
            machine: true,
            product: true,
            recipe: true
        }
    })
    res.json(runs)
})

/**
 * Fetches one run with every relation the detail page needs: recipe
 * composition, measured parameter values, material usage, and outputs.
 *
 * @param {import('express').Request} req - `params.id` is the run UUID.
 * @param {import('express').Response} res - 200 → full run aggregate; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/production-runs/ab12…
 * // → 200 { id: "ab12…", status: "completed",
 * //          runParameterValues: [{ value: 210, machineParameter: { parameter: { name: "Melt temp" } } }],
 * //          materialUsages: [{ quantityUsed: 480, material: { name: "PP granulat" } }],
 * //          runOutputs: [{ quantityProduced: 500, product: { name: "PP traka 12mm" } }] }
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
            },
            runOutputs: {
                include: { product: true }
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

    const [operator, machine, machineProductLink, recipe, activeRunOnMachine] = await Promise.all([
        prisma.operator.findUnique({ where: { id: operatorId } }),
        prisma.machine.findUnique({ where: { id: machineId } }),
        // Existence of this link proves both that productId is real and that
        // the machine is configured to make it — the wizard's dropdowns already
        // enforce this, this is the backstop for direct API calls.
        prisma.machineProduct.findFirst({ where: { machineId, productId } }),
        prisma.recipe.findUnique({ where: { id: recipeId } }),
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
    if (recipe.productId !== productId) {
        return res.status(400).json({ error: 'Recipe does not belong to the selected product' })
    }

    if (activeRunOnMachine) {
        return res.status(400).json({ error: 'Machine already has a run in progress' })
    }

    try {
        const run = await prisma.productionRun.create({
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
 * warmupStartTime/stableStartTime/endTime, or an endTime at/before startTime; 404 unknown id;
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

    // A completed run is meant to be an immutable log of what happened on
    // the floor, and endTime must obey the same > startTime rule /complete
    // enforces below — this route skipped both checks.
    const existing = await prisma.productionRun.findUnique({
        where: { id: req.params.id },
        select: { startTime: true, status: true }
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

    // TODO: no UI calls this endpoint yet (the client's updateRun helper is
    // unused) — run headers are uneditable after creation. Either build the
    // edit screen or drop the route. todo.md Group 8 #2.
    const run = await prisma.productionRun.update({
        where: { id: req.params.id },
        data: {
            ...(notes !== undefined && { notes }),
            ...(potentialBuyer !== undefined && { potentialBuyer }),
            ...(parsedWarmupStartTime !== undefined && { warmupStartTime: parsedWarmupStartTime }),
            ...(parsedStableStartTime !== undefined && { stableStartTime: parsedStableStartTime }),
            ...(energyStart !== undefined && { energyStart }),
            ...(energyEnd !== undefined && { energyEnd }),
            ...(parsedEndTime !== undefined && { endTime: parsedEndTime })
        },
        include: {
            operator: true,
            machine: true,
            product: true,
            recipe: true
        }
    })
    res.json(run)
})

// ─── COMPLETE (transactional) ────────────────────────────────────────────────

/**
 * Completes a run: flips status, stores measured parameters, material usage,
 * and outputs, and decrements material stock — all in ONE transaction so a
 * run can never be "completed" with only half its production data saved.
 *
 * @param {import('express').Request} req - `params.id` UUID. Body: `endTime` (required),
 * `parameterValues[]` ({ machineParameterId, value }, min 1), `outputs[]`
 * ({ productId, quantityProduced }, min 1), `materialUsages[]` optional,
 * `energyEnd`/`notes` optional, run-level weights `netWeightPerUnit`/
 * `grossWeightPerUnit`/`scrapKg` optional (numbers ≥ 0).
 * @param {import('express').Response} res - 200 → completed run aggregate; 400 invalid payload
 * (including an unparseable endTime, one at/before the run's startTime, a duplicate id within
 * `parameterValues`/`materialUsages`, or any id that doesn't belong to this run's machine/recipe);
 * 404 unknown run; 409 already completed or insufficient stock; 500 on transaction failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/production-runs/ab12…/complete
 * // { "endTime": "2026-07-04T14:30:00.000",
 * //   "parameterValues": [{ "machineParameterId": "31f0…", "value": 210 }],
 * //   "materialUsages": [{ "materialId": "a9d2…", "quantityUsed": 480 }],
 * //   "outputs": [{ "productId": "c771…", "quantityProduced": 500 }],
 * //   "netWeightPerUnit": 1.5, "grossWeightPerUnit": 1.6, "scrapKg": 10 }
 * // → 200 { id: "ab12…", status: "completed", … }
 */
router.post('/:id/complete', async (req, res) => {
    const { endTime, energyEnd, notes, parameterValues, materialUsages, outputs,
        netWeightPerUnit, grossWeightPerUnit, scrapKg } = req.body

    if (!endTime) {
        return res.status(400).json({ error: 'endTime is required to complete a run' })
    }
    // Parse endTime up front: an unparseable string gives Invalid Date, and
    // since NaN compares false to everything, it would sail past the
    // startTime check below and blow up inside Prisma as a 500.
    const end = new Date(endTime)
    if (Number.isNaN(end.getTime())) {
        return res.status(400).json({ error: 'endTime is not a valid timestamp' })
    }
    // A run cannot end at or before the moment it started. The client rolls
    // overnight end times to the next day; this is the backstop for direct
    // API calls and client bugs. startTime is immutable after creation
    // (PUT never accepts it), so this pre-transaction read cannot go stale.
    // Also pulls the run's machine/recipe context (their parameter list,
    // product whitelist, and recipe items) in the same round trip — narrowed
    // to just the id fields the relational checks below actually read, since
    // these collections scale with how much a machine/recipe has configured.
    const existing = await prisma.productionRun.findUnique({
        where: { id: req.params.id },
        select: {
            startTime: true,
            machine: {
                select: {
                    machineParameters: { select: { id: true } },
                    machineProducts: { select: { productId: true } }
                }
            },
            recipe: {
                select: {
                    recipeItems: { select: { materialId: true } }
                }
            }
        }
    })
    if (!existing) {
        throw new RunNotFoundError()
    }
    if (end <= existing.startTime) {
        return res.status(400).json({ error: 'endTime must be after the run start time' })
    }
    if (!parameterValues || !Array.isArray(parameterValues) || parameterValues.length === 0) {
        return res.status(400).json({ error: 'At least one parameter value is required' })
    }
    if (!outputs || !Array.isArray(outputs) || outputs.length === 0) {
        return res.status(400).json({ error: 'At least one output is required' })
    }

    // Numeric validation BEFORE the transaction: a negative quantityUsed
    // would silently INCREMENT stock (decrement of a negative), and Prisma
    // stores NaN/strings as garbage or throws a raw 500. Parameter values
    // only need to be real numbers — a measured reading of 0 is legitimate.
    const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
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
    for (const o of outputs) {
        if (!o.productId || !isFiniteNumber(o.quantityProduced) || o.quantityProduced <= 0) {
            return res.status(400).json({ error: 'Each output needs a productId and a quantityProduced greater than 0' })
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
    // somewhere in the database — otherwise a parameter reading could be
    // filed under another machine's config, a material outside the run's
    // recipe could silently decrement unrelated stock, or an output could
    // record a product the machine isn't configured to make.
    const validMachineParameterIds = new Set(existing.machine.machineParameters.map(mp => mp.id))
    if (!allBelongTo(machineParameterIds, validMachineParameterIds)) {
        return res.status(400).json({ error: "One or more parameterValues reference a machine parameter that does not belong to this run's machine" })
    }
    const validProductIds = new Set(existing.machine.machineProducts.map(mp => mp.productId))
    if (!allBelongTo(outputs.map(o => o.productId), validProductIds)) {
        return res.status(400).json({ error: "One or more outputs reference a product not assigned to this run's machine" })
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

        await tx.runOutput.createMany({
            data: outputs.map(o => ({
                productionRunId: req.params.id,
                productId: o.productId,
                quantityProduced: o.quantityProduced
            }))
        })

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
                },
                runOutputs: {
                    include: { product: true }
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

        // Child rows (parameter values, usages, outputs) are removed by the
        // DB itself: their foreign keys are ON DELETE CASCADE.
        await tx.productionRun.delete({ where: { id: req.params.id } })
    })

    res.json({ message: 'Production run deleted successfully' })
})

export default router
