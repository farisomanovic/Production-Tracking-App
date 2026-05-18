/**
 * Handles MachineParameter assignment routes for machine forms.
 * Defines which process parameters are collected per machine.
 * Maintains displayOrder values used by the production-run wizard.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /machine/:machineId
 *
 * Returns the parameter links for a machine, including parameter metadata.
 * displayOrder controls the order in which fields appear on production forms.
 *
 * @param {import('express').Request} req - Express request containing params.machineId.
 * @param {import('express').Response} res - Express response returning machine-parameter links.
 * @returns {Promise<void>} Sends 200 with ordered links or 500 on Prisma read failure.
 */
router.get('/machine/:machineId', async (req, res) => {
    try {
        const links = await prisma.machineParameter.findMany({
            where: { machineId: req.params.machineId },
            // displayOrder is the persisted UI order used by setup forms and run entry.
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

/**
 * POST /
 *
 * Links a parameter to a machine. If displayOrder is omitted, the next available
 * order is derived from the current highest value for that machine.
 *
 * @param {import('express').Request} req - Express request with machineId, parameterId, and optional displayOrder.
 * @param {import('express').Response} res - Express response returning the created link.
 * @returns {Promise<void>} Sends 201, 400 for validation/duplicate links, or 500 on Prisma failure.
 * @throws {Prisma.PrismaClientKnownRequestError} P2002 when machineId/parameterId or machineId/displayOrder is duplicated.
 */
router.post('/', async (req, res) => {
    try {
        const { machineId, parameterId, displayOrder } = req.body
        if (!machineId || !parameterId) {
        return res.status(400).json({ error: 'machineId and parameterId are required' })
        }

        let finalDisplayOrder = displayOrder

        if (finalDisplayOrder === undefined) {
            // Read the current last position so the new parameter appears at the end of the form.
            const existing = await prisma.machineParameter.findMany({
                where: { machineId },
                orderBy: { displayOrder: 'desc' },
                take: 1
            })
            // This simple "last + 1" strategy assumes sequential writes; concurrent inserts
            // can still collide with @@unique([machineId, displayOrder]).
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
        // P2002 covers unique constraint collisions, including duplicate parameter links.
        if (error.code === 'P2002') {
        return res.status(400).json({ error: 'This parameter is already linked to this machine' })
        }
        console.error('POST link a parameter to a machine /machine-parameters error:', error)
        res.status(500).json({ error: 'Failed to link parameter to machine' })
    }
})

/**
 * PUT /:id
 *
 * Updates the display order for one machine-parameter link.
 *
 * @param {import('express').Request} req - Express request containing params.id and body.displayOrder.
 * @param {import('express').Response} res - Express response returning the updated link.
 * @returns {Promise<void>} Sends 200, 400 when displayOrder is missing, or 500 on Prisma failure.
 * @throws {Prisma.PrismaClientKnownRequestError} P2002 when the target displayOrder is already used for the machine.
 */
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

/**
 * DELETE /:id
 *
 * Removes one machine-parameter link by link-table primary key.
 *
 * @param {import('express').Request} req - Express request containing params.id.
 * @param {import('express').Response} res - Express response returning a deletion message.
 * @returns {Promise<void>} Sends 200 or 500 on Prisma deletion failure.
 */
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
