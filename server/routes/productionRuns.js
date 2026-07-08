/**
 * @file productionRuns.js
 * @description Routes for the transactional heart of the app: production runs.
 * Covers the two-step lifecycle (create as in_progress → complete with
 * measurements/materials/outputs), filtered listing, detail reads, and deletion
 * with stock reversal. Master-data CRUD does NOT belong here.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// Sentinels thrown inside a $transaction callback to signal business outcomes up
// to the route's catch block, distinguishing them from genuine DB/transaction
// failures. Throwing aborts the transaction, so nothing partial is ever committed.
class RunNotFoundError extends Error {}
class RunAlreadyCompletedError extends Error {}
class UnknownMaterialError extends Error {}
class InsufficientStockError extends Error {}

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
    try {
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
    } catch (error) {
        console.error('GET /production-runs error:', error)
        res.status(500).json({ error: 'Failed to fetch production runs' })
    }
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
    try {
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
            return res.status(404).json({ error: 'Production run not found' })
        }
        res.json(run)
    } catch (error) {
        console.error('GET /production-runs/:id error:', error)
        res.status(500).json({ error: 'Failed to fetch production run' })
    }
})

// ─── CREATE & UPDATE ─────────────────────────────────────────────────────────

/**
 * Starts a run (status defaults to in_progress in the schema). This is the
 * write that happens after wizard Step 2 — measurements come later at /complete.
 *
 * @param {import('express').Request} req - Required body: `date`, `startTime`, `operatorId`, `machineId`,
 * `productId`, `recipeId`. Optional: `warmupStartTime`, `stableStartTime`, `energyStart`, `notes`, `potentialBuyer`.
 * @param {import('express').Response} res - 201 → created run with relations; 400 on validation failure; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/production-runs
 * // { "date": "2026-07-04T00:00:00.000Z", "startTime": "2026-07-04T08:30:00.000",
 * //   "operatorId": "b3f1…", "machineId": "7cd0…", "productId": "c771…", "recipeId": "d1e2…" }
 * // → 201 { id: "ab12…", status: "in_progress", … }
 */
