import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all products for specific machine with product details
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

// POST link a product to a machine
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
        console.error('POST link a product to a machine Error:', error)
        res.status(500).json({ error: 'Failed to link product to machine' })
    }   
})

// DELETE unlink a product from a machine
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