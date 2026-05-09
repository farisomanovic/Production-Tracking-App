import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all products
router.get('/', async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { name: 'asc' }
        })
    res.json(products)
    } catch (error) {
        console.error('GET /products error:', error)
        res.status(500).json({ error: 'Failed to fetch products' })
    }      
})

// GET single product by id
router.get('/:id', async (req, res) => {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id }
        })
        if (!product) {
            return res.status(404).json({ error: 'Product not found' })
        }
        res.json(product)
    } catch (error) {
        console.error('GET /products/:id error:', error)
        res.status(500).json({ error: 'Failed to fetch product' })
    }
})  

// POST create new product
router.post('/', async (req, res) => {
    try {
        const { name, code, widthMm, thicknessMm, lengthM, description, unit } = req.body
        if (!name || !unit) {
            return res.status(400).json({ error: 'name and unit are required' })
        }
        const product = await prisma.product.create({
            data: { name, code,
                ...(widthMm !== undefined && { widthMm }),
                ...(thicknessMm !== undefined && { thicknessMm }),
                ...(lengthM !== undefined && { lengthM }),
                ...(description !== undefined && { description }),
                unit }
        })
        res.status(201).json(product)
    } catch (error) {
        console.error('POST /products error:', error)
        res.status(500).json({ error: 'Failed to create product' })
    }       
})

// PUT update product 
router.put('/:id', async (req, res) => {
    try {
        const { name, code, widthMm, thicknessMm, lengthM, description, unit } = req.body
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: {     
                ...(name !== undefined && { name }),
                ...(code !== undefined && { code }),
                ...(widthMm !== undefined && { widthMm }),
                ...(thicknessMm !== undefined && { thicknessMm }),
                ...(lengthM !== undefined && { lengthM }),
                ...(description !== undefined && { description }),
                ...(unit !== undefined && { unit })
            }   
        })  
        res.json(product)
    } catch (error) {
        console.error('PUT /products error:', error)
        res.status(500).json({ error: 'Failed to update product ' })
    }       
})

export default router