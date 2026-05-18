/**
 * Handles MachineProduct compatibility routes for production setup.
 * Defines which products can be manufactured on each machine.
 * Prevents duplicate machine-product links with Prisma uniqueness.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /machine/:machineId
 *
 * Returns all product links for a machine with product details included for UI
 * display. Results are ordered by product name for predictable selection lists.
 *
 * @param {import('express').Request} req - Express request containing params.machineId.
 * @param {import('express').Response} res - Express response returning machine-product links.
 * @returns {Promise<void>} Sends 200 with links or 500 on Prisma read failure.
 */
router.get('/machine/:machineId', async (req, res) => {
    try {
        const links = await prisma.machineProduct.findMany({
            where: { machineId: req.params.machineId },
            orderBy: { product: { name: 'asc' } },
            include: { product: true }
        })
        res.json(links)
    } catch (error) {
        console.error('GET all products for specific machine with product details Error:', error)
        res.status(500).json({ error: 'Failed to fetch machine products' })
    }
})

/**
 * POST /
 *
 * Links a product to a machine. Prisma error P2002 is handled explicitly
 * because @@unique([machineId, productId]) prevents duplicate compatibility
 * links.
 *
 * @param {import('express').Request} req - Express request with body.machineId and body.productId.
 * @param {import('express').Response} res - Express response returning the created link.
 * @returns {Promise<void>} Sends 201, 400 for missing/duplicate values, or 500 on Prisma failure.
 * @throws {Prisma.PrismaClientKnownRequestError} P2002 when the machine-product link already exists.
 */
router.post('/', async (req, res) => {
    try {
        const { machineId, productId } = req.body
        if (!machineId || !productId) {
            return res.status(400).json({ error: 'machineId and productId are required' })
        }
        const link = await prisma.machineProduct.create({
            data: {
                machineId,  
                productId
            }
        })
        res.status(201).json(link)
    } catch (error) {
        // P2002 means the machine-product unique constraint already exists.
        if (error.code === 'P2002') {
        return res.status(400).json({ error: 'This product is already linked to this machine' })
        }
        console.error('POST link a product to a machine Error:', error)
        res.status(500).json({ error: 'Failed to link product to machine' })
    }   
})

/**
 * DELETE /:id
 *
 * Removes one machine-product compatibility link by link-table primary key.
 *
 * @param {import('express').Request} req - Express request containing params.id.
 * @param {import('express').Response} res - Express response returning a deletion message.
 * @returns {Promise<void>} Sends 200 or 500 on Prisma deletion failure.
 */
router.delete('/:id', async (req, res) => { 
    try {
        await prisma.machineProduct.delete({
            where: { id: req.params.id }
        })
        res.json({ message: 'Product unlinked from machine successfully' })
    } catch (error) {
        console.error('DELETE unlink a product from a machine Error:', error)
        res.status(500).json({ error: 'Failed to unlink product from machine' })
    }   
})

export default router
