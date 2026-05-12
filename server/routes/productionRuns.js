import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all production runs with optional filters for machine, operator, product and date
router.get('/', async (req, res) => {
    try {
        const { machineId, operatorId, productId, date } = req.query
        const where = {}
        // Dynamically build the where clause based on provided filters
        // This allows us to use the same endpoint for various filter combinations without needing separate 
        // endpoints for each filter type.
        if (machineId) where.machineId = machineId
        if (operatorId) where.operatorId = operatorId
        if (productId) where.productId = productId
        if (date) {
            const filterDate = new Date(`${date}T00:00:00.000Z`)
            const filterDateEnd = new Date(`${date}T23:59:59.999Z`)
            where.date = { gte: filterDate, lte: filterDateEnd }
        }
        const runs = await prisma.productionRun.findMany({
            // We are using the dynamically built where clause to filter the production runs 
            // based on the query parameters provided in the request.
            where,
            orderBy: { date: 'desc' },
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

// GET method to fetch a single production run by ID with all related details
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

// POST method start a new production run with required fields and optional fields
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
        // Guard inactive operator
        const operator = await prisma.operator.findUnique({
            where: { id: operatorId }
        })

        // Guard future date
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

// PUT method to update a production run with optional fields (cannot change machine, operator, product or recipe)
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

// POST method to complete a production run with required fields and optional fields, also creates related parameter values, material usages and outputs in the same transaction
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

        // Check run exists and is not already completed
        const existing = await prisma.productionRun.findUnique({
            where: { id: req.params.id }
        })
        if (!existing) {
            return res.status(404).json({ error: 'Production run not found' })
        }
        if (existing.status === 'completed') {
            return res.status(400).json({ error: 'Production run is already completed' })
        }

        // Do everything in one transaction
        const run = await prisma.$transaction(async (tx) => {
            // Update the run itself
            const updatedRun = await tx.productionRun.update({
                where: { id: req.params.id },
                data: {
                    // When completing a run, we set the status to 'completed' 
                    status: 'completed',
                    endTime: new Date(endTime),
                    ...(energyEnd !== undefined && { energyEnd }),
                    ...(notes !== undefined && { notes })
                }
            })

            // Create parameter values
            await tx.runParameterValue.createMany({
                // We are creating related parameter values in one step using createMany for efficiency.
                // We are mapping the parameterValues array from the request body to the format expected by Prisma.
                data: parameterValues.map(p => ({
                    productionRunId: req.params.id,
                    machineParameterId: p.machineParameterId,
                    value: p.value
                }))
            })

            // Create material usages if provided
            if (materialUsages && materialUsages.length > 0) {
                await tx.materialUsage.createMany({
                    data: materialUsages.map(m => ({
                        productionRunId: req.params.id,
                        materialId: m.materialId,
                        quantityUsed: m.quantityUsed
                    }))
                })
            }

            // Deduct used quantities from material stock
            if (materialUsages && materialUsages.length > 0) {
                await Promise.all(
                    materialUsages.map(m =>
                        tx.material.update({
                            where: { id: m.materialId },
                            data: {
                                stockQty: {
                                    // We are using the decrement operation to reduce the stock quantity 
                                    // of the material by the quantity used in this production run.
                                    decrement: m.quantityUsed
                                }
                            }
                        })
                    )
                )
            }

            // Create outputs
            await tx.runOutput.createMany({
                data: outputs.map(o => ({
                    productionRunId: req.params.id,
                    productId: o.productId,
                    quantityProduced: o.quantityProduced,
                    ...(o.grossWeightKg !== undefined && { grossWeightKg: o.grossWeightKg }),
                    ...(o.scrapKg !== undefined && { scrapKg: o.scrapKg })
                }))
            })

            // Return the full completed run
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

export default router