router.post('/', async (req, res) => {
    try {
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
        const operator = await prisma.operator.findUnique({
            where: { id: operatorId }
        })

        // Runs record real shop-floor events, so future dates are operator error.
        // setUTCHours(23,59,59) makes "today anywhere on Earth" pass regardless of
        // the server's timezone — a deliberate loose bound.
        const selectedDate = new Date(date)
        const today = new Date()
        today.setUTCHours(23, 59, 59, 999)
        if (selectedDate > today) {
            return res.status(400).json({ error: 'Production run date cannot be in the future' })
        }

        // Inactive operators keep their history but must not appear on new runs —
        // this is the server-side backstop for the client's dropdown filter.
        if (!operator || !operator.active) {
            return res.status(400).json({ error: 'Operator is inactive or does not exist' })
        }

        // TODO: asymmetry — the operator is checked for existence AND active, the
        // machine for neither: a deactivated machine is accepted silently and a
        // nonexistent one becomes P2003 → 500. Mirror the operator check.
        // todo.md Group 3 #2.
        // TODO: machineId/productId/recipeId are trusted independently — nothing
        // verifies the MachineProduct link exists or that recipe.productId matches,
        // so a "Frankenstein" run can be created via direct API call.
        // todo.md Group 3 #7.
        // TODO: new Date() on unparseable strings produces Invalid Date → Prisma
        // throws → 500. Guard with Number.isNaN(d.getTime()) → 400. Group 3 #4.
        const run = await prisma.productionRun.create({
            data: {
                date: new Date(date),
                startTime: new Date(startTime),
                operatorId,
                machineId,
                productId,
                recipeId,
                ...(warmupStartTime !== undefined && { warmupStartTime: new Date(warmupStartTime) }),
                ...(stableStartTime !== undefined && { stableStartTime: new Date(stableStartTime) }),
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
        console.error('POST /production-runs error:', error)
        res.status(500).json({ error: 'Failed to create production run' })
    }
})

/**
 * Updates a run's mutable fields. The four foreign keys are deliberately NOT
 * accepted — swapping the machine or recipe after creation would detach the
 * run from the context its measurements were recorded under.
 *
 * @param {import('express').Request} req - `params.id` UUID; any subset of `notes`, `potentialBuyer`,
 * `warmupStartTime`, `stableStartTime`, `energyStart`, `energyEnd`, `endTime`.
 * @param {import('express').Response} res - 200 → updated run with relations; 500 on failure (including unknown id).
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/production-runs/ab12…  { "potentialBuyer": "Bingo d.o.o." }
 * // → 200 { id: "ab12…", potentialBuyer: "Bingo d.o.o.", … }
 */
router.put('/:id', async (req, res) => {
    try {
        const {
            notes,
            potentialBuyer,
            warmupStartTime,
            stableStartTime,
            energyStart,
            energyEnd,
            endTime
        } = req.body

        // TODO: no UI calls this endpoint yet (the client's updateRun helper is
        // unused) — run headers are uneditable after creation. Either build the
        // edit screen or drop the route. todo.md Group 8 #2.
        const run = await prisma.productionRun.update({
            where: { id: req.params.id },
            data: {
                ...(notes !== undefined && { notes }),
                ...(potentialBuyer !== undefined && { potentialBuyer }),
                ...(warmupStartTime !== undefined && { warmupStartTime: new Date(warmupStartTime) }),
                ...(stableStartTime !== undefined && { stableStartTime: new Date(stableStartTime) }),
                ...(energyStart !== undefined && { energyStart }),
                ...(energyEnd !== undefined && { energyEnd }),
                ...(endTime !== undefined && { endTime: new Date(endTime) })
            },
            include: {
                operator: true,
                machine: true,
                product: true,
                recipe: true
            }
        })
        res.json(run)
    } catch (error) {
        console.error('PUT /production-runs/:id error:', error)
        res.status(500).json({ error: 'Failed to update production run' })
    }
})

// ─── COMPLETE (transactional) ────────────────────────────────────────────────

/**
 * Completes a run: flips status, stores measured parameters, material usage,
 * and outputs, and decrements material stock — all in ONE transaction so a
 * run can never be "completed" with only half its production data saved.
 *
 * @param {import('express').Request} req - `params.id` UUID. Body: `endTime` (required),
 * `parameterValues[]` ({ machineParameterId, value }, min 1), `outputs[]`
 * ({ productId, quantityProduced, grossWeightKg?, scrapKg? }, min 1),
 * `materialUsages[]` optional, `energyEnd`/`notes` optional.
 * @param {import('express').Response} res - 200 → completed run aggregate; 400 invalid payload;
 * 404 unknown run; 409 already completed or insufficient stock; 500 on transaction failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/production-runs/ab12…/complete
 * // { "endTime": "2026-07-04T14:30:00.000",
 * //   "parameterValues": [{ "machineParameterId": "31f0…", "value": 210 }],
 * //   "materialUsages": [{ "materialId": "a9d2…", "quantityUsed": 480 }],
 * //   "outputs": [{ "productId": "c771…", "quantityProduced": 500, "grossWeightKg": 510, "scrapKg": 10 }] }
 * // → 200 { id: "ab12…", status: "completed", … }
 */
router.post('/:id/complete', async (req, res) => {
    try {
        const { endTime, energyEnd, notes, parameterValues, materialUsages, outputs } = req.body

        if (!endTime) {
            return res.status(400).json({ error: 'endTime is required to complete a run' })
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
            if ((o.grossWeightKg !== undefined && (!isFiniteNumber(o.grossWeightKg) || o.grossWeightKg < 0)) ||
                (o.scrapKg !== undefined && (!isFiniteNumber(o.scrapKg) || o.scrapKg < 0))) {
                return res.status(400).json({ error: 'grossWeightKg and scrapKg must be numbers of at least 0 when provided' })
            }
        }

        // TODO: no relational validation of the payload — parameterValues can
        // reference another machine's machineParameterId, outputs.productId isn't
        // checked against MachineProduct, and a duplicated machineParameterId in
        // one payload hits @@unique → raw 500. todo.md Group 3 #6.
        // TODO: no endTime > startTime check — combined with the client gluing
        // endTime onto the START date, every overnight run (22:00→02:00) is stored
        // ending before it began. todo.md Group 6 #2.
        const run = await prisma.$transaction(async (tx) => {
            // Compare-and-swap: the status check and the flip are ONE atomic
            // UPDATE ... WHERE status = 'in_progress'. Concurrent completions
            // serialize on the row lock — the loser re-evaluates the WHERE
            // against the winner's committed row, matches 0 rows, and aborts.
            const { count } = await tx.productionRun.updateMany({
                where: { id: req.params.id, status: 'in_progress' },
                data: {
                    status: 'completed',
                    endTime: new Date(endTime),
                    ...(energyEnd !== undefined && { energyEnd }),
                    ...(notes !== undefined && { notes })
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
                    quantityProduced: o.quantityProduced,
                    ...(o.grossWeightKg !== undefined && { grossWeightKg: o.grossWeightKg }),
                    ...(o.scrapKg !== undefined && { scrapKg: o.scrapKg })
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
    } catch (error) {
        if (error instanceof RunNotFoundError) {
            return res.status(404).json({ error: 'Production run not found' })
        }
        // 409 Conflict, not 400: the request was well-formed — it lost a race
        // against the current state of the resource (someone completed the run
        // first, or stock ran out under it).
        if (error instanceof RunAlreadyCompletedError) {
            return res.status(409).json({ error: 'Production run is already completed' })
        }
        if (error instanceof InsufficientStockError) {
            return res.status(409).json({ error: error.message })
        }
        if (error instanceof UnknownMaterialError) {
            return res.status(400).json({ error: 'One of the materials in materialUsages does not exist' })
        }
        console.error('POST /production-runs/:id/complete error:', error)
        res.status(500).json({ error: 'Failed to complete production run' })
    }
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
    try {
        await prisma.$transaction(async (tx) => {
            // Read inside the transaction so the status/materialUsages snapshot
            // used below can't go stale from a /complete committing in between.
            const run = await tx.productionRun.findUnique({
                where: { id: req.params.id },
                include: {
                    materialUsages: true
                }
            })

            if (!run) {
                throw new RunNotFoundError()
            }

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

    } catch (error) {
        if (error instanceof RunNotFoundError) {
            return res.status(404).json({ error: 'Production run not found' })
        }
        console.error('DELETE /production-runs/:id error:', error)
        res.status(500).json({ error: 'Failed to delete production run' })
    }
})

export default router
