import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all parameters for a specific machine
router.get('/machine/:machineId', async (req, res) => {
    try {
        const links = await prisma.machineParameter.findMany({
            where: { machineId: req.params.machineId },
            orderBy: { displayOrder: 'asc' },
            include: {
                parameter: true
            }
        })
        res.json(links)
    } catch (error) {
        console.error('GET all parameters for a specific machine /machine-parameters/machine/:machineId error:', error)
        res.status(500).json({ error: 'Failed to fetch machine parameters' })
    }
})

// POST link a parameter to a machine
router.post('/', async (req, res) => {
try {
    const { machineId, parameterId, displayOrder } = req.body
    if (!machineId || !parameterId) {
    return res.status(400).json({ error: 'machineId and parameterId are required' })
    }

    let finalDisplayOrder = displayOrder

    if (finalDisplayOrder === undefined) {
    const existing = await prisma.machineParameter.findMany({
        where: { machineId },
        orderBy: { displayOrder: 'desc' },
        take: 1
    })
    finalDisplayOrder = existing.length > 0 ? existing[0].displayOrder + 1 : 0
    }

    const link = await prisma.machineParameter.create({
    data: {
        machineId,
        parameterId,
        displayOrder: finalDisplayOrder
    },
    include: {
        parameter: true
    }
    })
    res.status(201).json(link)
} catch (error) {
    if (error.code === 'P2002') {
    return res.status(400).json({ error: 'This parameter is already linked to this machine' })
    }
    console.error('POST link a parameter to a machine /machine-parameters error:', error)
    res.status(500).json({ error: 'Failed to link parameter to machine' })
}
})

// PUT update displayOrder of a link
router.put('/:id', async (req, res) => {
    try {
        const { displayOrder } = req.body
        if (displayOrder === undefined) {
            return res.status(400).json({ error: 'displayOrder is required' })
        }
        const link = await prisma.machineParameter.update({
            where: { id: req.params.id },
            data: { displayOrder },
            include: {
                parameter: true
            }
        })
        res.json(link)
    } catch (error) {
        console.error('PUT update displayOrder of a link /machine-parameters/:id error:', error)
        res.status(500).json({ error: 'Failed to update machine parameter' })
    }
})

// DELETE unlink a parameter from a machine
router.delete('/:id', async (req, res) => {
    try {
        await prisma.machineParameter.delete({
            where: { id: req.params.id }
        })
        res.json({ message: 'Parameter unlinked from machine successfully' })
    } catch (error) {
        console.error('DELETE unlink a parameter from a machine /machine-parameters/:id error:', error)
        res.status(500).json({ error: 'Failed to unlink parameter from machine' })
    }
})

export default router