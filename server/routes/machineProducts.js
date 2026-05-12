// This file handles the Many-to-Many relationship between Machines and Products.
// It allows users to define which products are compatible with which machines.
// Routes are mounted at /api/machine-products in the main server.
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET method to fetch all products linked to a specific machine, ordered by product name
router.get('/machine/:machineId', async (req, res) => {
    try {
        const links = await prisma.machineProduct.findMany({
            where: { machineId: req.params.machineId },
            // We are ordering the results by the name of the related product in ascending order to ensure that 
            // the products are returned in alphabetical order for display.
            orderBy: { product: { name: 'asc' } },
            // We are including the related product data in the response by using the include option.
            // This allows us to access the details of each product directly in the response 
            // without needing to make additional queries.
            include: { product: true }
        })
        res.json(links)
    } catch (error) {
        console.error('GET all products for specific machine with product details Error:', error)
        res.status(500).json({ error: 'Failed to fetch machine products' })
    }
})

// POST method to link a product to a machine.
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
        if (error.code === 'P2002') {
        return res.status(400).json({ error: 'This product is already linked to this machine' })
        }
        console.error('POST link a product to a machine Error:', error)
        res.status(500).json({ error: 'Failed to link product to machine' })
    }   
})

// DELETE method to unlink a product from a machine by deleting the corresponding entry in the machineProduct table.
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