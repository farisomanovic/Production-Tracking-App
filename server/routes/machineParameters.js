// This file handles the Many-to-Many relationship between Machines and Parameters.
// It allows users to define which parameters are associated with which machines.
// Routes are mounted at /api/machine-parameters in the main server.
// We are using Express to create a router, and Prisma to interact with the database. 
// The router is a object that we can attach HTTP method handlers to, and then export it to be used in our 
// main application file where we set up the Express app and define the base path for these routes.
import { Router } from 'express'
// We are importing the Prisma client instance from our prisma.js file, which allows us to perform 
// database operations in our route handlers.
import prisma from '../lib/prisma.js'

// We are creating a new router instance using the Router function from Express. 
// This router will be used to define our API endpoints for managing machine parameters.
const router = Router()

// GET method to fetch all parameters linked to a specific machine, ordered by displayOrder
router.get('/machine/:machineId', async (req, res) => {
    try {
        // We are using the Prisma client to query the machineParameter table for all entries that match the provided machineId.
        const links = await prisma.machineParameter.findMany({
            where: { machineId: req.params.machineId },
            // We are ordering the results by the displayOrder field in ascending order to ensure that 
            // the parameters are returned in the correct order for display.
            orderBy: { displayOrder: 'asc' },
            // We are including the related parameter data in the response by using the include option.
            // This allows us to access the details of each parameter directly in the response 
            // without needing to make additional queries.
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

// POST method to link a parameter to a machine. 
router.post('/', async (req, res) => {
    try {
        const { machineId, parameterId, displayOrder } = req.body
        if (!machineId || !parameterId) {
        return res.status(400).json({ error: 'machineId and parameterId are required' })
        }

        let finalDisplayOrder = displayOrder

        if (finalDisplayOrder === undefined) {
            // If displayOrder is not provided, we take the last displayOrder for the machine.
            const existing = await prisma.machineParameter.findMany({
                where: { machineId },
                orderBy: { displayOrder: 'desc' },
                take: 1
            })
            // We set the displayOrder for the new link to be one greater than the last displayOrder, or 0 if there are no existing links.
            // Note: This simple 'last + 1' logic assumes sequential updates. For high-concurrency environments, 
            // consider a transaction or a database-level sequence. If 2 people do this at the same time, 
            // they might get the same displayOrder, which could cause issues with ordering.
            finalDisplayOrder = existing.length > 0 ? existing[0].displayOrder + 1 : 0
        }

        // We are using the Prisma client to create a new entry in the machineParameter table with the provided machineId, parameterId, and displayOrder.
        const link = await prisma.machineParameter.create({
        data: {
            machineId,
            parameterId,
            displayOrder: finalDisplayOrder
        },
        // We are including the related parameter data in the response by using the include option, similar to the GET method.
        include: {
            parameter: true
        }
        })
        res.status(201).json(link)
    } catch (error) {
        // We are checking if the error code is P2002, which indicates a unique constraint violation. 
        // This would occur if we try to link the same parameter to the same machine more than once.
        if (error.code === 'P2002') {
        return res.status(400).json({ error: 'This parameter is already linked to this machine' })
        }
        console.error('POST link a parameter to a machine /machine-parameters error:', error)
        res.status(500).json({ error: 'Failed to link parameter to machine' })
    }
})

// PUT method to update the displayOrder of a parameter linked to a machine.
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

// DELETE method to unlink a parameter from a machine by deleting the corresponding entry in the machineParameter table.
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
// We are exporting the router as the default export of this module, which allows us to import it in other 
// parts of the application and use it to handle requests to the /machine-parameters endpoint.
export default router