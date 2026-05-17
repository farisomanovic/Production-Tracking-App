import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /
 *
 * Returns production runs with optional machine, operator, product, and date
 * filters. Related master data is included so the client can render a complete
 * run summary without follow-up requests.
 */
router.get('/', async (req, res) => {
    try {
        const { machineId, operatorId, productId, dateFrom, dateTo, limit, status } = req.query
        const where = {}
        // Build one Prisma where object so any combination of filters can share this endpoint.
        if (machineId) where.machineId = machineId
        if (operatorId) where.operatorId = operatorId
        if (productId) where.productId = productId
        if (status) where.status = status 
        if (dateFrom || dateTo) {
            where.date = {
                ...(dateFrom && { gte: new Date(`${dateFrom}T00:00:00.000Z`) }),
                ...(dateTo && { lte: new Date(`${dateTo}T23:59:59.999Z`) })
            }
        }
        const runs = await prisma.productionRun.findMany({
            where,
            orderBy: { date: 'desc' },
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
 * GET /:id
 *
 * Returns one production run with the full set of related operational details:
 * recipe composition, recorded parameter values, material usage, and outputs.
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

/**
 * POST /
 *
 * Starts a production run. Required foreign keys identify the operator, machine,
 * product, and recipe being used; optional values capture setup details that
 * may not be known at run start.
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
        // Inactive operators remain in history, but cannot be assigned to new runs.
        const operator = await prisma.operator.findUnique({
            where: { id: operatorId }
        })

        // Reject future run dates because production runs represent actual shop-floor events.
        const selectedDate = new Date(date)
        const today = new Date()
        today.setUTCHours(23, 59, 59, 999)
        if (selectedDate > today) {
            return res.status(400).json({ error: 'Production run date cannot be in the future' })
        }

        if (!operator || !operator.active) {
            return res.status(400).json({ error: 'Operator is inactive or does not exist' })
        }

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
 * PUT /:id
 *
 * Updates mutable run fields only. Machine, operator, product, and recipe are
 * intentionally fixed after creation to preserve the run's production context.
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

/**
 * POST /:id/complete
 *
 * Completes a production run and records its measured parameters, consumed
 * materials, and outputs. All writes run inside one transaction so the run
 * cannot be marked completed without its related production data.
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

        // Validate state before writing related records to avoid duplicate completion data.
        const existing = await prisma.productionRun.findUnique({
            where: { id: req.params.id }
        })
        if (!existing) {
            return res.status(404).json({ error: 'Production run not found' })
        }
        if (existing.status === 'completed') {
            return res.status(400).json({ error: 'Production run is already completed' })
        }

        // Keep status, parameter values, material usage, stock deductions, and outputs atomic.
        const run = await prisma.$transaction(async (tx) => {
            const updatedRun = await tx.productionRun.update({
                where: { id: req.params.id },
                data: {
                    // Marking status here makes completion the authoritative state transition.
                    status: 'completed',
                    endTime: new Date(endTime),
                    ...(energyEnd !== undefined && { energyEnd }),
                    ...(notes !== undefined && { notes })
                }
            })

            await tx.runParameterValue.createMany({
                // createMany efficiently records the machine-specific measurements for this run.
                data: parameterValues.map(p => ({
                    productionRunId: req.params.id,
                    machineParameterId: p.machineParameterId,
                    value: p.value
                }))
            })

            // Material usage is optional because some runs may only record output and parameters.
            if (materialUsages && materialUsages.length > 0) {
                await tx.materialUsage.createMany({
                    data: materialUsages.map(m => ({
                        productionRunId: req.params.id,
                        materialId: m.materialId,
                        quantityUsed: m.quantityUsed
                    }))
                })
            }

            // Stock is decremented in the same transaction as usage logging to keep inventory aligned.
            if (materialUsages && materialUsages.length > 0) {
                await Promise.all(
                    materialUsages.map(m =>
                        tx.material.update({
                            where: { id: m.materialId },
                            data: {
                                stockQty: {
                                    decrement: m.quantityUsed
                                }
                            }
                        })
                    )
                )
            }

            // Outputs record sellable quantity and optional weight/scrap metrics for the run.
            await tx.runOutput.createMany({
                data: outputs.map(o => ({
                    productionRunId: req.params.id,
                    productId: o.productId,
                    quantityProduced: o.quantityProduced,
                    ...(o.grossWeightKg !== undefined && { grossWeightKg: o.grossWeightKg }),
                    ...(o.scrapKg !== undefined && { scrapKg: o.scrapKg })
                }))
            })

            // Return the completed aggregate shape expected by the detail view.
            return tx.productionRun.findUnique({
                where: { id: req.params.id },
                include: {
                    operator: true,
                    machine: true,
                    product: true,
                    recipe: true,
                    runParameterValues: {
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
        console.error('POST /production-runs/:id/complete error:', error)
        res.status(500).json({ error: 'Failed to complete production run' })
    }
})

/**
 * DELETE /:id
 *
 * Deletes a production run and all its related records atomically.
 * Material stock is restored to account for the reversed usage.
 */
router.delete('/:id', async (req, res) => {
    try {
        const run = await prisma.productionRun.findUnique({
            where: { id: req.params.id },
            include: {
                materialUsages: true
            }
        })

        if (!run) {
            return res.status(404).json({ error: 'Production run not found' })
        }

        await prisma.$transaction(async (tx) => {
            // Restore material stock if run was completed
            if (run.status === 'completed' && run.materialUsages.length > 0) {
                await Promise.all(
                    run.materialUsages.map(m =>
                        tx.material.update({
                            where: { id: m.materialId },
                            data: {
                                stockQty: {
                                    increment: m.quantityUsed
                                }
                            }
                        })
                    )
                )
            }

            // Delete related records first to avoid foreign key violations
            await tx.runParameterValue.deleteMany({ where: { productionRunId: req.params.id } })
            await tx.materialUsage.deleteMany({ where: { productionRunId: req.params.id } })
            await tx.runOutput.deleteMany({ where: { productionRunId: req.params.id } })

            // Delete the run itself
            await tx.productionRun.delete({ where: { id: req.params.id } })
        })

        res.json({ message: 'Production run deleted successfully' })

    } catch (error) {
        console.error('DELETE /production-runs/:id error:', error)
        res.status(500).json({ error: 'Failed to delete production run' })
    }
})

export default router
