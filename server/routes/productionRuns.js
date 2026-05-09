import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all production runs
router.get('/', async (req, res) => {
    try {
        const { machineId, operatorId, productId, date } = req.query
        const where = {}
        if (machineId) where.machineId = machineId
        if (operatorId) where.operatorId = operatorId
        if (productId) where.productId = productId
        if (date) {
            const start = new Date(date)
            start.setHours(0, 0, 0, 0)
            const end = new Date(date)
            end.setHours(23, 59, 59, 999)
            where.date = { gte: start, lte: end }
        }
        const runs = await prisma.productionRun.findMany({
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

// GET single production run by id
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

// POST start a new production run
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

// PUT update a production run
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

// POST complete a production run
router.post('/:id/complete', async (req, res) => {
    try {
        const { endTime, energyEnd, notes, parameterValues, materialUsages, outputs } = req.body

        // Guard required fields
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
                    status: 'completed',
                    endTime: new Date(endTime),
                    ...(energyEnd !== undefined && { energyEnd }),
                    ...(notes !== undefined && { notes })
                }
            })

            // Create parameter values
            await tx.runParameterValue.createMany({
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